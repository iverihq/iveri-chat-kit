import {
    ChatCallEndReason,
    ChatCallKind,
    ChatCallParticipantState,
    ChatCallStatus,
    type ChatCall,
    type ChatCallParticipant,
} from '@iveri/contracts/chat';
import { describe, expect, it } from 'vitest';

import { callEndLine, callOther, callPhase, formatCallClock } from './call.js';

const CALLER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CALLEE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const person = (userId: string, state: ChatCallParticipantState, isMe: boolean): ChatCallParticipant => ({
    userId: userId as ChatCallParticipant['userId'],
    displayName: userId === CALLER ? 'Nino' : 'Giorgi',
    avatar: null,
    state,
    joinedAt: null,
    leftAt: null,
    isMe,
});

const call = (overrides: Partial<ChatCall> & { me?: 'caller' | 'callee' } = {}): ChatCall => {
    const { me = 'caller', ...rest } = overrides;

    return {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        conversationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        kind: ChatCallKind.VIDEO,
        status: ChatCallStatus.RINGING,
        endReason: null,
        startedBy: CALLER,
        participants: [
            person(CALLER, ChatCallParticipantState.JOINED, me === 'caller'),
            person(CALLEE, ChatCallParticipantState.RINGING, me === 'callee'),
        ],
        ringExpiresAt: '2026-11-14T10:00:45.000Z',
        answeredAt: null,
        endedAt: null,
        createdAt: '2026-11-14T10:00:00.000Z',
        ...rest,
    };
};

describe('callPhase', () => {
    it('rings out for the caller and in for the person called', () => {
        expect(callPhase(call(), false)).toBe('outgoing');
        expect(callPhase(call({ me: 'callee' }), false)).toBe('incoming');
    });

    it('connects until the other person is in the room, and is live once they are', () => {
        const answered = call({ status: ChatCallStatus.ACTIVE });

        expect(callPhase(answered, false)).toBe('connecting');
        expect(callPhase(answered, true)).toBe('live');
        expect(callPhase(call({ status: ChatCallStatus.ENDED }), true)).toBe('ended');
    });
});

describe('callEndLine', () => {
    it('tells the caller why nobody answered, and the person called only that it ended', () => {
        for (const [reason, key] of [
            [ChatCallEndReason.BUSY, 'chat.call.busy'],
            [ChatCallEndReason.DECLINED, 'chat.call.declined'],
            [ChatCallEndReason.MISSED, 'chat.call.no-answer'],
            [ChatCallEndReason.FAILED, 'chat.call.failed'],
            [ChatCallEndReason.COMPLETED, 'chat.call.ended'],
        ] as const) {
            const ended = { status: ChatCallStatus.ENDED, endReason: reason };

            expect(callEndLine(call(ended))).toEqual({ key, name: 'Giorgi' });
            expect(callEndLine(call({ ...ended, me: 'callee' })).key).toBe(
                reason === ChatCallEndReason.FAILED ? 'chat.call.failed' : 'chat.call.ended',
            );
        }
    });

    it('names the other person, whichever side I am', () => {
        expect(callOther(call())?.displayName).toBe('Giorgi');
        expect(callOther(call({ me: 'callee' }))?.displayName).toBe('Nino');
    });
});

describe('formatCallClock', () => {
    it.each([
        [0, '0:00'],
        [9_999, '0:09'],
        [252_000, '4:12'],
        [3_725_000, '1:02:05'],
    ])('writes %s ms as %s', (ms, written) => {
        expect(formatCallClock(ms)).toBe(written);
    });
});
