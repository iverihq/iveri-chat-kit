import type { Maybe, UUID } from '@iveri/contracts';
import type { ChatCallHistoryEntry } from '@iveri/contracts/chat';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { ChatApiError } from '../client/index.js';
import { useChatContext, useChatRealtimeStatus } from '../provider/index.js';
import { inboxPollInterval } from '../realtime/index.js';

import { chatQueryKeys } from './query-keys.js';

export interface ChatCallHistoryState {
    calls: ChatCallHistoryEntry[];
    isLoading: boolean;
    isError: boolean;
    error: ChatApiError | null;
    hasMore: boolean;
    isLoadingMore: boolean;
    loadMore: () => void;
    refetch: () => void;
}

/**
 * My calls in every conversation, newest first, paged by cursor; `missedOnly` keeps the ones I missed. A call frame
 * refreshes it (it sits under the calls key), and it polls like the inbox while the socket is down.
 */
export function useCallHistory(options: { missedOnly?: boolean; limit?: number } = {}): ChatCallHistoryState {
    const { client, currentUserId } = useChatContext();
    const status = useChatRealtimeStatus();
    const missedOnly = options.missedOnly ?? false;
    const query = useInfiniteQuery({
        queryKey: chatQueryKeys.callHistory(missedOnly),
        queryFn: ({ pageParam, signal }) =>
            client.listCallHistory(
                { cursor: pageParam ?? undefined, limit: options.limit, missed: missedOnly },
                { signal },
            ),
        initialPageParam: null as Maybe<string>,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        refetchInterval: inboxPollInterval(status),
        enabled: currentUserId !== null,
    });

    const calls = useMemo(() => {
        const seen = new Set<UUID>();

        return (query.data?.pages ?? [])
            .flatMap((page) => page.calls)
            .filter((call) => !seen.has(call.id) && seen.add(call.id));
    }, [query.data]);

    return {
        calls,
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
