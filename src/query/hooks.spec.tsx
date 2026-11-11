import { CHAT_SOCKET_EVENT, ChatRealtimeEvent } from '@iveri/contracts/chat';
import type { ChatMessage, SendChatMessageRequest } from '@iveri/contracts/chat';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatRealtime } from '../provider/index.js';
import { fakeSocketFactory } from '../testing/fake-socket.js';
import { CONVERSATION, conversation, message, ownMessage } from '../testing/fixtures.js';
import { createHarness } from '../testing/render.js';

import { chatQueryKeys } from './query-keys.js';
import { useMarkRead } from './use-mark-read.js';
import { useMessages } from './use-messages.js';
import { useSendMessage } from './use-send-message.js';
import { useTyping } from './use-typing.js';

const MESSAGES = `/conversations/${CONVERSATION}/messages`;

function page(messages: ChatMessage[], lastSeq = messages.at(-1)?.seq ?? 0): { body: unknown } {
    return { body: { messages, hasOlder: false, lastSeq } };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('useSendMessage', () => {
    it('shows the message at once as sending, then replaces it with the confirmed one', async () => {
        const harness = createHarness();
        harness.stub.on('GET', MESSAGES, () => page([message({ seq: 1 })]));
        harness.stub.on('POST', MESSAGES, (request) => {
            const body = request.body as SendChatMessageRequest;
            const confirmed = ownMessage({ seq: 2, body: body.body ?? null, clientMessageId: body.clientMessageId });

            return { status: 201, body: confirmed };
        });
        const { result } = renderHook(
            () => ({ messages: useMessages(CONVERSATION), send: useSendMessage(CONVERSATION) }),
            {
                wrapper: harness.wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.messages.items).toHaveLength(1);
        });

        let sending: Promise<unknown> = Promise.resolve();
        act(() => {
            sending = result.current.send.send({ body: '  hello  ' });
        });

        expect(result.current.messages.items.at(-1)).toMatchObject({
            type: 'pending',
            pending: { body: 'hello', status: 'sending' },
        });
        await act(async () => {
            await sending;
        });

        const items = result.current.messages.items;
        expect(items).toHaveLength(2);
        expect(items[1]).toMatchObject({ type: 'message', message: { seq: 2, body: 'hello', isOwn: true } });
        const sent = harness.stub.requests.find((request) => request.method === 'POST');
        expect((sent?.body as SendChatMessageRequest).clientMessageId).toMatch(/^[0-9a-f-]{36}$/u);
    });

    it('keeps a failed message with its retry, and retries with the same clientMessageId', async () => {
        const harness = createHarness();
        harness.stub.on('GET', MESSAGES, () => page([]));
        let attempts = 0;
        harness.stub.on('POST', MESSAGES, (request) => {
            attempts += 1;
            const body = request.body as SendChatMessageRequest;
            if (attempts === 1)
                return { status: 503, body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'down' } } };

            return {
                status: 200,
                body: ownMessage({ seq: 1, body: body.body ?? null, clientMessageId: body.clientMessageId }),
            };
        });
        const { result } = renderHook(
            () => ({ messages: useMessages(CONVERSATION), send: useSendMessage(CONVERSATION) }),
            {
                wrapper: harness.wrapper,
            },
        );
        await waitFor(() => {
            expect(result.current.messages.isLoading).toBe(false);
        });

        await act(async () => {
            await result.current.send.send({ body: 'are you there?' });
        });
        const failed = result.current.messages.items[0];
        expect(failed).toMatchObject({ type: 'pending', pending: { status: 'failed' } });
        expect(failed.type === 'pending' && failed.pending.error?.status).toBe(503);

        const clientMessageId = failed.type === 'pending' ? failed.pending.clientMessageId : '';
        await act(async () => {
            await result.current.send.retry(clientMessageId as never);
        });

        const posts = harness.stub.requests
            .filter((request) => request.method === 'POST')
            .map((request) => (request.body as SendChatMessageRequest).clientMessageId);
        expect(posts).toEqual([clientMessageId, clientMessageId]);
        expect(result.current.messages.items).toEqual([expect.objectContaining({ type: 'message' })]);
    });
});

describe('useMessages', () => {
    it('catches up after the newest message it holds when a frame says the conversation moved on', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const harness = createHarness({ realtimeUrl: 'http://rt.test', socketFactory: factory });
        const held = [1, 2, 3].map((seq) => message({ seq }));
        harness.stub.on('GET', MESSAGES, (request) => {
            const after = request.query.get('afterSeq');
            if (after === null) return page(held);

            return page(
                [...held, message({ seq: 4, body: 'new' })].filter((entry) => entry.seq > Number(after)),
                4,
            );
        });
        const { result } = renderHook(
            () => {
                useChatRealtime();

                return useMessages(CONVERSATION);
            },
            { wrapper: harness.wrapper },
        );
        await waitFor(() => {
            expect(result.current.items).toHaveLength(3);
        });

        act(() => {
            sockets[0].emit(CHAT_SOCKET_EVENT.READY, {});
        });
        act(() => {
            sockets[0].emit(CHAT_SOCKET_EVENT.FRAME, {
                event: ChatRealtimeEvent.CONVERSATION_UPDATED,
                conversationId: CONVERSATION,
                seq: 4,
                userId: null,
            });
        });

        await waitFor(() => {
            expect(result.current.items).toHaveLength(4);
        });
        const catchUp = harness.stub.requests.filter((request) => request.query.has('afterSeq'));
        expect(catchUp.length).toBeGreaterThan(0);
        // The tail is re-read from the oldest held, so an edit to a recent message is seen too.
        expect(catchUp.every((request) => Number(request.query.get('afterSeq')) <= 3)).toBe(true);
    });

    it('polls every 5 seconds without a socket and every 30 once it is connected', async () => {
        const { factory, sockets } = fakeSocketFactory();
        const harness = createHarness({ realtimeUrl: 'http://rt.test', socketFactory: factory });
        harness.stub.on('GET', MESSAGES, () => page([message({ seq: 1 })]));
        renderHook(
            () => {
                useChatRealtime();

                return useMessages(CONVERSATION);
            },
            { wrapper: harness.wrapper },
        );
        const interval = (): unknown =>
            harness.queryClient.getQueryCache().find({ queryKey: chatQueryKeys.messages(CONVERSATION) })?.observers[0]
                ?.options.refetchInterval;

        await waitFor(() => {
            expect(interval()).toBe(5_000);
        });
        act(() => {
            sockets[0].emit(CHAT_SOCKET_EVENT.READY, {});
        });
        await waitFor(() => {
            expect(interval()).toBe(30_000);
        });
        act(() => {
            sockets[0].emit('disconnect', 'transport close');
        });
        await waitFor(() => {
            expect(interval()).toBe(5_000);
        });
    });
});

describe('useTyping and useMarkRead', () => {
    it('sends at most one typing signal every three seconds', async () => {
        const harness = createHarness();
        harness.stub.on('POST', `/conversations/${CONVERSATION}/typing`, () => ({ body: { accepted: true } }));
        let now = 1_000;
        const { result } = renderHook(() => useTyping(CONVERSATION, () => now), { wrapper: harness.wrapper });

        result.current();
        now += 1_000;
        result.current();
        now += 2_100;
        result.current();

        await waitFor(() => {
            expect(harness.stub.requests.filter((request) => request.path.endsWith('/typing'))).toHaveLength(2);
        });
    });

    it('reports reading once per pause, and only ever forward', async () => {
        vi.useFakeTimers();
        const harness = createHarness();
        harness.stub.on('POST', `/conversations/${CONVERSATION}/read`, () => ({ status: 204 }));
        harness.queryClient.setQueryData(
            chatQueryKeys.conversation(CONVERSATION),
            conversation({ unreadCount: 3, lastSeq: 9 }),
        );
        const { result } = renderHook(() => useMarkRead(CONVERSATION), { wrapper: harness.wrapper });

        result.current(7);
        result.current(9);
        result.current(8);
        await vi.advanceTimersByTimeAsync(600);
        result.current(9);
        result.current(4);
        await vi.advanceTimersByTimeAsync(600);

        const reads = harness.stub.requests.filter((request) => request.path.endsWith('/read'));
        expect(reads.map((request) => request.body)).toEqual([{ seq: 9 }]);
        expect(
            harness.queryClient.getQueryData<{ unreadCount: number }>(chatQueryKeys.conversation(CONVERSATION))
                ?.unreadCount,
        ).toBe(0);
    });
});
