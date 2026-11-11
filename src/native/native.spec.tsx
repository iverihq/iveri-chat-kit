import { ChatMessageKind, ChatRefusal } from '@iveri/contracts/chat';
import type { SendChatMessageRequest } from '@iveri/contracts/chat';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FlatList } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { CONVERSATION, conversation, keyTranslate, message, ownMessage } from '../testing/fixtures.js';
import { createHarness } from '../testing/render.js';
import { shouldPinToNewest } from '../util/index.js';

import { ChatNativeProvider } from './ChatNativeProvider.js';
import { ChatThreadScreen } from './ChatThreadScreen.js';
import { toUploadFile } from './native-context.js';

// React Native cannot run in a test runner (its entry point is Flow), so this project renders the same
// components through `react-native-web`. It proves they mount and draw the right things; the gestures,
// the keyboard and the device capabilities are verified on a phone.
describe('ChatThreadScreen', () => {
    it('draws messages, a notice, read state, and the composer with only the controls the app supplied', async () => {
        const harness = createHarness({
            translate: (key, values) =>
                key === 'chat.system.closed' ? 'This conversation has closed' : keyTranslate(key, values),
        });
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({ body: conversation() }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: {
                hasOlder: false,
                lastSeq: 3,
                messages: [
                    message({ seq: 1, body: 'Hello from Nino' }),
                    message({
                        seq: 2,
                        sender: null,
                        kind: ChatMessageKind.SYSTEM,
                        body: null,
                        systemKey: 'chat.system.closed',
                    }),
                    ownMessage({ seq: 3, body: 'Hi' }),
                ],
            },
        }));

        render(
            <ChatNativeProvider capabilities={{ pickImage: () => Promise.resolve(null) }}>
                <ChatThreadScreen conversationId={CONVERSATION} />
            </ChatNativeProvider>,
            { wrapper: harness.wrapper },
        );

        expect(await screen.findByText('Hello from Nino')).toBeInTheDocument();
        expect(screen.getByText('This conversation has closed')).toBeInTheDocument();
        expect(screen.getByLabelText('chat.message.sent')).toBeInTheDocument();
        expect(screen.getByLabelText('chat.composer.attach-photo')).toBeInTheDocument();
        // No `pickFile` and no `recordVoice` were supplied, so neither control exists.
        expect(screen.queryByLabelText('chat.composer.attach-file')).toBeNull();
        expect(screen.queryByLabelText('chat.composer.record')).toBeNull();
    });

    it('replaces the composer with the refusal when the conversation is closed', async () => {
        const harness = createHarness();
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({
            body: conversation({ canSend: false, refusal: ChatRefusal.CLOSED }),
        }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 0, messages: [] },
        }));

        render(<ChatThreadScreen conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        expect(await screen.findByText('chat.refusal.closed')).toBeInTheDocument();
        expect(screen.queryByLabelText('chat.composer.label')).toBeNull();
    });
});

describe('staying at the newest message', () => {
    it('moves to the newest row only when it changed and the reader was there or sent it', () => {
        expect(
            shouldPinToNewest({ previousNewestKey: 'a', newestKey: 'b', wasAtNewest: true, newestIsOwn: false }),
        ).toBe(true);
        expect(
            shouldPinToNewest({ previousNewestKey: 'a', newestKey: 'b', wasAtNewest: false, newestIsOwn: true }),
        ).toBe(true);
        expect(
            shouldPinToNewest({ previousNewestKey: 'a', newestKey: 'b', wasAtNewest: false, newestIsOwn: false }),
        ).toBe(false);
        // Older pages, an edit or a reaction leave the newest row where it was: the view does not move.
        expect(
            shouldPinToNewest({ previousNewestKey: 'b', newestKey: 'b', wasAtNewest: true, newestIsOwn: true }),
        ).toBe(false);
        expect(
            shouldPinToNewest({ previousNewestKey: null, newestKey: 'a', wasAtNewest: false, newestIsOwn: false }),
        ).toBe(true);
    });

    it('scrolls the thread to its newest message after the reader sends one', async () => {
        const scrollToOffset = vi.spyOn(FlatList.prototype, 'scrollToOffset');
        const harness = createHarness();
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({ body: conversation() }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 2, messages: [message({ seq: 1 }), message({ seq: 2 })] },
        }));
        harness.stub.on('POST', `/conversations/${CONVERSATION}/messages`, (request) => ({
            status: 201,
            body: ownMessage({
                seq: 3,
                body: 'On my way',
                clientMessageId: (request.body as SendChatMessageRequest).clientMessageId,
            }),
        }));
        harness.stub.on('POST', `/conversations/${CONVERSATION}/typing`, () => ({ body: { accepted: true } }));

        render(<ChatThreadScreen conversationId={CONVERSATION} />, { wrapper: harness.wrapper });
        await screen.findByText('Message 2');
        scrollToOffset.mockClear();

        fireEvent.change(screen.getByLabelText('chat.composer.label'), { target: { value: 'On my way' } });
        await act(async () => {
            fireEvent.click(screen.getByLabelText('chat.composer.send'));
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(scrollToOffset).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
        });
        expect(await screen.findByText('On my way')).toBeInTheDocument();
        scrollToOffset.mockRestore();
    });
});

describe('MessageBubble', () => {
    it('names every bubble by who sent it, when, and what it says', async () => {
        const harness = createHarness();
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({ body: conversation() }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: {
                hasOlder: false,
                lastSeq: 2,
                messages: [
                    message({ seq: 1, body: 'Where are you?', sentAt: '2026-11-11T08:05:00.000Z' }),
                    ownMessage({ seq: 2, body: null, isDeleted: true, sentAt: '2026-11-11T08:06:00.000Z' }),
                ],
            },
        }));

        render(<ChatThreadScreen conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        expect(
            await screen.findByRole('button', {
                name: 'chat.message.label {"name":"Nino Beridze","time":"12:05 PM","text":"Where are you?"}',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText(
                'chat.message.label {"name":"chat.common.you","time":"12:06 PM","text":"chat.message.deleted"}',
            ),
        ).toBeInTheDocument();
    });
});

describe('toUploadFile', () => {
    it('sends React Native its { uri, name, type } and a browser a Blob', async () => {
        const picked = { uri: 'blob:http://localhost/1', name: 'cat.jpg', type: 'image/jpeg' };
        expect(await toUploadFile(picked, 'ios')).toEqual(picked);

        const own = new Blob(['x'], { type: 'image/jpeg' });
        expect(await toUploadFile({ ...picked, file: own }, 'web')).toBe(own);

        const fetched = await toUploadFile(picked, 'web', () => Promise.resolve(new Response(new Blob(['abc']))));
        expect(fetched).toBeInstanceOf(Blob);
        expect((fetched as File).name).toBe('cat.jpg');
        expect((fetched as Blob).type).toBe('image/jpeg');
    });
});
