import {
    ChatCallDirection,
    ChatCallEndReason,
    ChatCallKind,
    ChatCallStatus,
    type ChatCallHistoryEntry,
} from '@iveri/contracts/chat';
import { describe, expect, it } from 'vitest';

import { CONVERSATION, uuid } from '../testing/fixtures.js';

import { callHistoryDuration, callHistoryOutcome } from './call-history.js';

const entry = (overrides: Partial<ChatCallHistoryEntry>): ChatCallHistoryEntry => ({
    id: uuid(),
    conversationId: CONVERSATION,
    kind: ChatCallKind.VOICE,
    status: ChatCallStatus.ENDED,
    endReason: ChatCallEndReason.COMPLETED,
    direction: ChatCallDirection.INCOMING,
    isGroup: false,
    title: 'Nino Beridze',
    avatar: null,
    other: null,
    isMissed: false,
    durationSeconds: 65,
    participantCount: 2,
    createdAt: '2026-11-21T10:00:00.000Z',
    endedAt: '2026-11-21T10:01:05.000Z',
    ...overrides,
});

describe('call history', () => {
    it('says from my side what each call was', () => {
        expect(callHistoryOutcome(entry({ status: ChatCallStatus.ACTIVE, endReason: null }))).toBe('ongoing');
        expect(callHistoryOutcome(entry({ isMissed: true, endReason: ChatCallEndReason.MISSED }))).toBe('missed');
        expect(callHistoryOutcome(entry({}))).toBe('incoming');
        expect(callHistoryOutcome(entry({ endReason: ChatCallEndReason.DECLINED, durationSeconds: null }))).toBe(
            'declined',
        );
        expect(callHistoryOutcome(entry({ direction: ChatCallDirection.OUTGOING }))).toBe('outgoing');
        expect(
            callHistoryOutcome(entry({ direction: ChatCallDirection.OUTGOING, endReason: ChatCallEndReason.BUSY })),
        ).toBe('not-answered');
    });

    it('trusts the server on missed, so my own call is never drawn as missed', () => {
        expect(
            callHistoryOutcome(
                entry({ direction: ChatCallDirection.OUTGOING, endReason: ChatCallEndReason.MISSED, isMissed: false }),
            ),
        ).toBe('not-answered');
    });

    it('gives a length only to a call that connected', () => {
        expect(callHistoryDuration(entry({}))).toBe(65);
        expect(callHistoryDuration(entry({ endReason: ChatCallEndReason.FAILED, durationSeconds: 0 }))).toBeNull();
        expect(callHistoryDuration(entry({ status: ChatCallStatus.ACTIVE, endReason: null }))).toBeNull();
        expect(callHistoryDuration(entry({ durationSeconds: null }))).toBeNull();
    });
});
