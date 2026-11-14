/**
 * Where the realtime connection stands. `off` means no gateway is configured, which is a supported
 * state: the kit then runs on the poll alone, and every screen still works.
 */
export type ChatRealtimeStatus = 'off' | 'connecting' | 'connected' | 'disconnected';

/**
 * How often an open screen asks `chat-api` again (the messenger plan, "Realtime").
 *
 * **The poll stays when the socket is up.** A frame is a hint; one lost while a phone switched networks
 * would otherwise leave a conversation silently behind until something else changed in it. With the
 * socket down the poll is the delivery mechanism and runs fast; with it up it is the recovery path and
 * runs slowly. "Connecting" counts as down: nothing has been heard yet.
 */
export const CHAT_POLL_INTERVAL_MS = {
    conversationWithoutSocket: 5_000,
    inboxWithoutSocket: 15_000,
    withSocket: 30_000,
    /** A call rings for 45 seconds, so a ring found by the poll alone must still be found in time to answer. */
    incomingCallsWithoutSocket: 4_000,
} as const;

export function conversationPollInterval(status: ChatRealtimeStatus): number {
    return status === 'connected' ? CHAT_POLL_INTERVAL_MS.withSocket : CHAT_POLL_INTERVAL_MS.conversationWithoutSocket;
}

export function inboxPollInterval(status: ChatRealtimeStatus): number {
    return status === 'connected' ? CHAT_POLL_INTERVAL_MS.withSocket : CHAT_POLL_INTERVAL_MS.inboxWithoutSocket;
}

export function incomingCallsPollInterval(status: ChatRealtimeStatus): number {
    return status === 'connected' ? CHAT_POLL_INTERVAL_MS.withSocket : CHAT_POLL_INTERVAL_MS.incomingCallsWithoutSocket;
}
