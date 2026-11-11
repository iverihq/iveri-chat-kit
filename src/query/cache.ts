import type { UUID } from '@iveri/contracts';
import type { ChatConversation, ChatConversationSummary, ChatInboxPage } from '@iveri/contracts/chat';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { ChatMessageWindow } from '../util/index.js';

import { chatQueryKeys } from './query-keys.js';

type SummaryChange = (summary: ChatConversationSummary) => ChatConversationSummary;

/**
 * Applies one change to a conversation wherever the cache shows it: every inbox page and its detail.
 *
 * Used for the optimistic half of a setting (pin, mute, read) so the row moves under the person's
 * finger; the server's answer, or the next refetch, then settles it.
 */
export function updateConversationEverywhere(
    queryClient: QueryClient,
    conversationId: UUID,
    change: SummaryChange,
): void {
    queryClient.setQueriesData<InfiniteData<ChatInboxPage>>({ queryKey: chatQueryKeys.inboxes() }, (data) =>
        data === undefined
            ? data
            : {
                  ...data,
                  pages: data.pages.map((page) => ({
                      ...page,
                      conversations: page.conversations.map((summary) =>
                          summary.id === conversationId ? change(summary) : summary,
                      ),
                  })),
              },
    );
    queryClient.setQueryData<ChatConversation>(chatQueryKeys.conversation(conversationId), (conversation) =>
        conversation === undefined ? conversation : { ...conversation, ...change(conversation) },
    );
}

/** Stores a conversation the server returned in full, and refreshes every inbox it may have moved in. */
export async function storeConversation(queryClient: QueryClient, conversation: ChatConversation): Promise<void> {
    queryClient.setQueryData(chatQueryKeys.conversation(conversation.id), conversation);
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.inboxes() });
}

/** Changes a held window, and only one that exists: a conversation never opened has nothing to change. */
export function updateWindow(
    queryClient: QueryClient,
    conversationId: UUID,
    change: (window: ChatMessageWindow) => ChatMessageWindow,
): void {
    queryClient.setQueryData<ChatMessageWindow>(chatQueryKeys.messages(conversationId), (window) =>
        window === undefined ? window : change(window),
    );
}
