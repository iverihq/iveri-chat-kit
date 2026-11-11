import { ErrorCode, type Maybe } from '@iveri/contracts';
import { CHAT_REALTIME_NAMESPACE, CHAT_SOCKET_EVENT } from '@iveri/contracts/chat';
import type { ChatRealtimeFrame } from '@iveri/contracts/chat';
import { io } from 'socket.io-client';

import type { ChatClient } from '../client/index.js';

import type { ChatRealtimeStatus } from './poll-interval.js';

/** The part of a Socket.IO client socket this connection uses, so a spec can hand in a fake. */
export interface ChatSocket {
    readonly connected: boolean;
    on(event: string, listener: (...args: never[]) => void): unknown;
    connect(): unknown;
    disconnect(): unknown;
}

export interface ChatSocketOptions {
    auth: (callback: (data: Record<string, unknown>) => void) => void;
    transports: string[];
    autoConnect: boolean;
}

export type ChatSocketFactory = (url: string, options: ChatSocketOptions) => ChatSocket;

export const defaultSocketFactory: ChatSocketFactory = (url, options) => io(url, options);

interface ConnectionOptions {
    /** The gateway's origin, e.g. `http://localhost:3061`. The `/chat` namespace is appended here. */
    url: string;
    client: ChatClient;
    onFrame: (frame: ChatRealtimeFrame) => void;
    /** After every admission: what a reconnect missed is fetched again. */
    onReady: () => void;
    /**
     * Present a socket ticket from `chat-api` (`POST /realtime/ticket`) instead of the token itself. A
     * customer's app turns this on: its users' tokens are signed with an app secret only `chat-api` holds,
     * so `chat-realtime` cannot verify them. Off by default; Iveri's products present identity tokens.
     */
    useTicket?: boolean;
    socketFactory?: ChatSocketFactory;
}

/** Delays between attempts to come back after an expired token was refreshed. Capped, then given up. */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;
const MAX_RECONNECT_ATTEMPTS = 8;

interface GatewayError {
    code?: unknown;
}

/**
 * One socket per `ChatProvider`, open while at least one screen wants it.
 *
 * - **Reference counted.** The inbox and the open thread both want live updates; each holds the
 *   connection while mounted, and the socket closes when the last one lets go. A screen never opens a
 *   socket of its own.
 * - **The token is read at connect time, never captured.** Socket.IO calls `auth` on every attempt, so a
 *   reconnect presents whatever the app's session holds now.
 * - **An expired token refreshes and comes back.** `chat-realtime` sends `chat.error` and closes the
 *   socket the moment its token's `exp` passes, with `TOKEN_EXPIRED`. A close the server makes is never
 *   retried by Socket.IO itself, so the session is refreshed through the app's `onUnauthorized` and the
 *   socket reconnected with the new token, a bounded number of times.
 * - **Any other refusal is final.** `UNAUTHENTICATED` (a token the gateway cannot verify) and `FORBIDDEN`
 *   (a service credential) would be refused again, so the connection stops and the poll carries on.
 *   A gateway restart closes at the transport instead, and Socket.IO's own reconnection handles that.
 * - **With `useTicket`, a ticket is fetched for every attempt**, the first and each reconnect, Socket.IO's own
 *   included, because Socket.IO calls `auth` each time. A ticket expires with the token it was exchanged
 *   for, so one kept from an earlier attempt could be stale. **A ticket that does not arrive is the socket
 *   being down**: the attempt is abandoned, the poll carries on, and the connection tries again on the
 *   same capped delays, for as long as a screen holds it, as Socket.IO does after losing its transport.
 * - **Nothing here throws.** A socket that never connects leaves the kit on its fast poll, which is a
 *   slower product, not a broken one.
 */
export class ChatRealtimeConnection {
    private socket: ChatSocket | null = null;
    private status: ChatRealtimeStatus = 'off';
    private readonly holders = new Set<symbol>();
    private readonly listeners = new Set<() => void>();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private attempts = 0;

    constructor(private readonly options: ConnectionOptions) {}

    getStatus = (): ChatRealtimeStatus => this.status;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    /** Holds the connection open. The returned release is safe to call more than once. */
    acquire(): () => void {
        const holder = Symbol('chat-realtime-holder');
        this.holders.add(holder);
        if (this.socket === null) this.open();

        return () => {
            if (!this.holders.delete(holder)) return;
            if (this.holders.size === 0) this.shut();
        };
    }

    /** Closes everything at once, whoever still holds it. Used when the provider goes away. */
    close(): void {
        this.holders.clear();
        this.shut();
    }

    private open(): void {
        const socket = (this.options.socketFactory ?? defaultSocketFactory)(
            `${this.options.url.replace(/\/+$/u, '')}${CHAT_REALTIME_NAMESPACE}`,
            {
                auth: (callback) => {
                    void this.credential().then(
                        (token) => {
                            callback({ token: token ?? '' });
                        },
                        () => {
                            this.ticketFailed();
                        },
                    );
                },
                // A WebSocket from the first byte: long-polling would hold an HTTP request open per tab,
                // and the gateway is never reached through anything that cannot upgrade.
                transports: ['websocket'],
                autoConnect: true,
            },
        );

        socket.on(CHAT_SOCKET_EVENT.READY, () => {
            this.attempts = 0;
            this.setStatus('connected');
            this.options.onReady();
        });
        socket.on(CHAT_SOCKET_EVENT.FRAME, (frame: ChatRealtimeFrame) => {
            this.options.onFrame(frame);
        });
        socket.on(CHAT_SOCKET_EVENT.ERROR, (error: GatewayError) => {
            void this.recoverFrom(error);
        });
        socket.on('connect_error', () => {
            this.setStatus('disconnected');
        });
        socket.on('disconnect', () => {
            this.setStatus('disconnected');
        });

        this.socket = socket;
        this.setStatus('connecting');
    }

    /** What the next attempt presents. Rejects only when a ticket was asked for and did not come. */
    private async credential(): Promise<Maybe<string>> {
        if (this.options.useTicket === true) return (await this.options.client.createRealtimeTicket()).ticket;

        return this.options.client.getAccessToken().catch(() => null);
    }

    /**
     * The attempt is abandoned rather than sent with no credential: the gateway would refuse that as
     * `UNAUTHENTICATED`, which is final, when all that happened is `chat-api` not answering for a moment.
     */
    private ticketFailed(): void {
        const socket = this.socket;
        if (socket === null) return;
        socket.disconnect();
        this.setStatus('disconnected');
        this.scheduleReconnect({ untilReleased: true });
    }

    private async recoverFrom(error: GatewayError): Promise<void> {
        if (error.code !== ErrorCode.TOKEN_EXPIRED || !(await this.options.client.refreshAccessToken())) {
            this.setStatus('disconnected');

            return;
        }

        this.scheduleReconnect();
    }

    /**
     * `untilReleased` lifts the attempt cap: a ticket that did not arrive is an outage to wait out, where
     * an expired token that keeps being refused is a session that will not come back.
     */
    private scheduleReconnect({ untilReleased = false }: { untilReleased?: boolean } = {}): void {
        if (this.socket === null || this.reconnectTimer !== null) return;
        if (!untilReleased && this.attempts >= MAX_RECONNECT_ATTEMPTS) return;

        const delay = RECONNECT_DELAYS_MS[Math.min(this.attempts, RECONNECT_DELAYS_MS.length - 1)];
        this.attempts += 1;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            const socket = this.socket;
            if (socket === null) return;
            this.setStatus('connecting');
            socket.connect();
        }, delay);
    }

    private shut(): void {
        if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.attempts = 0;
        const socket = this.socket;
        this.socket = null;
        socket?.disconnect();
        this.setStatus('off');
    }

    private setStatus(status: ChatRealtimeStatus): void {
        if (this.status === status) return;
        this.status = status;
        for (const listener of this.listeners) listener();
    }
}
