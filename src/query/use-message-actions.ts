import type { Maybe, Nullable, UUID } from '@iveri/contracts';
import type { ChatMessage } from '@iveri/contracts/chat';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { ChatApiError, ChatDeleteScope } from '../client/index.js';
import { useChatContext } from '../provider/index.js';
import {
    applyMyReaction,
    markDeleted,
    removeMessage,
    updateMessage,
    upsertMessage,
    type ChatMessageWindow,
} from '../util/index.js';

import { updateWindow } from './cache.js';
import { chatQueryKeys, NO_ID } from './query-keys.js';

export interface EditChatMessageInput {
    messageId: UUID;
    body: string;
}

/** Changes a message's text. Author only, text only, within the edit window; `EDIT_WINDOW_PASSED` otherwise. */
export function useEditMessage(
    conversationId: Maybe<UUID>,
): UseMutationResult<ChatMessage, ChatApiError, EditChatMessageInput> {
    const { client } = useChatContext();
    const queryClient = useQueryClient();

    return useMutation<ChatMessage, ChatApiError, EditChatMessageInput>({
        mutationFn: ({ messageId, body }) => client.editMessage(messageId, { body: body.trim() }),
        onSuccess: (message) => {
            updateWindow(queryClient, conversationId ?? message.conversationId, (window) =>
                upsertMessage(window, message),
            );
            void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inboxes() });
        },
    });
}

export interface DeleteChatMessageInput {
    messageId: UUID;
    scope: ChatDeleteScope;
}

/**
 * Deletes a message for everyone (it keeps its place as "deleted", so replies to it still make sense)
 * or for me (it leaves my screen only).
 */
export function useDeleteMessage(
    conversationId: Maybe<UUID>,
): UseMutationResult<void, ChatApiError, DeleteChatMessageInput> {
    const { client } = useChatContext();
    const queryClient = useQueryClient();

    return useMutation<void, ChatApiError, DeleteChatMessageInput>({
        mutationFn: ({ messageId, scope }) => client.deleteMessage(messageId, scope),
        onSuccess: (_, { messageId, scope }) => {
            if (conversationId === null || conversationId === undefined) return;
            updateWindow(queryClient, conversationId, (window) =>
                scope === 'me' ? removeMessage(window, messageId) : updateMessage(window, messageId, markDeleted),
            );
            void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inboxes() });
        },
    });
}

export interface ReactToChatMessageInput {
    messageId: UUID;
    /** `null` takes my reaction away. */
    emoji: Nullable<string>;
}

interface ReactionRollback {
    previous: ChatMessageWindow | undefined;
}

/**
 * Reacts to a message, optimistically: the chip moves at once, and is put back if `chat-api` refuses.
 * One reaction per person per message, so a new emoji replaces mine.
 */
export function useReaction(
    conversationId: Maybe<UUID>,
): UseMutationResult<ChatMessage, ChatApiError, ReactToChatMessageInput, ReactionRollback> {
    const { client } = useChatContext();
    const queryClient = useQueryClient();
    const key = chatQueryKeys.messages(conversationId ?? NO_ID);

    return useMutation<ChatMessage, ChatApiError, ReactToChatMessageInput, ReactionRollback>({
        mutationFn: ({ messageId, emoji }) =>
            emoji === null ? client.unreact(messageId) : client.react(messageId, { emoji }),
        onMutate: async ({ messageId, emoji }) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<ChatMessageWindow>(key);
            if (conversationId !== null && conversationId !== undefined) {
                updateWindow(queryClient, conversationId, (window) =>
                    updateMessage(window, messageId, (message) => ({
                        ...message,
                        reactions: applyMyReaction(message.reactions, emoji),
                    })),
                );
            }

            return { previous };
        },
        onError: (_error, _input, rollback) => {
            if (rollback?.previous !== undefined) queryClient.setQueryData(key, rollback.previous);
        },
        onSuccess: (message) => {
            updateWindow(queryClient, message.conversationId, (window) => upsertMessage(window, message));
        },
    });
}
