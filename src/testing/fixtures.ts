import type { UUID } from '@iveri/contracts';
import {
    ChatConversationKind,
    ChatMessageKind,
    ChatParticipantRole,
    ChatParticipantStatus,
} from '@iveri/contracts/chat';
import type { ChatConversation, ChatMessage, ChatParticipant } from '@iveri/contracts/chat';

/** Shared by the specs and the gallery. Never built: `tsconfig.build.json` excludes `src/testing`. */
export const ME = '11111111-1111-4111-8111-111111111111' as UUID;
export const NINO = '22222222-2222-4222-8222-222222222222' as UUID;
export const GIORGI = '33333333-3333-4333-8333-333333333333' as UUID;
export const CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID;

let counter = 0;

export function uuid(): UUID {
    counter += 1;

    return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}` as UUID;
}

export function participant(overrides: Partial<ChatParticipant> = {}): ChatParticipant {
    return {
        userId: NINO,
        displayName: 'Nino Beridze',
        label: null,
        handle: 'nino',
        avatar: null,
        role: ChatParticipantRole.MEMBER,
        status: ChatParticipantStatus.ACTIVE,
        lastReadSeq: 0,
        lastActiveAt: null,
        isMe: false,
        ...overrides,
    };
}

export function conversation(overrides: Partial<ChatConversation> = {}): ChatConversation {
    return {
        id: CONVERSATION,
        kind: ChatConversationKind.DIRECT,
        title: 'Nino Beridze',
        subtitle: null,
        avatar: null,
        other: {
            userId: NINO,
            externalId: null,
            displayName: 'Nino Beridze',
            handle: 'nino',
            avatar: null,
            lastActiveAt: null,
        },
        context: null,
        isGroup: false,
        memberCount: 2,
        lastMessage: null,
        lastSeq: 0,
        unreadCount: 0,
        isRequest: false,
        mutedUntil: null,
        isPinned: false,
        isArchived: false,
        canSend: true,
        refusal: null,
        updatedAt: '2026-11-11T10:00:00.000Z',
        participants: [participant({ userId: ME, displayName: 'Me', handle: 'me', isMe: true }), participant()],
        myRole: ChatParticipantRole.MEMBER,
        myLastReadSeq: 0,
        writableUntil: null,
        closedAt: null,
        inviteCode: null,
        ...overrides,
    };
}

export function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
    const seq = overrides.seq ?? 1;

    return {
        id: uuid(),
        conversationId: CONVERSATION,
        seq,
        clientMessageId: null,
        sender: { userId: NINO, displayName: 'Nino Beridze', avatar: null },
        kind: ChatMessageKind.TEXT,
        body: `Message ${seq}`,
        systemKey: null,
        systemVariables: null,
        replyTo: null,
        attachments: [],
        reactions: [],
        isOwn: false,
        editedAt: null,
        isDeleted: false,
        sentAt: '2026-11-11T10:00:00.000Z',
        ...overrides,
    };
}

export function ownMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
    return message({ sender: { userId: ME, displayName: 'Me', avatar: null }, isOwn: true, ...overrides });
}

/** A translate that shows the key and its values, so a spec can assert what was asked for in which words. */
export function keyTranslate(key: string, values?: Record<string, unknown>): string {
    return values === undefined ? key : `${key} ${JSON.stringify(values)}`;
}
