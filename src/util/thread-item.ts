import type { IsoDateTime, Nullable, UUID } from '@iveri/contracts';
import type { ChatAttachment, ChatMessage, ChatReplyPreview } from '@iveri/contracts/chat';

import type { ChatApiError } from '../client/index.js';

/** Where a message the person sent stands before `chat-api` has answered for it. */
export type ChatPendingStatus = 'sending' | 'failed';

/**
 * A message on screen that `chat-api` has not confirmed yet.
 *
 * It lives apart from the server's messages so a refetch can never erase it, and it is dropped the
 * moment a server message with the same `clientMessageId` arrives, whichever of the send's response
 * or a frame-triggered catch-up brings it first.
 */
export interface ChatPendingMessage {
    clientMessageId: UUID;
    conversationId: UUID;
    body: Nullable<string>;
    replyTo: Nullable<ChatReplyPreview>;
    attachments: ChatAttachment[];
    status: ChatPendingStatus;
    error: Nullable<ChatApiError>;
    createdAt: IsoDateTime;
}

/** One row of a thread: a confirmed message or one still on its way. */
export type ChatThreadItem =
    | { type: 'message'; key: string; message: ChatMessage }
    | { type: 'pending'; key: string; pending: ChatPendingMessage };

export function messageItem(message: ChatMessage): ChatThreadItem {
    return { type: 'message', key: message.id, message };
}

export function pendingItem(pending: ChatPendingMessage): ChatThreadItem {
    return { type: 'pending', key: `pending:${pending.clientMessageId}`, pending };
}

/** When an item was sent, as the person sees it: a pending one counts from when they pressed send. */
export function itemSentAt(item: ChatThreadItem): IsoDateTime {
    return item.type === 'message' ? item.message.sentAt : item.pending.createdAt;
}

/** Who sent it; `null` for a system notice. A pending message is always the reader's own. */
export function itemSenderId(item: ChatThreadItem, myUserId: Nullable<UUID>): Nullable<UUID> {
    if (item.type === 'pending') return myUserId;

    return item.message.sender?.userId ?? null;
}

export function itemIsOwn(item: ChatThreadItem): boolean {
    return item.type === 'pending' || item.message.isOwn;
}

export function itemIsSystem(item: ChatThreadItem): boolean {
    return item.type === 'message' && item.message.systemKey !== null;
}
