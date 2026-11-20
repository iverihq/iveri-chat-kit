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
 * The phase of a call for me. `connected` is whether the call has reached the call server for me, which only the
 * screen holding the connection knows: an answered call is `connecting` until it has (between two people, until the
 * other person is in the room too; in a group, until I am). A group call somebody else answered still rings for me.
 */
export function callPhase(call: ChatCall, connected: boolean): ChatCallPhase {
    if (call.status === ChatCallStatus.ENDED) return 'ended';

    const me = callMe(call);

    if (me?.state === ChatCallParticipantState.RINGING) return 'incoming';
    if (call.status === ChatCallStatus.RINGING) return 'outgoing';

    return connected ? 'live' : 'connecting';
}

/** The most video tiles a group call screen draws at once: Roma's 8, which is what a phone can decode. */
export const CHAT_CALL_VIDEO_TILES = 8;

/** Who started a call. */
export function callCaller(call: ChatCall): Maybe<ChatCallParticipant> {
    return call.participants.find((participant) => participant.userId === call.startedBy) ?? null;
}

/** The people in a call now: those who answered or joined it and have not left. */
export function callPeopleIn(call: ChatCall): ChatCallParticipant[] {
    return call.participants.filter((participant) => participant.state === ChatCallParticipantState.JOINED);
}

/** Whether a group call already has as many people in it as it takes. */
export function isCallFull(call: ChatCall): boolean {
    return callPeopleIn(call).length >= call.maxParticipants;
}

/**
 * The name a call screen leads with: the other person between two, and the group's title in a group. A product's
 * title that is a `chat.` key is translated, as a thread's heading is.
 */
export function callTitle(call: ChatCall, translate: (key: string) => string): string {
    if (!call.isGroup) return callOther(call)?.displayName ?? '';

    const title = call.title ?? '';

    return title.startsWith('chat.') ? translate(title) : title;
}

/** What the incoming-call card says: who is calling, and in a group where. */
export function callRingLine(
    call: ChatCall,
    translate: (key: string) => string,
): { key: 'chat.call.incoming' | 'chat.call.incoming-group'; values: Record<string, string> } {
    if (!call.isGroup) {
        return { key: 'chat.call.incoming', values: { kind: call.kind, name: callOther(call)?.displayName ?? '' } };
    }

    return {
        key: 'chat.call.incoming-group',
        values: {
            kind: call.kind,
            name: callCaller(call)?.displayName ?? '',
            title: callTitle(call, translate),
        },
    };
}

/** One person in a group call's room, as the media layer sees them. */
export interface ChatCallTileCandidate {
    /** Their identity in the room, which is their user id. */
    identity: string;
    hasVideo: boolean;
    isSpeaking: boolean;
    /** When they last spoke, by the room's clock; 0 if never. */
    lastSpokeAt: number;
}

/**
 * Which people a group call screen draws as tiles, and how many more there are. People showing video come first,
 * then whoever spoke most recently, so the person talking is on screen; ties keep the room's order, so a tile does not
 * jump while nobody speaks. At most `limit` tiles.
 */
export function orderCallTiles<T extends ChatCallTileCandidate>(
    people: readonly T[],
    limit = CHAT_CALL_VIDEO_TILES,
): { tiles: T[]; more: number } {
    const ordered = people
        .map((person, index) => ({ person, index }))
        .sort((a, b) => {
            if (a.person.hasVideo !== b.person.hasVideo) return a.person.hasVideo ? -1 : 1;
            if (a.person.lastSpokeAt !== b.person.lastSpokeAt) return b.person.lastSpokeAt - a.person.lastSpokeAt;

            return a.index - b.index;
        })
        .map(({ person }) => person);

    return { tiles: ordered.slice(0, limit), more: Math.max(0, ordered.length - limit) };
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
 * declined or did not answer (in a group, that nobody joined), and the person rung is simply told the call ended.
 * `name` is the other person.
 */
export function callEndLine(call: ChatCall): { key: string; name: string } {
    const name = callOther(call)?.displayName ?? '';
    const iCalled = callMe(call)?.userId === call.startedBy;

    // In a group the caller is told that nobody came, however that came about; everybody else that it ended.
    if (call.isGroup) {
        if (call.endReason === ChatCallEndReason.FAILED) return { key: 'chat.call.failed', name };
        if (call.endReason !== ChatCallEndReason.COMPLETED && iCalled) return { key: 'chat.call.nobody-joined', name };

        return { key: 'chat.call.ended', name };
    }

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
