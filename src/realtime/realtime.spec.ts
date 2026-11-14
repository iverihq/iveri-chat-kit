import { ErrorCode } from '@iveri/contracts';
import { CHAT_SOCKET_EVENT, ChatRealtimeEvent } from '@iveri/contracts/chat';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatClient } from '../client/index.js';
import { chatQueryKeys } from '../query/query-keys.js';
import { fakeSocketFactory } from '../testing/fake-socket.js';
import { CONVERSATION, NINO } from '../testing/fixtures.js';

import { applyRealtimeFrame } from './frame-handler.js';
import { conversationPollInterval, inboxPollInterval } from './poll-interval.js';
import { ChatRealtimeConnection } from './realtime-connection.js';
import { ChatTypingStore, TYPING_EXPIRY_MS } from './typing-store.js';

function stubClient(
    tokens: string[],
    refreshes: boolean,
    createRealtimeTicket: () => Promise<{ ticket: string; expiresAt: string }> = vi.fn(),
): ChatClient {
    let index = 0;

    return {
        createRealtimeTicket,
        getAccessToken: () => Promise.resolve(tokens[Math.min(index, tokens.length - 1)]),
        refreshAccessToken: vi.fn(() => {
            index += 1;

            return Promise.resolve(refreshes);
        }),
    } as unknown as ChatClient;
}

describe('ChatRealtimeConnection', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('opens one socket for every holder, on the chat namespace, and closes it with the last', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const connection = new ChatRealtimeConnection({
            url: 'http://rt.test/',
            client: stubClient(['token-1'], true),
            socketFactory: factory,
            onFrame: () => undefined,
            onReady: () => undefined,
        });

        const releaseInbox = connection.acquire();
        const releaseThread = connection.acquire();
        expect(sockets).toHaveLength(1);
        expect(sockets[0].url).toBe('http://rt.test/chat');
        await expect(sockets[0].presentedToken()).resolves.toBe('token-1');
        expect(connection.getStatus()).toBe('connecting');

        releaseInbox();
        releaseInbox();
        expect(sockets[0].disconnectCalls).toBe(0);
        releaseThread();
        expect(sockets[0].disconnectCalls).toBe(1);
        expect(connection.getStatus()).toBe('off');
    });

    it('is connected only once the gateway has said ready, and recovers what it missed then', () => {
        const { factory, sockets } = fakeSocketFactory();
        const onReady = vi.fn();
        const frames: unknown[] = [];
        const connection = new ChatRealtimeConnection({
            url: 'http://rt.test',
            client: stubClient(['t'], true),
            socketFactory: factory,
            onFrame: (frame) => frames.push(frame),
            onReady,
        });
        connection.acquire();

        sockets[0].emit('connect');
        expect(connection.getStatus()).toBe('connecting');
        sockets[0].emit(CHAT_SOCKET_EVENT.READY, {});
        expect(connection.getStatus()).toBe('connected');
        expect(onReady).toHaveBeenCalledTimes(1);

        sockets[0].emit(CHAT_SOCKET_EVENT.FRAME, {
            event: ChatRealtimeEvent.INBOX_UPDATED,
            conversationId: null,
            seq: null,
            userId: null,
        });
        expect(frames).toHaveLength(1);
    });

    it('refreshes the session on TOKEN_EXPIRED and reconnects with the new token', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const client = stubClient(['old', 'new'], true);
        const connection = new ChatRealtimeConnection({
            url: 'http://rt.test',
            client,
            socketFactory: factory,
            onFrame: () => undefined,
            onReady: () => undefined,
        });
        connection.acquire();
        sockets[0].emit(CHAT_SOCKET_EVENT.READY, {});

        sockets[0].emit(CHAT_SOCKET_EVENT.ERROR, { code: ErrorCode.TOKEN_EXPIRED, message: 'expired' });
        sockets[0].emit('disconnect', 'io server disconnect');
        await vi.runAllTimersAsync();

        expect(client.refreshAccessToken).toHaveBeenCalledTimes(1);
        expect(sockets[0].connectCalls).toBe(1);
        await expect(sockets[0].presentedToken()).resolves.toBe('new');
    });

    it('stops on UNAUTHENTICATED and FORBIDDEN and leaves the poll to carry on', async () => {
        for (const code of [ErrorCode.UNAUTHENTICATED, ErrorCode.FORBIDDEN]) {
            const { factory, sockets } = fakeSocketFactory();
            const client = stubClient(['t'], true);
            const connection = new ChatRealtimeConnection({
                url: 'http://rt.test',
                client,
                socketFactory: factory,
                onFrame: () => undefined,
                onReady: () => undefined,
            });
            connection.acquire();

            sockets[0].emit(CHAT_SOCKET_EVENT.ERROR, { code, message: 'no' });
            await vi.runAllTimersAsync();

            expect(client.refreshAccessToken).not.toHaveBeenCalled();
            expect(sockets[0].connectCalls).toBe(0);
            expect(connection.getStatus()).toBe('disconnected');
        }
    });

    it('stops when the session cannot be refreshed', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const connection = new ChatRealtimeConnection({
            url: 'http://rt.test',
            client: stubClient(['t'], false),
            socketFactory: factory,
            onFrame: () => undefined,
            onReady: () => undefined,
        });
        connection.acquire();

        sockets[0].emit(CHAT_SOCKET_EVENT.ERROR, { code: ErrorCode.TOKEN_EXPIRED, message: 'expired' });
        await vi.runAllTimersAsync();

        expect(sockets[0].connectCalls).toBe(0);
        expect(connection.getStatus()).toBe('disconnected');
    });
});

describe('ChatRealtimeConnection with a socket ticket', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const ticketsInTurn = (): ReturnType<typeof vi.fn<() => Promise<{ ticket: string; expiresAt: string }>>> => {
        let issued = 0;

        return vi.fn(() => {
            issued += 1;

            return Promise.resolve({ ticket: `ticket-${String(issued)}`, expiresAt: '2026-11-12T12:00:00.000Z' });
        });
    };

    it('presents a fresh ticket from chat-api on every attempt, never the token itself', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const createRealtimeTicket = ticketsInTurn();
        const connection = new ChatRealtimeConnection({
            url: 'http://rt.test',
            client: stubClient(['app-token'], true, createRealtimeTicket),
            useTicket: true,
            socketFactory: factory,
            onFrame: () => undefined,
            onReady: () => undefined,
        });
        connection.acquire();

        await expect(sockets[0].presentedToken()).resolves.toBe('ticket-1');
        // A reconnect, Socket.IO's own or ours, asks again: a kept ticket may have expired with its token.
        await expect(sockets[0].presentedToken()).resolves.toBe('ticket-2');
        expect(createRealtimeTicket).toHaveBeenCalledTimes(2);
    });

    it('is off by default, which presents the token and asks chat-api for nothing', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const createRealtimeTicket = ticketsInTurn();
        const connection = new ChatRealtimeConnection({
            url: 'http://rt.test',
            client: stubClient(['identity-token'], true, createRealtimeTicket),
            socketFactory: factory,
            onFrame: () => undefined,
            onReady: () => undefined,
        });
        connection.acquire();

        await expect(sockets[0].presentedToken()).resolves.toBe('identity-token');
        expect(createRealtimeTicket).not.toHaveBeenCalled();
    });

    it('treats a ticket that does not arrive as the socket being down, and keeps trying while held', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const createRealtimeTicket = vi.fn(() => Promise.reject(new Error('chat-api is not answering')));
        const connection = new ChatRealtimeConnection({
            url: 'http://rt.test',
            client: stubClient(['app-token'], true, createRealtimeTicket),
            useTicket: true,
            socketFactory: factory,
            onFrame: () => undefined,
            onReady: () => undefined,
        });
        connection.acquire();

        // Further than the eight attempts an expired session gets: an outage is waited out.
        for (let attempt = 1; attempt <= 10; attempt += 1) {
            sockets[0].attempt();
            await vi.advanceTimersByTimeAsync(0);
            // Abandoned, never sent empty: the gateway would call an empty credential final.
            expect(sockets[0].disconnectCalls).toBe(attempt);
            expect(connection.getStatus()).toBe('disconnected');
            await vi.advanceTimersByTimeAsync(30_000);
            expect(sockets[0].connectCalls).toBe(attempt);
        }

        expect(createRealtimeTicket).toHaveBeenCalledTimes(10);
    });

    it('comes back once a ticket arrives again', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const createRealtimeTicket = vi
            .fn<() => Promise<{ ticket: string; expiresAt: string }>>()
            .mockRejectedValueOnce(new Error('down'))
            .mockResolvedValue({ ticket: 'ticket-ok', expiresAt: '2026-11-12T12:00:00.000Z' });
        const onReady = vi.fn();
        const connection = new ChatRealtimeConnection({
            url: 'http://rt.test',
            client: stubClient(['app-token'], true, createRealtimeTicket),
            useTicket: true,
            socketFactory: factory,
            onFrame: () => undefined,
            onReady,
        });
        connection.acquire();

        sockets[0].attempt();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(sockets[0].connectCalls).toBe(1);

        await expect(sockets[0].presentedToken()).resolves.toBe('ticket-ok');
        sockets[0].emit(CHAT_SOCKET_EVENT.READY, {});
        expect(connection.getStatus()).toBe('connected');
        expect(onReady).toHaveBeenCalledTimes(1);
    });

    it('stops trying once the last screen lets go', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const connection = new ChatRealtimeConnection({
            url: 'http://rt.test',
            client: stubClient(['app-token'], true, () => Promise.reject(new Error('down'))),
            useTicket: true,
            socketFactory: factory,
            onFrame: () => undefined,
            onReady: () => undefined,
        });
        const release = connection.acquire();

        sockets[0].attempt();
        await vi.advanceTimersByTimeAsync(0);
        release();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(sockets[0].connectCalls).toBe(0);
        expect(connection.getStatus()).toBe('off');
    });

    it('refreshes the session on TOKEN_EXPIRED and reconnects with a ticket for the new token', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const client = stubClient(['old', 'new'], true, ticketsInTurn());
        const connection = new ChatRealtimeConnection({
            url: 'http://rt.test',
            client,
            useTicket: true,
            socketFactory: factory,
            onFrame: () => undefined,
            onReady: () => undefined,
        });
        connection.acquire();
        await expect(sockets[0].presentedToken()).resolves.toBe('ticket-1');
        sockets[0].emit(CHAT_SOCKET_EVENT.READY, {});

        sockets[0].emit(CHAT_SOCKET_EVENT.ERROR, { code: ErrorCode.TOKEN_EXPIRED, message: 'expired' });
        await vi.runAllTimersAsync();

        expect(client.refreshAccessToken).toHaveBeenCalledTimes(1);
        expect(sockets[0].connectCalls).toBe(1);
        await expect(sockets[0].presentedToken()).resolves.toBe('ticket-2');
    });
});

describe('poll intervals', () => {
    it('polls fast without a socket and slowly with one', () => {
        expect(conversationPollInterval('off')).toBe(5_000);
        expect(conversationPollInterval('connecting')).toBe(5_000);
        expect(inboxPollInterval('disconnected')).toBe(15_000);
        expect(conversationPollInterval('connected')).toBe(30_000);
        expect(inboxPollInterval('connected')).toBe(30_000);
    });
});

describe('ChatTypingStore', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('forgets somebody six seconds after their last typing frame, and renews on each frame', () => {
        const store = new ChatTypingStore();
        const changes = vi.fn();
        store.subscribe(changes);

        store.add(CONVERSATION, NINO);
        expect(store.typing(CONVERSATION)).toEqual([NINO]);
        const snapshot = store.typing(CONVERSATION);

        vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1_000);
        store.add(CONVERSATION, NINO);
        expect(store.typing(CONVERSATION)).toBe(snapshot);

        vi.advanceTimersByTime(TYPING_EXPIRY_MS - 1);
        expect(store.typing(CONVERSATION)).toEqual([NINO]);
        vi.advanceTimersByTime(1);
        expect(store.typing(CONVERSATION)).toEqual([]);
        expect(changes).toHaveBeenCalledTimes(2);
    });
});

describe('applyRealtimeFrame', () => {
    it('invalidates exactly the conversation a frame names, its detail, and the inboxes', async () => {
        const queryClient = new QueryClient();
        const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        for (const key of [
            chatQueryKeys.messages(CONVERSATION),
            chatQueryKeys.conversation(CONVERSATION),
            chatQueryKeys.inbox('inbox', null),
            chatQueryKeys.messages(other),
            chatQueryKeys.profile(),
        ]) {
            queryClient.setQueryData(key, {});
        }

        await applyRealtimeFrame(
            { event: ChatRealtimeEvent.CONVERSATION_UPDATED, conversationId: CONVERSATION, seq: 12, userId: null },
            { queryClient, typing: new ChatTypingStore() },
        );

        const stale = queryClient
            .getQueryCache()
            .getAll()
            .filter((query) => query.isStale())
            .map((query) => query.queryKey);
        expect(stale).toEqual(
            expect.arrayContaining([
                chatQueryKeys.messages(CONVERSATION),
                chatQueryKeys.conversation(CONVERSATION),
                chatQueryKeys.inbox('inbox', null),
            ]),
        );
        expect(queryClient.getQueryState(chatQueryKeys.messages(other as never))?.isInvalidated).toBe(false);
        expect(queryClient.getQueryState(chatQueryKeys.profile())?.isInvalidated).toBe(false);
    });

    it('looks again at every call query on a call frame, and at nothing else', async () => {
        const queryClient = new QueryClient();
        const call = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        for (const key of [
            chatQueryKeys.call(call),
            chatQueryKeys.currentCall(CONVERSATION),
            chatQueryKeys.incomingCalls(),
            chatQueryKeys.messages(CONVERSATION),
        ]) {
            queryClient.setQueryData(key, {});
        }

        await applyRealtimeFrame(
            {
                event: ChatRealtimeEvent.CALL_UPDATED,
                conversationId: CONVERSATION,
                seq: null,
                userId: null,
                callId: call,
            },
            { queryClient, typing: new ChatTypingStore() },
        );

        expect(queryClient.getQueryState(chatQueryKeys.call(call as never))?.isInvalidated).toBe(true);
        expect(queryClient.getQueryState(chatQueryKeys.currentCall(CONVERSATION))?.isInvalidated).toBe(true);
        expect(queryClient.getQueryState(chatQueryKeys.incomingCalls())?.isInvalidated).toBe(true);
        expect(queryClient.getQueryState(chatQueryKeys.messages(CONVERSATION))?.isInvalidated).toBe(false);
    });

    it('puts a typing frame in the typing line', async () => {
        const typing = new ChatTypingStore();
        await applyRealtimeFrame(
            { event: ChatRealtimeEvent.CONVERSATION_TYPING, conversationId: CONVERSATION, seq: null, userId: NINO },
            { queryClient: new QueryClient(), typing },
        );
        expect(typing.typing(CONVERSATION)).toEqual([NINO]);
        typing.clear();
    });

    it('takes somebody out of the typing line at once on a stop frame', async () => {
        const typing = new ChatTypingStore();
        const context = { queryClient: new QueryClient(), typing };
        const frame = {
            event: ChatRealtimeEvent.CONVERSATION_TYPING,
            conversationId: CONVERSATION,
            seq: null,
        } as const;

        await applyRealtimeFrame({ ...frame, userId: NINO, isTyping: true }, context);
        expect(typing.typing(CONVERSATION)).toEqual([NINO]);

        await applyRealtimeFrame({ ...frame, userId: NINO, isTyping: false }, context);
        expect(typing.typing(CONVERSATION)).toEqual([]);
        typing.clear();
    });
});
