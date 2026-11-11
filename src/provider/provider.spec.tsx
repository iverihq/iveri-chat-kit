import type { UUID } from '@iveri/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createHarness } from '../testing/render.js';

import { useChatContext } from './chat-context.js';

const APP_USER = '5c3a9a3e-6d0a-5b1c-9d2e-7f8a9b0c1d2e' as UUID;

describe('ChatProvider', () => {
    it("reads the person's id from GET /me when the app does not pass one, as a customer's app need not", async () => {
        const harness = createHarness({ currentUserId: 'omit' });
        harness.stub.on('GET', '/me', () => ({ body: { userId: APP_USER } }));

        const { result } = renderHook(() => useChatContext().currentUserId, { wrapper: harness.wrapper });

        expect(result.current).toBeNull();
        await waitFor(() => {
            expect(result.current).toBe(APP_USER);
        });
    });

    it('uses the id it is given and asks chat-api for nothing', async () => {
        const harness = createHarness({ currentUserId: APP_USER });

        const { result } = renderHook(() => useChatContext().currentUserId, { wrapper: harness.wrapper });

        expect(result.current).toBe(APP_USER);
        await Promise.resolve();
        expect(harness.stub.requests).toHaveLength(0);
    });
});
