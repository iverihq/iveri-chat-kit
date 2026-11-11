import type { Maybe, UUID } from '@iveri/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { useChatContext } from '../provider/index.js';

import { updateConversationEverywhere } from './cache.js';

/** How long the newest visible message must stay the newest before it is reported read. */
export const MARK_READ_DEBOUNCE_MS = 500;

/**
 * Tells `chat-api` how far the person has read, at most once per pause and **only ever forward**.
 *
 * A thread scrolling through a burst of arrivals would otherwise send one request per message, and a
 * late answer to an earlier call could look like reading moving backwards. The highest `seq` already
 * reported is kept per conversation in the provider, so two screens showing one conversation do not
 * report the same position twice. The unread count drops at once, optimistically; the next refetch
 * settles it.
 */
export function useMarkRead(conversationId: Maybe<UUID>): (seq: number) => void {
    const { client, readMarks } = useChatContext();
    const queryClient = useQueryClient();
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wanted = useRef(0);

    useEffect(
        () => (): void => {
            if (timer.current !== null) clearTimeout(timer.current);
        },
        [],
    );

    return useCallback(
        (seq: number): void => {
            if (conversationId === null || conversationId === undefined || !Number.isFinite(seq)) return;
            if (seq <= (readMarks.get(conversationId) ?? 0) || seq <= wanted.current) return;

            wanted.current = seq;
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
                timer.current = null;
                const target = wanted.current;
                if (target <= (readMarks.get(conversationId) ?? 0)) return;

                readMarks.set(conversationId, target);
                updateConversationEverywhere(queryClient, conversationId, (summary) => ({
                    ...summary,
                    unreadCount: target >= summary.lastSeq ? 0 : summary.unreadCount,
                }));
                client.markRead(conversationId, { seq: target }).catch(() => {
                    // The poll reconciles: a failed read report costs a badge for a few seconds.
                    if (readMarks.get(conversationId) === target) readMarks.delete(conversationId);
                });
            }, MARK_READ_DEBOUNCE_MS);
        },
        [client, conversationId, queryClient, readMarks],
    );
}
