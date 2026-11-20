import {
    ChatCallEndReason,
    ChatCallKind,
    ChatCallParticipantState,
    ChatCallStatus,
    type ChatCall,
    type ChatCallParticipant,
} from '@iveri/contracts/chat';
import { describe, expect, it } from 'vitest';

import {
    CHAT_CALL_VIDEO_TILES,
    callCaller,
    callEndLine,
    callOther,
    callPeopleIn,
    callPhase,
    callRingLine,
    callTitle,
    formatCallClock,
    isCallFull,
    orderCallTiles,
} from './call.js';

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
        isGroup: false,
        title: null,
        maxParticipants: 2,
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

describe('group calls', () => {
    const ANA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const group = (overrides: Partial<ChatCall> & { me?: 'caller' | 'callee' } = {}): ChatCall => {
        const base = call(overrides);

        return {
            ...base,
            isGroup: true,
            title: 'Weekend',
            maxParticipants: 3,
            participants: [...base.participants, person(ANA, ChatCallParticipantState.RINGING, false)],
            ...overrides,
        };
    };

    it('still rings for me after somebody else answered, and is live once I am in the room', () => {
        const answered = group({ status: ChatCallStatus.ACTIVE, me: 'callee' });

        expect(callPhase(answered, false)).toBe('incoming');
        expect(callPhase(group({ status: ChatCallStatus.ACTIVE }), true)).toBe('live');
    });

    it('says who calls and where, and leads with the group’s title', () => {
        const translate = (key: string): string => `[${key}]`;

        expect(callRingLine(group({ me: 'callee' }), translate)).toEqual({
            key: 'chat.call.incoming-group',
            values: { kind: ChatCallKind.VIDEO, name: 'Nino', title: 'Weekend' },
        });
        expect(callRingLine(call({ me: 'callee' }), translate).key).toBe('chat.call.incoming');
        expect(callTitle(group(), translate)).toBe('Weekend');
        expect(callTitle(group({ title: 'chat.hr.team' }), translate)).toBe('[chat.hr.team]');
        expect(callTitle(call(), translate)).toBe('Giorgi');
        expect(callCaller(group())?.displayName).toBe('Nino');
    });

    it('counts who is in it, and is full at its limit', () => {
        const ringing = group();

        expect(callPeopleIn(ringing).map((p) => p.displayName)).toEqual(['Nino']);
        expect(isCallFull(ringing)).toBe(false);
        expect(
            isCallFull({
                ...ringing,
                participants: ringing.participants.map((p) => ({ ...p, state: ChatCallParticipantState.JOINED })),
            }),
        ).toBe(true);
    });

    it('tells the caller nobody joined, and everybody else that it ended', () => {
        for (const reason of [ChatCallEndReason.MISSED, ChatCallEndReason.DECLINED, ChatCallEndReason.BUSY]) {
            const ended = { status: ChatCallStatus.ENDED, endReason: reason };

            expect(callEndLine(group(ended)).key).toBe('chat.call.nobody-joined');
            expect(callEndLine(group({ ...ended, me: 'callee' })).key).toBe('chat.call.ended');
        }
        expect(callEndLine(group({ status: ChatCallStatus.ENDED, endReason: ChatCallEndReason.COMPLETED })).key).toBe(
            'chat.call.ended',
        );
    });
});

describe('orderCallTiles', () => {
    const tile = (identity: string, hasVideo: boolean, lastSpokeAt = 0) => ({
        identity,
        hasVideo,
        isSpeaking: false,
        lastSpokeAt,
    });

    it('puts video first, then whoever spoke last, keeping the room’s order otherwise', () => {
        const { tiles, more } = orderCallTiles([tile('a', false), tile('b', false, 5), tile('c', true), tile('d', false)]);

        expect(tiles.map((t) => t.identity)).toEqual(['c', 'b', 'a', 'd']);
        expect(more).toBe(0);
    });

    it('draws eight at most and counts the rest', () => {
        const people = Array.from({ length: 11 }, (_, index) => tile(String(index), false));
        const { tiles, more } = orderCallTiles(people);

        expect(tiles).toHaveLength(CHAT_CALL_VIDEO_TILES);
        expect(more).toBe(3);
    });
});
