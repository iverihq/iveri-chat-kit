import type { Maybe, UUID } from '@iveri/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { ChatApiError, ChatClient } from '../client/index.js';
import { useChatContext, useChatRealtimeStatus } from '../provider/index.js';
import { conversationPollInterval } from '../realtime/index.js';
import {
    EMPTY_WINDOW,
    messageItem,
    newestSeq,
    oldestSeq,
    pendingItem,
    prependOlder,
    replaceRange,
    windowFromPage,
    type ChatMessageWindow,
    type ChatPendingMessage,
    type ChatThreadItem,
} from '../util/index.js';

import { chatQueryKeys, NO_ID } from './query-keys.js';

/** Messages asked for per request. */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * How many of the newest held messages are read again on every refresh. An edit, a reaction or a
 * deletion does not move the conversation's `seq`, so catching up "after the newest" alone would never
 * see one; re-reading the tail does, at the cost of a slightly longer response.
 */
export const TAIL_REREAD = 20;

/** A bound on catching up, so a conversation thousands of messages ahead cannot hold a request loop. */
const MAX_CATCH_UP_PAGES = 20;

const NO_PENDING: readonly ChatPendingMessage[] = Object.freeze([]);

/**
 * Brings a held window up to date: everything after its newest message, plus its tail re-read.
 *
 * The first load asks for the newest page. After that a refresh asks `afterSeq` from a little before
 * the newest message held, and replaces that whole range with the answer, so messages that arrived,
 * changed or were deleted for me are all right afterwards, while older pages the person scrolled back
 * through are kept. If more than a page arrived it keeps asking from where the last page ended.
 */
export async function refreshMessageWindow(
    client: ChatClient,
    conversationId: UUID,
    held: Maybe<ChatMessageWindow>,
    signal?: AbortSignal,
): Promise<ChatMessageWindow> {
    if (held === null || held === undefined || held.messages.length === 0) {
        return windowFromPage(await client.listMessages(conversationId, {}, { signal }));
    }

    let window = held;
    let afterSeq = Math.max((oldestSeq(held) ?? 1) - 1, newestSeq(held) - TAIL_REREAD, 0);

    for (let page = 0; page < MAX_CATCH_UP_PAGES; page += 1) {
        const response = await client.listMessages(conversationId, { afterSeq, limit: MESSAGE_PAGE_SIZE }, { signal });
        const isLastPage = response.messages.length < MESSAGE_PAGE_SIZE;
        const throughSeq = isLastPage ? Number.MAX_SAFE_INTEGER : (response.messages.at(-1)?.seq ?? afterSeq);
        window = replaceRange(window, response.messages, { afterSeq, throughSeq }, response.lastSeq);

        if (isLastPage || throughSeq <= afterSeq) break;
        afterSeq = throughSeq;
    }

    return window;
}

export interface ChatMessagesState {
    /** Confirmed messages, oldest first, then the person's own still on their way. */
    items: ChatThreadItem[];
    window: ChatMessageWindow;
    isLoading: boolean;
    isError: boolean;
    error: ChatApiError | null;
    hasOlder: boolean;
    isLoadingOlder: boolean;
    /** Prepends the page before the oldest message held. Resolves once it is in the window. */
    loadOlder: () => Promise<void>;
    refetch: () => void;
}

/**
 * A conversation's messages, kept current by frames and by the poll (every 5 s without a socket, every
 * 30 s with one).
 *
 * A pending message is listed until a confirmed message with the same `clientMessageId` exists, which
 * is how a send whose response was lost, and a frame that fetched the message first, both settle into
 * exactly one row.
 */
export function useMessages(conversationId: Maybe<UUID>): ChatMessagesState {
    const { client, pending, typing } = useChatContext();
    const queryClient = useQueryClient();
    const status = useChatRealtimeStatus();
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const loadingOlder = useRef(false);
    const id = conversationId ?? NO_ID;
    const key = chatQueryKeys.messages(id);

    const query = useQuery<ChatMessageWindow, ChatApiError>({
        queryKey: key,
        queryFn: async ({ signal }) => {
            const held = queryClient.getQueryData<ChatMessageWindow>(key);
            const next = await refreshMessageWindow(client, id, held, signal);
            // Somebody whose message just arrived has stopped typing it, whatever their last frame said.
            const heldNewest = held === undefined ? 0 : newestSeq(held);
            for (const message of next.messages) {
                if (message.seq > heldNewest && message.sender !== null) typing.remove(id, message.sender.userId);
            }

            return next;
        },
        enabled: id !== NO_ID,
        refetchInterval: conversationPollInterval(status),
    });

    const pendingMessages = useSyncExternalStore(
        pending.subscribe,
        () => (id !== NO_ID ? pending.list(id) : NO_PENDING),
        () => NO_PENDING,
    );

    const window = query.data ?? EMPTY_WINDOW;

    const items = useMemo(() => {
        const confirmed = new Set(
            window.messages.flatMap((message) => (message.clientMessageId === null ? [] : [message.clientMessageId])),
        );

        return [
            ...window.messages.map(messageItem),
            ...pendingMessages.filter((entry) => !confirmed.has(entry.clientMessageId)).map(pendingItem),
        ];
    }, [window, pendingMessages]);

    const loadOlder = useCallback(async (): Promise<void> => {
        const held = queryClient.getQueryData<ChatMessageWindow>(chatQueryKeys.messages(id));
        const before = held === undefined ? null : oldestSeq(held);
        if (loadingOlder.current || held === undefined || !held.hasOlder || before === null) return;

        loadingOlder.current = true;
        setIsLoadingOlder(true);
        try {
            const page = await client.listMessages(id, { beforeSeq: before, limit: MESSAGE_PAGE_SIZE });
            queryClient.setQueryData<ChatMessageWindow>(chatQueryKeys.messages(id), (current) =>
                current === undefined ? current : prependOlder(current, page),
            );
        } finally {
            loadingOlder.current = false;
            setIsLoadingOlder(false);
        }
    }, [client, id, queryClient]);

    return {
        items,
        window,
        isLoading: query.isPending && id !== NO_ID,
        isError: query.isError,
        error: query.error,
        hasOlder: window.hasOlder,
        isLoadingOlder,
        loadOlder,
        refetch: (): void => {
            void query.refetch();
        },
    };
}
