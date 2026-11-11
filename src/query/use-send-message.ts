import type { Maybe, Nullable, UUID } from '@iveri/contracts';
import type { ChatAttachment, ChatMessage, ChatReplyPreview } from '@iveri/contracts/chat';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { ChatApiError, createClientMessageId } from '../client/index.js';
import { useChatContext } from '../provider/index.js';
import { upsertMessage, type ChatPendingMessage } from '../util/index.js';

import { updateWindow } from './cache.js';
import { chatQueryKeys, NO_ID } from './query-keys.js';

export interface SendChatMessageInput {
    body?: Nullable<string>;
    replyTo?: Nullable<ChatReplyPreview>;
    /** Already uploaded: a message names attachments, it never carries the bytes. */
    attachments?: ChatAttachment[];
}

export interface ChatSendActions {
    /** Shows the message at once as sending, then confirms it. Resolves with the confirmed message, or null if it failed. */
    send: (input: SendChatMessageInput) => Promise<Nullable<ChatMessage>>;
    /** Sends a failed message again **with the same `clientMessageId`**, so the server cannot store it twice. */
    retry: (clientMessageId: UUID) => Promise<Nullable<ChatMessage>>;
    /** Takes a failed message off the screen. */
    discard: (clientMessageId: UUID) => void;
}

/**
 * Sending, optimistically.
 *
 * The message appears the moment it is sent, keyed by a `clientMessageId` chosen here, and reads
 * "sending" until `chat-api` answers. A failure leaves it on screen as "not sent" with a retry that
 * presents the **same** id: when the first attempt actually reached the server and only its answer was
 * lost, the retry returns that first message (200 instead of 201) instead of sending it twice.
 */
export function useSendMessage(conversationId: Maybe<UUID>): ChatSendActions {
    const { client, pending } = useChatContext();
    const queryClient = useQueryClient();
    const id = conversationId ?? NO_ID;

    const deliver = useCallback(
        async (entry: ChatPendingMessage): Promise<Nullable<ChatMessage>> => {
            pending.update(entry.conversationId, entry.clientMessageId, { status: 'sending', error: null });
            try {
                const message = await client.sendMessage(entry.conversationId, {
                    clientMessageId: entry.clientMessageId,
                    body: entry.body,
                    replyToMessageId: entry.replyTo?.id ?? null,
                    attachmentIds: entry.attachments.map((attachment) => attachment.id),
                });
                updateWindow(queryClient, entry.conversationId, (window) => upsertMessage(window, message));
                pending.remove(entry.conversationId, entry.clientMessageId);
                void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inboxes() });

                return message;
            } catch (error: unknown) {
                pending.update(entry.conversationId, entry.clientMessageId, {
                    status: 'failed',
                    error: error instanceof ChatApiError ? error : ChatApiError.network(error),
                });

                return null;
            }
        },
        [client, pending, queryClient],
    );

    const send = useCallback(
        async (input: SendChatMessageInput): Promise<Nullable<ChatMessage>> => {
            const body = input.body?.trim() ?? '';
            const attachments = input.attachments ?? [];
            if (id === NO_ID || (body.length === 0 && attachments.length === 0)) return null;

            const entry: ChatPendingMessage = {
                clientMessageId: createClientMessageId(),
                conversationId: id,
                body: body.length > 0 ? body : null,
                replyTo: input.replyTo ?? null,
                attachments,
                status: 'sending',
                error: null,
                createdAt: new Date().toISOString(),
            };
            pending.add(entry);

            return deliver(entry);
        },
        [deliver, id, pending],
    );

    const retry = useCallback(
        async (clientMessageId: UUID): Promise<Nullable<ChatMessage>> => {
            const entry = pending.find(id, clientMessageId);

            return entry === undefined ? null : deliver(entry);
        },
        [deliver, id, pending],
    );

    const discard = useCallback(
        (clientMessageId: UUID): void => {
            pending.remove(id, clientMessageId);
        },
        [id, pending],
    );

    return { send, retry, discard };
}
