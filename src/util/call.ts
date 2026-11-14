import type { Maybe } from '@iveri/contracts';
import {
    ChatCallEndReason,
    ChatCallParticipantState,
    ChatCallStatus,
    type ChatCall,
    type ChatCallParticipant,
} from '@iveri/contracts/chat';

/** Where a call stands for the person looking at it, which decides the whole call screen. */
export type ChatCallPhase = 'incoming' | 'outgoing' | 'connecting' | 'live' | 'ended';

/**
 * The phase of a call for me. `connected` is whether my own media reached the call server, which only the screen
 * holding the connection knows: an answered call is `connecting` until it has.
 */
export function callPhase(call: ChatCall, connected: boolean): ChatCallPhase {
    if (call.status === ChatCallStatus.ENDED) return 'ended';

    const me = callMe(call);

    if (call.status === ChatCallStatus.RINGING) {
        return me?.state === ChatCallParticipantState.RINGING ? 'incoming' : 'outgoing';
    }

    return connected ? 'live' : 'connecting';
}

export function callMe(call: ChatCall): Maybe<ChatCallParticipant> {
    return call.participants.find((participant) => participant.isMe) ?? null;
}

/** The other person in a call of two, named the way the conversation names them. */
export function callOther(call: ChatCall): Maybe<ChatCallParticipant> {
    return call.participants.find((participant) => !participant.isMe) ?? null;
}

/**
 * The line a call screen shows once a call is over, from where I sat: the caller is told the other person was busy,
 * declined or did not answer, and the person rung is simply told the call ended. `name` is the other person.
 */
export function callEndLine(call: ChatCall): { key: string; name: string } {
    const name = callOther(call)?.displayName ?? '';
    const iCalled = callMe(call)?.userId === call.startedBy;

    switch (call.endReason) {
        case ChatCallEndReason.BUSY:
            return { key: iCalled ? 'chat.call.busy' : 'chat.call.ended', name };
        case ChatCallEndReason.DECLINED:
            return { key: iCalled ? 'chat.call.declined' : 'chat.call.ended', name };
        case ChatCallEndReason.MISSED:
            return { key: iCalled ? 'chat.call.no-answer' : 'chat.call.ended', name };
        case ChatCallEndReason.FAILED:
            return { key: 'chat.call.failed', name };
        default:
            return { key: 'chat.call.ended', name };
    }
}

/** How long a call has lasted, as `m:ss` under an hour and `h:mm:ss` from one: what the notice writes, too. */
export function formatCallClock(milliseconds: number): string {
    const whole = Math.max(0, Math.floor(milliseconds / 1_000));
    const hours = Math.floor(whole / 3_600);
    const minutes = Math.floor((whole % 3_600) / 60);
    const seconds = String(whole % 60).padStart(2, '0');

    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}
