import type { UUID } from '@iveri/contracts';
import {
    ChatAttachmentKind,
    ChatConversationKind,
    ChatMessageKind,
    ChatParticipantRole,
    ChatPersonStatus,
} from '@iveri/contracts/chat';
import type { ChatAttachment, ChatConversation, ChatMessage } from '@iveri/contracts/chat';

import type { ChatClient } from '../client/index.js';

import { conversation, GIORGI, ME, message, NINO, ownMessage, participant } from './fixtures.js';

/** A labelled set of people and words, so the gallery can show the same screens in two languages. */
export interface GalleryCopy {
    nino: string;
    giorgi: string;
    me: string;
    group: string;
    lines: string[];
}

/** A drawn stand-in for a photograph, so the gallery makes no request to anybody. */
const scene = (width: number, height: number): string =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#c9d6ea"/><circle cx="${width * 0.78}" cy="${height * 0.26}" r="${height * 0.1}" fill="#f6c76d"/><path d="M0 ${height * 0.78} L${width * 0.3} ${height * 0.42} L${width * 0.55} ${height * 0.7} L${width * 0.72} ${height * 0.5} L${width} ${height * 0.82} V${height} H0Z" fill="#1b2d72" opacity="0.85"/></svg>`,
    )}`;

const PHOTO = (seed: string, width: number, height: number): ChatAttachment => ({
    id: `00000000-0000-4000-9000-${String(seed.length).padStart(12, '0')}` as UUID,
    kind: ChatAttachmentKind.PHOTO,
    url: scene(width || 4, height || 3),
    thumbnailUrl: scene(width || 4, height || 3),
    fileName: `${seed}.jpg`,
    contentType: 'image/jpeg',
    sizeBytes: 480_000,
    width,
    height,
    durationMs: null,
    waveform: null,
});

/**
 * An in-memory `chat-api` for the gallery: a direct conversation, a group, a ride and a request, with
 * replies, reactions, a photo, a file, a voice note, a deletion, an edit and notices. Sending works, so
 * the composer can be driven; nothing leaves the page.
 */
export function createMemoryClient(copy: GalleryCopy, now: Date): ChatClient {
    const at = (minutesAgo: number): string => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
    const DIRECT = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001' as UUID;
    const GROUP = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002' as UUID;
    const RIDE = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003' as UUID;
    const REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004' as UUID;
    const nino = { userId: NINO, displayName: copy.nino, avatar: null };
    const giorgi = { userId: GIORGI, displayName: copy.giorgi, avatar: null };

    const directMessages: ChatMessage[] = [
        message({ seq: 1, conversationId: DIRECT, sender: nino, body: copy.lines[0], sentAt: at(60 * 26) }),
        ownMessage({ seq: 2, conversationId: DIRECT, body: copy.lines[1], sentAt: at(60 * 25.9) }),
        message({
            seq: 3,
            conversationId: DIRECT,
            sender: nino,
            body: copy.lines[2],
            sentAt: at(42),
            reactions: [{ emoji: '❤️', count: 1, isMine: true }],
        }),
        message({
            seq: 4,
            conversationId: DIRECT,
            sender: nino,
            kind: ChatMessageKind.PHOTO,
            body: null,
            attachments: [PHOTO('baasi-yard', 1200, 900)],
            sentAt: at(41),
        }),
        message({ seq: 5, conversationId: DIRECT, sender: nino, body: null, isDeleted: true, sentAt: at(40) }),
        ownMessage({
            seq: 6,
            conversationId: DIRECT,
            body: copy.lines[3],
            sentAt: at(12),
            editedAt: at(11),
            replyTo: {
                id: 'r' as UUID,
                seq: 3,
                senderName: copy.nino,
                kind: ChatMessageKind.TEXT,
                excerpt: copy.lines[2],
                isDeleted: false,
            },
        }),
        message({
            seq: 7,
            conversationId: DIRECT,
            sender: nino,
            kind: ChatMessageKind.VOICE,
            body: null,
            sentAt: at(6),
            attachments: [
                {
                    ...PHOTO('voice', 0, 0),
                    kind: ChatAttachmentKind.VOICE,
                    url: 'data:audio/webm;base64,',
                    thumbnailUrl: null,
                    width: null,
                    height: null,
                    durationMs: 14_000,
                    waveform: Array.from({ length: 48 }, (_, index) =>
                        Math.round(20 + 70 * Math.abs(Math.sin(index / 3.1))),
                    ),
                },
            ],
        }),
        message({
            seq: 8,
            conversationId: DIRECT,
            sender: nino,
            kind: ChatMessageKind.FILE,
            body: copy.lines[4],
            sentAt: at(5),
            attachments: [
                {
                    ...PHOTO('menu', 0, 0),
                    kind: ChatAttachmentKind.FILE,
                    fileName: 'menu-saturday.pdf',
                    contentType: 'application/pdf',
                    sizeBytes: 1_480_000,
                    thumbnailUrl: null,
                },
            ],
        }),
    ];

    const groupMessages: ChatMessage[] = [
        message({
            seq: 1,
            conversationId: GROUP,
            sender: null,
            kind: ChatMessageKind.SYSTEM,
            body: null,
            systemKey: 'chat.system.group-created',
            systemVariables: { actor: copy.nino },
            sentAt: at(300),
        }),
        message({
            seq: 2,
            conversationId: GROUP,
            sender: null,
            kind: ChatMessageKind.SYSTEM,
            body: null,
            systemKey: 'chat.system.member-added',
            systemVariables: { actor: copy.nino, name: copy.giorgi },
            sentAt: at(299),
        }),
        message({ seq: 3, conversationId: GROUP, sender: nino, body: copy.lines[5], sentAt: at(30) }),
        message({
            seq: 4,
            conversationId: GROUP,
            sender: giorgi,
            body: copy.lines[6],
            sentAt: at(28),
            reactions: [{ emoji: '👍', count: 2, isMine: false }],
        }),
        ownMessage({ seq: 5, conversationId: GROUP, body: copy.lines[7], sentAt: at(3) }),
    ];

    const rideMessages: ChatMessage[] = [
        message({
            seq: 1,
            conversationId: RIDE,
            sender: null,
            kind: ChatMessageKind.SYSTEM,
            body: null,
            systemKey: 'chat.system.taxi-driver-arriving',
            sentAt: at(9),
        }),
        message({ seq: 2, conversationId: RIDE, sender: giorgi, body: copy.lines[8], sentAt: at(8) }),
    ];

    const conversations: ChatConversation[] = [
        conversation({
            id: DIRECT,
            title: copy.nino,
            other: { userId: NINO, displayName: copy.nino, handle: 'nino', avatar: null, lastActiveAt: at(4) },
            participants: [
                participant({ userId: ME, displayName: copy.me, isMe: true }),
                participant({ displayName: copy.nino, lastReadSeq: 6, lastActiveAt: at(4) }),
            ],
            lastSeq: 8,
            myLastReadSeq: 6,
            unreadCount: 2,
            isPinned: true,
            lastMessage: {
                seq: 8,
                kind: ChatMessageKind.FILE,
                excerpt: copy.lines[4],
                systemKey: null,
                systemVariables: null,
                senderName: copy.nino,
                isOwn: false,
                isDeleted: false,
                sentAt: at(5),
            },
        }),
        conversation({
            id: GROUP,
            kind: ChatConversationKind.GROUP,
            title: copy.group,
            other: null,
            memberCount: 3,
            myRole: ChatParticipantRole.OWNER,
            inviteCode: 'k7Qe2x',
            participants: [
                participant({
                    userId: ME,
                    displayName: copy.me,
                    isMe: true,
                    role: ChatParticipantRole.OWNER,
                    lastReadSeq: 5,
                }),
                participant({ displayName: copy.nino, lastReadSeq: 5, role: ChatParticipantRole.ADMIN }),
                participant({ userId: GIORGI, displayName: copy.giorgi, handle: 'giorgi', lastReadSeq: 4 }),
            ],
            lastSeq: 5,
            myLastReadSeq: 5,
            mutedUntil: '9999-12-31T23:59:59.000Z',
            lastMessage: {
                seq: 5,
                kind: ChatMessageKind.TEXT,
                excerpt: copy.lines[7],
                systemKey: null,
                systemVariables: null,
                senderName: copy.me,
                isOwn: true,
                isDeleted: false,
                sentAt: at(3),
            },
        }),
        conversation({
            id: RIDE,
            kind: ChatConversationKind.CONTEXT,
            title: 'chat.title.taxi-ride',
            other: null,
            context: { product: 'taxi', type: 'ride', id: 'ride-1', link: null },
            participants: [
                participant({ userId: ME, displayName: copy.me, isMe: true, label: 'chat.label.passenger' }),
                participant({ userId: GIORGI, displayName: copy.giorgi, label: 'chat.label.driver', lastReadSeq: 2 }),
            ],
            lastSeq: 2,
            myLastReadSeq: 1,
            unreadCount: 1,
            lastMessage: {
                seq: 2,
                kind: ChatMessageKind.TEXT,
                excerpt: copy.lines[8],
                systemKey: null,
                systemVariables: null,
                senderName: copy.giorgi,
                isOwn: false,
                isDeleted: false,
                sentAt: at(8),
            },
        }),
        conversation({
            id: REQUEST,
            title: 'Ana Kapanadze',
            other: {
                userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                displayName: 'Ana Kapanadze',
                handle: 'ana.k',
                avatar: null,
                lastActiveAt: null,
            },
            isRequest: true,
            canSend: false,
            refusal: 'request-pending' as ChatConversation['refusal'],
            lastSeq: 1,
            unreadCount: 1,
            lastMessage: {
                seq: 1,
                kind: ChatMessageKind.TEXT,
                excerpt: copy.lines[9],
                systemKey: null,
                systemVariables: null,
                senderName: 'Ana Kapanadze',
                isOwn: false,
                isDeleted: false,
                sentAt: at(60 * 50),
            },
        }),
    ];

    const store = new Map<UUID, ChatMessage[]>([
        [DIRECT, directMessages],
        [GROUP, groupMessages],
        [RIDE, rideMessages],
        [REQUEST, [message({ seq: 1, conversationId: REQUEST, body: copy.lines[9], sentAt: at(60 * 50) })]],
    ]);
    const find = (id: UUID): ChatConversation => conversations.find((entry) => entry.id === id) ?? conversations[0];
    const ok = <T>(value: T): Promise<T> => Promise.resolve(structuredClone(value));

    return {
        getAccessToken: () => ok('gallery'),
        refreshAccessToken: () => ok(true),
        getProfile: () =>
            ok({
                userId: ME,
                isNetwork: true,
                hasProfile: true,
                handle: 'me',
                displayName: copy.me,
                bio: null,
                avatar: null,
                status: ChatPersonStatus.ACTIVE,
                sanctionReasonKey: null,
                suspendedUntil: null,
                settings: { showLastActive: true, sendReadReceipts: true },
                inviteCode: 'me-123',
            }),
        listConversations: ({ folder }) =>
            ok({
                conversations: conversations.filter((entry) =>
                    folder === 'requests' ? entry.isRequest : !entry.isRequest && !entry.isArchived,
                ),
                nextCursor: null,
            }),
        getConversation: (id) => ok(find(id)),
        listMessages: (id, params) => {
            const all = store.get(id) ?? [];
            const after = params.afterSeq;

            return ok({
                messages: after === undefined ? all : all.filter((entry) => entry.seq > after),
                hasOlder: false,
                lastSeq: all.at(-1)?.seq ?? 0,
            });
        },
        sendMessage: (id, body) => {
            const all = store.get(id) ?? [];
            const sent = ownMessage({
                conversationId: id,
                seq: (all.at(-1)?.seq ?? 0) + 1,
                body: body.body ?? null,
                clientMessageId: body.clientMessageId,
                sentAt: new Date().toISOString(),
            });
            all.push(sent);

            return new Promise((resolve) => setTimeout(() => resolve(structuredClone(sent)), 400));
        },
        markRead: () => ok(undefined),
        typing: () => ok({ accepted: true }),
        searchMessages: () => ok([]),
        searchPeople: () => ok([]),
        listContacts: () => ok([]),
        listBlocks: () => ok([]),
    } as Partial<ChatClient> as ChatClient;
}
