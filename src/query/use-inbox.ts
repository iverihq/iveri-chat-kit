import type { Maybe, UUID } from '@iveri/contracts';
import type { ChatConversation, ChatConversationSummary, ChatInboxFolder } from '@iveri/contracts/chat';
import { useInfiniteQuery, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { ChatApiError, ChatContextRef } from '../client/index.js';
import { useChatContext, useChatRealtimeStatus } from '../provider/index.js';
import { conversationPollInterval, inboxPollInterval } from '../realtime/index.js';

import { chatQueryKeys, NO_ID } from './query-keys.js';

export interface UseInboxOptions {
    /** Narrows to one product's context conversations: `'social'` for Ezo's Messages page. */
    product?: Maybe<string>;
    /** Page size. The server's default when absent. */
    limit?: number;
}

export interface ChatInboxState {
    conversations: ChatConversationSummary[];
    isLoading: boolean;
    isError: boolean;
    error: ChatApiError | null;
    hasMore: boolean;
    isLoadingMore: boolean;
    loadMore: () => void;
    refetch: () => void;
}

/**
 * One folder of the inbox, pinned first and then newest first (the server's order, kept as given),
 * paged by cursor. Polls every 15 s without a socket and every 30 s with one.
 */
export function useInbox(folder: ChatInboxFolder, options: UseInboxOptions = {}): ChatInboxState {
    const { client } = useChatContext();
    const status = useChatRealtimeStatus();
    const query = useInfiniteQuery({
        queryKey: chatQueryKeys.inbox(folder, options.product),
        queryFn: ({ pageParam, signal }) =>
            client.listConversations(
                { folder, cursor: pageParam, product: options.product, limit: options.limit },
                { signal },
            ),
        initialPageParam: null as Maybe<string>,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        refetchInterval: inboxPollInterval(status),
    });

    const conversations = useMemo(() => {
        // A conversation can move between pages while they are fetched one after another; the first
        // place it appears is where it belongs now.
        const seen = new Set<UUID>();

        return (query.data?.pages ?? [])
            .flatMap((page) => page.conversations)
            .filter((summary) => !seen.has(summary.id) && seen.add(summary.id));
    }, [query.data]);

    return {
        conversations,
        isLoading: query.isPending,
        isError: query.isError,
        error: query.error as ChatApiError | null,
        hasMore: query.hasNextPage,
        isLoadingMore: query.isFetchingNextPage,
        loadMore: (): void => {
            void query.fetchNextPage();
        },
        refetch: (): void => {
            void query.refetch();
        },
    };
}

/** One conversation in full: participants, my role and read state, the composer's `canSend`. */
export function useConversation(conversationId: Maybe<UUID>): UseQueryResult<ChatConversation, ChatApiError> {
    const { client } = useChatContext();
    const status = useChatRealtimeStatus();

    return useQuery<ChatConversation, ChatApiError>({
        queryKey: chatQueryKeys.conversation(conversationId ?? NO_ID),
        queryFn: ({ signal }) => client.getConversation(conversationId ?? NO_ID, { signal }),
        enabled: typeof conversationId === 'string' && conversationId.length > 0,
        refetchInterval: inboxPollInterval(status),
    });
}

/**
 * The conversation a product opened about something of its own, found by that thing.
 *
 * How an embedding page finds its conversation without its own API returning the id: Taxi's ride screen
 * asks for `{ product: 'taxi', type: 'ride', id: rideId }`. A 404 means "not a participant (yet)", which
 * an embedding page shows as no chat rather than as an error. The result is also stored under its id, so
 * the thread that renders next reads it from the cache.
 */
export function useConversationByContext(
    context: Maybe<ChatContextRef>,
): UseQueryResult<ChatConversation, ChatApiError> {
    const { client } = useChatContext();
    const queryClient = useQueryClient();
    const status = useChatRealtimeStatus();

    return useQuery<ChatConversation, ChatApiError>({
        queryKey: chatQueryKeys.conversationByContext(context ?? { product: '', type: '', id: '' }),
        queryFn: async ({ signal }) => {
            const conversation = await client.getConversationByContext(context ?? { product: '', type: '', id: '' }, {
                signal,
            });
            queryClient.setQueryData(chatQueryKeys.conversation(conversation.id), conversation);

            return conversation;
        },
        enabled: context !== null && context !== undefined,
        refetchInterval: conversationPollInterval(status),
        // A 404 here is an answer ("not yours, or not open yet"), not a failure worth three more tries.
        retry: (failureCount, error) => error.status !== 404 && failureCount < 2,
    });
}
