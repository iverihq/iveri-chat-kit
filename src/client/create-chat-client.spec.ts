import { ChatRefusal } from '@iveri/contracts/chat';
import { describe, expect, it, vi } from 'vitest';

import { createFetchStub } from '../testing/fetch-stub.js';

import { ChatApiError } from './chat-api-error.js';
import { createClientMessageId } from './client-message-id.js';
import { createChatClient } from './create-chat-client.js';

const BASE = 'http://chat.test/api/v1';

describe('createChatClient', () => {
    it('presents the current token and builds the query without empty parameters', async () => {
        const stub = createFetchStub();
        stub.on('GET', '/conversations', () => ({ body: { conversations: [], nextCursor: null } }));
        const client = createChatClient({ baseUrl: `${BASE}/`, getAccessToken: () => 'token-1', fetch: stub.fetch });

        await client.listConversations({ folder: 'requests', cursor: null, product: 'social' });

        expect(stub.requests[0].authorization).toBe('Bearer token-1');
        expect(stub.requests[0].query.toString()).toBe('folder=requests&product=social');
    });

    it('refreshes once on a 401 and retries with the new token', async () => {
        const stub = createFetchStub();
        let token = 'expired';
        stub.on('GET', '/me', (request) =>
            request.authorization === 'Bearer fresh'
                ? { body: { userId: 'me' } }
                : { status: 401, body: { success: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } } },
        );
        const onUnauthorized = vi.fn(() => {
            token = 'fresh';
        });
        const client = createChatClient({
            baseUrl: BASE,
            getAccessToken: () => token,
            onUnauthorized,
            fetch: stub.fetch,
        });

        await expect(client.getProfile()).resolves.toEqual({ userId: 'me' });
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
        expect(stub.requests).toHaveLength(2);
    });

    it('retries a 401 only once, and not at all when the session is gone', async () => {
        const stub = createFetchStub();
        stub.on('GET', '/me', () => ({
            status: 401,
            body: { success: false, error: { code: 'UNAUTHENTICATED', message: 'no' } },
        }));
        const refreshing = createChatClient({
            baseUrl: BASE,
            getAccessToken: () => 't',
            onUnauthorized: () => true,
            fetch: stub.fetch,
        });
        await expect(refreshing.getProfile()).rejects.toMatchObject({ status: 401 });
        expect(stub.requests).toHaveLength(2);

        const ended = createChatClient({
            baseUrl: BASE,
            getAccessToken: () => 't',
            onUnauthorized: () => false,
            fetch: stub.fetch,
        });
        await expect(ended.getProfile()).rejects.toMatchObject({ status: 401 });
        expect(stub.requests).toHaveLength(3);
    });

    it('reads a refusal from details.reason and ignores one this contract does not know', async () => {
        const stub = createFetchStub();
        stub.on('POST', /\/messages$/u, () => ({
            status: 403,
            body: {
                success: false,
                error: { code: 'FORBIDDEN', message: 'closed', details: { reason: 'closed' }, correlationId: 'c-1' },
            },
        }));
        stub.on('PATCH', /^\/messages\//u, () => ({
            status: 422,
            body: {
                success: false,
                error: { code: 'UNPROCESSABLE_ENTITY', message: 'x', details: { reason: 'from-the-future' } },
            },
        }));
        const client = createChatClient({ baseUrl: BASE, getAccessToken: () => 't', fetch: stub.fetch });

        const closed = await client
            .sendMessage('c' as never, { clientMessageId: createClientMessageId() })
            .catch((error: unknown) => error);
        expect(closed).toBeInstanceOf(ChatApiError);
        expect(closed).toMatchObject({
            status: 403,
            code: 'FORBIDDEN',
            refusal: ChatRefusal.CLOSED,
            correlationId: 'c-1',
        });

        const unknown = await client.editMessage('m' as never, { body: 'x' }).catch((error: unknown) => error);
        expect(unknown).toMatchObject({ status: 422, refusal: null });
    });

    it('reports a request that never reached the server as status 0', async () => {
        const client = createChatClient({
            baseUrl: BASE,
            getAccessToken: () => 't',
            fetch: () => Promise.reject(new TypeError('Failed to fetch')),
        });

        const error = await client.getProfile().catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ChatApiError);
        expect((error as ChatApiError).isNetworkError).toBe(true);
    });

    it('answers 204 routes with nothing and sends the delete scope as a query', async () => {
        const stub = createFetchStub();
        stub.on('DELETE', /^\/messages\//u, () => ({ status: 204 }));
        const client = createChatClient({ baseUrl: BASE, getAccessToken: () => 't', fetch: stub.fetch });

        await expect(client.deleteMessage('m-1' as never, 'everyone')).resolves.toBeUndefined();
        expect(stub.requests[0].path).toBe('/messages/m-1');
        expect(stub.requests[0].query.get('for')).toBe('everyone');
    });
});

describe('createClientMessageId', () => {
    it('makes a version 4 UUID even without crypto, as on a phone with no polyfill', () => {
        const id = createClientMessageId({});
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
        expect(createClientMessageId({})).not.toBe(id);
    });
});
