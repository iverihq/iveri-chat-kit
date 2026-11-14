import type { Maybe, UUID } from '@iveri/contracts';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import type { ChatClient } from '../client/index.js';
import { useChatContext } from '../provider/index.js';

/** The server accepts one typing start per person and conversation every three seconds. */
export const TYPING_SEND_INTERVAL_MS = 3_000;

/**
 * **Assumed:** how long the window or the app may be away, with text still in the field, before the others are told
 * I stopped. Long enough that switching tabs to copy something does not flicker the line on the other side, short
 * enough that nobody reads "typing" for somebody who walked off.
 */
export const TYPING_STOP_AFTER_LEAVING_MS = 2_000;

const NOBODY: readonly UUID[] = Object.freeze([]);

export interface ChatTyping {
    /** Call on every keystroke that leaves text in the field. Sends at most one start every three seconds. */
    start: () => void;
    /**
     * Call when the field empties or a message is sent. Sends one stop, and only after a start: two stops in a
     * row say nothing new. Resets the throttle, so the next keystroke is announced at once.
     */
    stop: () => void;
    /** The window or the app lost focus with text still in the field: stop after a short delay. */
    leave: () => void;
    /** Focus came back before that delay ran out: nothing is sent. */
    resume: () => void;
}

interface TypingState {
    conversationId: Maybe<UUID>;
    lastStart: number;
    /** A start has gone out with no stop after it. */
    isAnnounced: boolean;
    leaving: Maybe<ReturnType<typeof setTimeout>>;
}

const sendStop = (client: ChatClient, state: TypingState): void => {
    if (state.leaving !== undefined && state.leaving !== null) clearTimeout(state.leaving);
    state.leaving = null;
    const id = state.conversationId;
    if (!state.isAnnounced || id === null || id === undefined) return;

    state.isAnnounced = false;
    state.lastStart = Number.NEGATIVE_INFINITY;
    client.typing(id, false).catch(() => undefined);
};

/**
 * Says when I start and stop typing in a conversation. Fire and forget: a lost signal costs nothing, because a reader
 * drops a typist six seconds after their last frame anyway, and the server stores none.
 *
 * A stop is also sent when the conversation changes or the composer goes away, so the others are not left reading
 * "typing" for somebody who moved on.
 */
export function useTyping(conversationId: Maybe<UUID>, now: () => number = Date.now): ChatTyping {
    const { client } = useChatContext();
    const state = useRef<TypingState>({
        conversationId,
        lastStart: Number.NEGATIVE_INFINITY,
        isAnnounced: false,
        leaving: null,
    });

    useEffect(() => {
        const current = state.current;
        current.conversationId = conversationId;
        current.lastStart = Number.NEGATIVE_INFINITY;
        current.isAnnounced = false;

        return (): void => {
            sendStop(client, current);
        };
    }, [client, conversationId]);

    const start = useCallback(() => {
        const current = state.current;
        const id = current.conversationId;
        if (id === null || id === undefined) return;
        if (current.leaving !== undefined && current.leaving !== null) clearTimeout(current.leaving);
        current.leaving = null;
        const at = now();
        if (at - current.lastStart < TYPING_SEND_INTERVAL_MS) return;

        current.lastStart = at;
        current.isAnnounced = true;
        client.typing(id).catch(() => undefined);
    }, [client, now]);

    const stop = useCallback(() => {
        sendStop(client, state.current);
    }, [client]);

    const leave = useCallback(() => {
        const current = state.current;
        if (!current.isAnnounced || (current.leaving !== undefined && current.leaving !== null)) return;
        current.leaving = setTimeout(() => {
            current.leaving = null;
            sendStop(client, current);
        }, TYPING_STOP_AFTER_LEAVING_MS);
    }, [client]);

    const resume = useCallback(() => {
        const current = state.current;
        if (current.leaving !== undefined && current.leaving !== null) clearTimeout(current.leaving);
        current.leaving = null;
    }, []);

    return useMemo(() => ({ start, stop, leave, resume }), [start, stop, leave, resume]);
}

/**
 * Who is typing in a conversation now, from typing frames, **never including me**: my other devices send
 * typing frames too, and the line saying I am typing to myself would be noise. Each entry lasts six seconds
 * after its last start frame, or until a stop frame or a message from that person.
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
