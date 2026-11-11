import { ChatConversationKind, ChatMessageKind, ChatParticipantRole, ChatRefusal } from '@iveri/contracts/chat';
import { describe, expect, it } from 'vitest';

import { ChatApiError } from '../client/index.js';
import { conversation, keyTranslate, ME, message, NINO, GIORGI, ownMessage, participant } from '../testing/fixtures.js';

import { calendarDaysBetween } from './calendar.js';
import { lastMessageExcerpt, systemNoticeText } from './excerpt.js';
import { formatByteSize, formatUnreadBadge } from './format-number.js';
import { linkify } from './linkify.js';
import { groupMessages } from './message-groups.js';
import { messagePermissions } from './message-permissions.js';
import { replaceRange, windowFromPage } from './message-window.js';
import { firstUnreadKey, initialsOf, typingText } from './people.js';
import { conversationHeading, productText } from './product-text.js';
import { applyMyReaction } from './reactions.js';
import { readStateOf } from './read-state.js';
import { canAcceptRequest, errorText } from './refusal.js';
import { messageItem, pendingItem, type ChatPendingMessage } from './thread-item.js';
import { threadRows } from './thread-rows.js';
import { formatDayLabel, formatDuration, formatInboxTime, formatLastActive } from './time-label.js';
import { downsampleWaveform, encodeWaveformField, normaliseWaveform } from './waveform.js';

const TBILISI = 'Asia/Tbilisi';
const NOW = new Date('2026-11-11T12:00:00.000Z');

describe('groupMessages', () => {
    it('breaks runs at a new sender, a five-minute gap, a day boundary and every notice', () => {
        const items = [
            message({ seq: 1, sentAt: '2026-11-10T19:58:00.000Z' }),
            message({ seq: 2, sentAt: '2026-11-10T19:59:00.000Z' }),
            // 00:01 in Tbilisi (UTC+4): a new day there, though it is still the 10th in UTC.
            message({ seq: 3, sentAt: '2026-11-10T20:01:00.000Z' }),
            message({ seq: 4, sentAt: '2026-11-10T20:07:00.000Z' }),
            ownMessage({ seq: 5, sentAt: '2026-11-10T20:08:00.000Z' }),
            message({
                seq: 6,
                sender: null,
                kind: ChatMessageKind.SYSTEM,
                systemKey: 'chat.system.member-added',
                sentAt: '2026-11-10T20:08:30.000Z',
            }),
            ownMessage({ seq: 7, sentAt: '2026-11-10T20:09:00.000Z' }),
        ].map(messageItem);

        const sections = groupMessages(items, { myUserId: ME, timeZone: TBILISI });

        expect(sections.map((section) => section.day)).toEqual(['2026-11-10', '2026-11-11']);
        expect(sections[0].runs.map((run) => run.items.length)).toEqual([2]);
        expect(sections[1].runs.map((run) => [run.items.length, run.isOwn, run.isSystem])).toEqual([
            [1, false, false],
            [1, false, false],
            [1, true, false],
            [1, false, true],
            [1, true, false],
        ]);
    });

    it('starts a run at the first unread message, so the "new messages" line sits between two of them', () => {
        const items = [message({ seq: 1 }), message({ seq: 2 }), message({ seq: 3 })].map(messageItem);
        const dividerKey = firstUnreadKey(items, 1);
        const sections = groupMessages(items, { myUserId: ME, timeZone: TBILISI, breakBefore: dividerKey });

        expect(dividerKey).toBe(items[1].key);
        expect(sections[0].runs.map((run) => run.items.length)).toEqual([1, 2]);
        const rows = threadRows(sections, { dividerKey, showsSenders: true });
        expect(rows.map((row) => row.type)).toEqual(['day', 'message', 'new-messages', 'message', 'message']);
    });
});

describe('day and time labels', () => {
    const t = (key: string): string =>
        key === 'chat.day.today' ? 'TODAY' : key === 'chat.day.yesterday' ? 'YESTERDAY' : key;

    it('says today and yesterday by calendar day in the reader’s time zone', () => {
        expect(formatDayLabel('2026-11-11T05:00:00.000Z', t, { locale: 'ka', timeZone: TBILISI, now: NOW })).toBe(
            'TODAY',
        );
        // 20:30 UTC is 00:30 in Tbilisi: the 11th there.
        expect(formatDayLabel('2026-11-10T20:30:00.000Z', t, { locale: 'ka', timeZone: TBILISI, now: NOW })).toBe(
            'TODAY',
        );
        expect(formatDayLabel('2026-11-10T19:30:00.000Z', t, { locale: 'ka', timeZone: TBILISI, now: NOW })).toBe(
            'YESTERDAY',
        );
        expect(calendarDaysBetween(new Date('2026-11-09T21:00:00.000Z'), NOW, TBILISI)).toBe(1);
    });

    it('names an older day in Georgian and in Russian, never in the browser’s language', () => {
        const georgian = formatDayLabel('2026-11-08T09:00:00.000Z', t, { locale: 'ka', timeZone: TBILISI, now: NOW });
        const russian = formatDayLabel('2026-11-08T09:00:00.000Z', t, { locale: 'ru', timeZone: TBILISI, now: NOW });
        const older = formatDayLabel('2025-03-02T09:00:00.000Z', t, { locale: 'ru', timeZone: TBILISI, now: NOW });

        expect(georgian).toMatch(/[Ⴀ-ჿ]/u);
        expect(georgian).toContain('8');
        expect(russian).toMatch(/воскресенье/u);
        expect(russian).toMatch(/ноября/u);
        expect(older).toMatch(/2025/u);
    });

    it('shows a clock today and a short weekday this week on an inbox row', () => {
        expect(formatInboxTime('2026-11-11T08:05:00.000Z', t, { locale: 'ru', timeZone: TBILISI, now: NOW })).toBe(
            '12:05',
        );
        expect(formatInboxTime('2026-11-10T08:05:00.000Z', t, { locale: 'ru', timeZone: TBILISI, now: NOW })).toBe(
            'YESTERDAY',
        );
        expect(formatInboxTime('2026-11-07T08:05:00.000Z', t, { locale: 'ka', timeZone: TBILISI, now: NOW })).toMatch(
            /[Ⴀ-ჿ]/u,
        );
    });

    it('names days and months from the namespace where the browser has no data for the locale', () => {
        const t = (key: string, values?: Record<string, unknown>): string =>
            values === undefined ? (key.split('.').at(-1) ?? key) : `${key} ${JSON.stringify(values)}`;
        const own = { locale: 'ka', timeZone: TBILISI, now: NOW, hasLocaleData: false };

        expect(formatDayLabel('2026-11-08T09:00:00.000Z', t, own)).toBe(
            'chat.date.weekday-day-month {"weekday":"sun","day":8,"month":"nov"}',
        );
        expect(formatDayLabel('2025-03-02T09:00:00.000Z', t, own)).toBe(
            'chat.date.day-month-year {"day":2,"month":"mar","year":"2025"}',
        );
        expect(formatInboxTime('2026-11-07T08:05:00.000Z', t, own)).toBe('sat');
        expect(formatInboxTime('2026-11-11T08:05:00.000Z', t, own)).toBe('12:05');
        expect(formatLastActive('2026-10-01T09:00:00.000Z', t, own)).toBe(
            'chat.presence.last-active {"when":"chat.date.day-month {\\"day\\":1,\\"month\\":\\"oct\\"}"}',
        );
    });

    it('says when somebody was last active in the reader’s language', () => {
        expect(formatLastActive('2026-11-11T11:59:30.000Z', keyTranslate, { locale: 'ru', now: NOW })).toBe(
            'chat.presence.just-now',
        );
        expect(formatLastActive('2026-11-11T11:55:00.000Z', keyTranslate, { locale: 'ru', now: NOW })).toBe(
            'chat.presence.minutes {"count":5}',
        );
        expect(
            formatLastActive('2026-11-10T09:00:00.000Z', keyTranslate, { locale: 'ka', timeZone: TBILISI, now: NOW }),
        ).toBe('chat.presence.yesterday');
        expect(
            formatLastActive('2026-10-01T09:00:00.000Z', keyTranslate, { locale: 'ru', timeZone: TBILISI, now: NOW }),
        ).toBe('chat.presence.last-active {"when":"1 октября"}');
        expect(formatDuration(65_400)).toBe('1:05');
    });
});

describe('excerpts and notices', () => {
    it('words the last message by what it is and who sent it', () => {
        const base = {
            seq: 3,
            systemKey: null,
            systemVariables: null,
            senderName: 'Nino',
            isDeleted: false,
            sentAt: NOW.toISOString(),
        };
        expect(
            lastMessageExcerpt({ ...base, kind: ChatMessageKind.PHOTO, excerpt: null, isOwn: false }, keyTranslate, {
                isGroup: false,
            }),
        ).toBe('chat.preview.photo');
        expect(
            lastMessageExcerpt({ ...base, kind: ChatMessageKind.TEXT, excerpt: 'hi', isOwn: true }, keyTranslate, {
                isGroup: true,
            }),
        ).toBe('chat.preview.own {"text":"hi"}');
        expect(
            lastMessageExcerpt({ ...base, kind: ChatMessageKind.TEXT, excerpt: 'hi', isOwn: false }, keyTranslate, {
                isGroup: true,
            }),
        ).toBe('chat.preview.sender {"name":"Nino","text":"hi"}');
        expect(lastMessageExcerpt(null, keyTranslate, { isGroup: false })).toBe('chat.preview.empty');
    });

    it('replaces a notice nobody wrote words for, rather than showing its key', () => {
        const known = (key: string, values?: Record<string, unknown>): string =>
            key === 'chat.system.member-added'
                ? `${String(values?.actor)} added ${String(values?.name)}`
                : key === 'chat.system.unknown'
                  ? 'A change'
                  : key;

        expect(systemNoticeText('chat.system.member-added', { actor: 'Nino', name: 'Giorgi' }, known)).toBe(
            'Nino added Giorgi',
        );
        expect(systemNoticeText('chat.system.taxi-from-the-future', null, known)).toBe('A change');
    });

    it('says the whole sentence on an inbox row when the preview carries the notice’s variables', () => {
        const filled = (key: string, values?: Record<string, unknown>): string =>
            key === 'chat.system.group-created' && typeof values?.actor === 'string'
                ? `${values.actor} created the group`
                : key;
        const preview = {
            seq: 1,
            kind: ChatMessageKind.SYSTEM,
            excerpt: null,
            systemKey: 'chat.system.group-created',
            systemVariables: { actor: 'Nino' },
            senderName: null,
            isOwn: false,
            isDeleted: false,
            sentAt: NOW.toISOString(),
        };

        expect(lastMessageExcerpt(preview, filled, { isGroup: true })).toBe('Nino created the group');
    });

    it('never shows a notice’s pattern with holes in it when its variables were not sent', () => {
        // What an app's translate returns for a pattern it could not fill: the pattern itself.
        const pattern = (key: string): string =>
            key === 'chat.system.group-created'
                ? '{actor} created the group'
                : key === 'chat.system.unknown'
                  ? 'A change'
                  : key;
        const preview = {
            seq: 1,
            kind: ChatMessageKind.SYSTEM,
            excerpt: null,
            systemKey: 'chat.system.group-created',
            systemVariables: null,
            senderName: null,
            isOwn: false,
            isDeleted: false,
            sentAt: NOW.toISOString(),
        };

        expect(lastMessageExcerpt(preview, pattern, { isGroup: true })).toBe('A change');
    });
});

describe('read state', () => {
    const pending: ChatPendingMessage = {
        clientMessageId: '44444444-4444-4444-8444-444444444444',
        conversationId: conversation().id,
        body: 'x',
        replyTo: null,
        attachments: [],
        status: 'failed',
        error: null,
        createdAt: NOW.toISOString(),
    };

    it('is sent, then read, in a conversation with one other person', () => {
        const mine = messageItem(ownMessage({ seq: 4 }));
        expect(readStateOf(mine, conversation())).toEqual({ state: 'sent' });
        expect(
            readStateOf(
                mine,
                conversation({
                    participants: [participant({ userId: ME, isMe: true }), participant({ lastReadSeq: 4 })],
                }),
            ),
        ).toEqual({
            state: 'read',
        });
        expect(readStateOf(messageItem(message({ seq: 4 })), conversation())).toBeNull();
        expect(readStateOf(pendingItem(pending), conversation())).toEqual({ state: 'failed' });
    });

    it('counts readers in a group, and treats hidden read state as unread', () => {
        const group = conversation({
            kind: ChatConversationKind.GROUP,
            participants: [
                participant({ userId: ME, isMe: true }),
                participant({ userId: NINO, lastReadSeq: 9 }),
                participant({ userId: GIORGI, lastReadSeq: null }),
            ],
        });
        expect(readStateOf(messageItem(ownMessage({ seq: 9 })), group)).toEqual({ state: 'read-by', count: 1 });
    });
});

describe('numbers', () => {
    it('caps the unread badge at 99+ and spells nothing for zero', () => {
        expect(formatUnreadBadge(0, 'en')).toBe('');
        expect(formatUnreadBadge(7, 'ka')).toBe('7');
        expect(formatUnreadBadge(140, 'en')).toBe('99+');
    });

    it('writes a file size in the reader’s units and decimal separator', () => {
        expect(formatByteSize(512, 'en')).toBe('512 byte');
        expect(formatByteSize(1_500_000, 'en')).toBe('1.5 MB');
        expect(formatByteSize(1_500_000, 'ru')).toBe('1,5 МБ');
    });
});

describe('waveform', () => {
    it('keeps each stretch’s peak, so speech does not average into the silence around it', () => {
        expect(downsampleWaveform([0, 10, 0, 0, 80, 0], 3)).toEqual([10, 0, 80]);
        expect(downsampleWaveform([5, 50], 4)).toEqual([5, 5, 50, 50]);
        expect(downsampleWaveform([], 3)).toEqual([0, 0, 0]);
    });

    it('scales to whole levels relative to the loudest, never below the visible floor', () => {
        expect(normaliseWaveform([0, 0.25, 0.5])).toEqual([4, 50, 100]);
        expect(JSON.parse(encodeWaveformField(Array.from({ length: 200 }, (_, index) => index)))).toHaveLength(64);
    });
});

describe('errorText', () => {
    it('prefers the refusal, then the statuses a person understands', () => {
        expect(errorText(new ChatApiError({ status: 403, message: 'x', refusal: ChatRefusal.PIN_LIMIT }))).toEqual({
            key: 'chat.refusal.pin-limit',
            values: { max: 5 },
        });
        expect(errorText(ChatApiError.network(new Error('offline')))).toEqual({ key: 'chat.error.network' });
        expect(errorText(new ChatApiError({ status: 429, message: 'x' }))).toEqual({ key: 'chat.error.rate-limited' });
        expect(errorText(new Error('boom'))).toEqual({ key: 'chat.error.generic' });
    });
});

describe('canAcceptRequest', () => {
    it('offers Accept only on a request accepting would open', () => {
        expect(canAcceptRequest({ isRequest: true, refusal: ChatRefusal.REQUEST_PENDING, closedAt: null })).toBe(true);
        expect(canAcceptRequest({ isRequest: true, refusal: ChatRefusal.CLOSED, closedAt: null })).toBe(false);
        expect(canAcceptRequest({ isRequest: true, refusal: ChatRefusal.NOT_WRITABLE, closedAt: null })).toBe(false);
        expect(canAcceptRequest({ isRequest: true, refusal: null, closedAt: NOW.toISOString() })).toBe(false);
        expect(canAcceptRequest({ isRequest: false, refusal: ChatRefusal.BLOCKED, closedAt: null })).toBe(false);
    });
});

describe('message window', () => {
    it('replaces the re-read range, so an edit lands and a message deleted for me disappears', () => {
        const window = windowFromPage({
            messages: [1, 2, 3, 4].map((seq) => message({ seq })),
            hasOlder: true,
            lastSeq: 4,
        });
        const edited = { ...window.messages[2], body: 'edited' };
        const next = replaceRange(
            window,
            [edited, message({ seq: 5 })],
            { afterSeq: 2, throughSeq: Number.MAX_SAFE_INTEGER },
            5,
        );

        expect(next.messages.map((held) => held.seq)).toEqual([1, 2, 3, 5]);
        expect(next.messages[2].body).toBe('edited');
        expect(next.hasOlder).toBe(true);
        expect(next.lastSeq).toBe(5);
    });
});

describe('reactions', () => {
    it('replaces my reaction rather than adding a second one', () => {
        const reactions = [
            { emoji: '👍', count: 2, isMine: true },
            { emoji: '😂', count: 1, isMine: false },
        ];
        expect(applyMyReaction(reactions, '😂')).toEqual([
            { emoji: '👍', count: 1, isMine: false },
            { emoji: '😂', count: 2, isMine: true },
        ]);
        expect(applyMyReaction([{ emoji: '👍', count: 1, isMine: true }], null)).toEqual([]);
    });
});

describe('productText and the heading rule', () => {
    it('translates a value starting with chat. and shows anything else exactly as written', () => {
        expect(productText('chat.label.driver', keyTranslate)).toBe('chat.label.driver');
        expect(productText('chat.label.driver', (key) => (key === 'chat.label.driver' ? 'მძღოლი' : key))).toBe(
            'მძღოლი',
        );
        expect(productText('Ride to Vake Park', () => 'never')).toBe('Ride to Vake Park');
        expect(productText('chatty', () => 'never')).toBe('chatty');
        expect(productText(null, () => 'never')).toBeNull();
    });

    it('leads a two-person product conversation with the other person, their label beside, the title beneath', () => {
        const t = (key: string): string =>
            ({ 'chat.label.driver': 'Driver', 'chat.title.taxi-ride': 'Taxi ride' })[key] ?? key;
        const ride = conversation({
            kind: ChatConversationKind.CONTEXT,
            title: 'chat.title.taxi-ride',
            other: null,
            participants: [
                participant({ userId: ME, isMe: true, label: 'chat.label.passenger' }),
                participant({ displayName: 'Giorgi B.', label: 'chat.label.driver' }),
            ],
        });

        expect(conversationHeading(ride, t)).toMatchObject({
            title: 'Giorgi B.',
            label: 'Driver',
            subtitle: 'Taxi ride',
        });

        // An inbox summary: no participants, the other person named in `other`.
        const { participants: _participants, ...summary } = ride;
        const other = { userId: GIORGI, displayName: 'Giorgi B.', handle: null, avatar: null, lastActiveAt: null };
        expect(conversationHeading({ ...summary, other }, t)).toMatchObject({
            title: 'Giorgi B.',
            subtitle: 'Taxi ride',
        });
        expect(conversationHeading({ ...summary, other: null }, t)).toMatchObject({
            title: 'Taxi ride',
            subtitle: null,
        });

        const shop = conversation({
            kind: ChatConversationKind.CONTEXT,
            title: 'Order 1042',
            subtitle: 'chat.title.order',
            other: null,
            participants: [participant({ userId: ME, isMe: true }), participant(), participant({ userId: GIORGI })],
        });
        expect(conversationHeading(shop, t)).toMatchObject({
            title: 'Order 1042',
            label: null,
            subtitle: 'chat.title.order',
        });
    });
});

describe('message permissions', () => {
    it('lets the author edit and delete within the window, and a group admin delete any time', () => {
        const fresh = ownMessage({ sentAt: '2026-11-11T11:00:00.000Z' });
        const old = ownMessage({ sentAt: '2026-11-01T11:00:00.000Z' });
        const direct = conversation();
        const group = conversation({ kind: ChatConversationKind.GROUP, myRole: ChatParticipantRole.ADMIN });

        expect(messagePermissions(fresh, direct, NOW)).toMatchObject({
            canEdit: true,
            canDeleteForEveryone: true,
            canReport: false,
        });
        expect(messagePermissions(old, direct, NOW)).toMatchObject({
            canEdit: false,
            canDeleteForEveryone: false,
            canDeleteForMe: true,
        });
        expect(messagePermissions(message({ sentAt: '2026-10-01T00:00:00.000Z' }), group, NOW)).toMatchObject({
            canEdit: false,
            canDeleteForEveryone: true,
            canReport: true,
        });
        expect(messagePermissions(fresh, conversation({ canSend: false }), NOW)).toMatchObject({
            canReply: false,
            canReact: false,
        });
    });
});

describe('small helpers', () => {
    it('links only full http addresses and leaves sentence punctuation outside', () => {
        expect(linkify('see https://iveri.ge/x. or javascript:alert(1)')).toEqual([
            { type: 'text', text: 'see ' },
            { type: 'link', text: 'https://iveri.ge/x', href: 'https://iveri.ge/x' },
            { type: 'text', text: '. or javascript:alert(1)' },
        ]);
    });

    it('takes initials from the first and last word, Georgian included', () => {
        expect(initialsOf('Ana Maria Beridze')).toBe('AB');
        expect(initialsOf('ნინო')).toBe([...'ნ'][0].toLocaleUpperCase());
    });

    it('names who is typing, and counts past two', () => {
        expect(typingText([], keyTranslate)).toBeNull();
        expect(typingText(['Nino', 'Giorgi', 'Ana'], keyTranslate)).toBe('chat.typing.many {"count":3}');
    });
});
