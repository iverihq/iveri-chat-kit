import { ChatMessageKind, ChatRefusal } from '@iveri/contracts/chat';
import type { SendChatMessageRequest } from '@iveri/contracts/chat';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FlatList } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { CONVERSATION, conversation, keyTranslate, message, ownMessage } from '../testing/fixtures.js';
import { createHarness } from '../testing/render.js';
import { defaultChatTheme } from '../theme/index.js';
import { shouldPinToNewest } from '../util/index.js';

import { ChatNativeProvider } from './ChatNativeProvider.js';
import { ChatThreadScreen } from './ChatThreadScreen.js';
import { DEFAULT_CHAT_NATIVE_THEME, toUploadFile, useChatNative, type ChatNativeTheme } from './native-context.js';
import { applyChatTheme } from './native-theme.js';

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
        // A notice is reachable by a screen reader as one element, by its sentence.
        expect(screen.getByLabelText('This conversation has closed')).toBeInTheDocument();
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

describe('a ChatProvider theme on a phone', () => {
    function ThemeProbe({ onTheme }: Readonly<{ onTheme: (theme: ChatNativeTheme) => void }>): null {
        onTheme(useChatNative().theme);

        return null;
    }

    it('flows through context into the native palette, the bubbles and the face', () => {
        const harness = createHarness({
            theme: { colorAccent: '#c2410c', colorBubbleOwn: '#ffedd5', radius: 18, fontFamily: 'Georgia' },
        });
        let seen: ChatNativeTheme | null = null;

        render(
            <ThemeProbe
                onTheme={(theme) => {
                    seen = theme;
                }}
            />,
            { wrapper: harness.wrapper },
        );

        const theme = seen as unknown as ChatNativeTheme;
        expect(theme.color.accent).toBe('#c2410c');
        // Mixed as hex, because React Native has no `color-mix()`.
        expect(theme.color.accentSoft).toMatch(/^#[0-9a-f]{6}$/);
        expect(theme.color.link).toBe('#c2410c');
        expect(theme.bubble.own).toBe('#ffedd5');
        expect(theme.radius).toEqual({ control: 12, card: 18, panel: 24 });
        expect(theme.fontFamily).toBe('Georgia');
        // What the theme left out is the fleet's palette, untouched.
        expect(theme.color.surface).toBe(DEFAULT_CHAT_NATIVE_THEME.color.surface);
        expect(theme.bubble.other).toBe(DEFAULT_CHAT_NATIVE_THEME.bubble.other);
    });

    it('draws an own bubble in the theme’s colour', async () => {
        const harness = createHarness({ theme: { colorBubbleOwn: '#ffedd5' } });
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({ body: conversation() }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 1, messages: [ownMessage({ seq: 1, body: 'Branded' })] },
        }));

        render(<ChatThreadScreen conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        const text = await screen.findByText('Branded');
        const painted = [...ancestors(text)].map((element) => getComputedStyle(element).backgroundColor);
        expect(painted).toContain('rgb(255, 237, 213)');
    });

    it('is today’s look for no theme and for defaultChatTheme alike', () => {
        expect(applyChatTheme(DEFAULT_CHAT_NATIVE_THEME, defaultChatTheme)).toEqual({
            ...DEFAULT_CHAT_NATIVE_THEME,
            fontFamily: undefined,
        });

        const harness = createHarness();
        let seen: ChatNativeTheme | null = null;
        render(
            <ThemeProbe
                onTheme={(theme) => {
                    seen = theme;
                }}
            />,
            { wrapper: harness.wrapper },
        );
        expect(seen).toBe(DEFAULT_CHAT_NATIVE_THEME);
    });
});

function* ancestors(element: Element): Generator<Element> {
    for (let current: Element | null = element; current !== null; current = current.parentElement) yield current;
}
