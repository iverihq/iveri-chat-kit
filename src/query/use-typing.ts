import type { Maybe, UUID } from '@iveri/contracts';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import { useChatContext } from '../provider/index.js';

/** The server accepts one typing signal per person and conversation every three seconds. */
export const TYPING_SEND_INTERVAL_MS = 3_000;

const NOBODY: readonly UUID[] = Object.freeze([]);

/**
 * Returns `notifyTyping`, to call on every keystroke: it sends at most one signal every three seconds.
 *
 * Fire and forget. A lost typing signal costs nothing, and the server stores none.
 */
export function useTyping(conversationId: Maybe<UUID>, now: () => number = Date.now): () => void {
    const { client } = useChatContext();
    const lastSent = useRef(Number.NEGATIVE_INFINITY);

    return useCallback(() => {
        if (conversationId === null || conversationId === undefined) return;
        const at = now();
        if (at - lastSent.current < TYPING_SEND_INTERVAL_MS) return;

        lastSent.current = at;
        client.typing(conversationId).catch(() => undefined);
    }, [client, conversationId, now]);
}

/**
 * Who is typing in a conversation now, from typing frames, **never including me**: my other devices send
 * typing frames too, and the line saying I am typing to myself would be noise. Each entry lasts six seconds.
 */
export function useTypingPeople(conversationId: Maybe<UUID>): readonly UUID[] {
    const { typing, currentUserId } = useChatContext();
    const everyone = useSyncExternalStore(
        typing.subscribe,
        () => (conversationId === null || conversationId === undefined ? NOBODY : typing.typing(conversationId)),
        () => NOBODY,
    );

    return useMemo(
        () =>
            everyone.some((userId) => userId === currentUserId)
                ? everyone.filter((userId) => userId !== currentUserId)
                : everyone,
        [everyone, currentUserId],
    );
}
