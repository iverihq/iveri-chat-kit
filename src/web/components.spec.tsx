import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ChatAttachmentKind, ChatConversationKind, ChatMessageKind, ChatRefusal } from '@iveri/contracts/chat';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import { CHAT_KIT_DEFAULT_CATALOGUE } from '../i18n/index.js';
import { CONVERSATION, conversation, ME, message, ownMessage, participant } from '../testing/fixtures.js';
import { createHarness } from '../testing/render.js';
import type { ChatTheme } from '../theme/index.js';

import { ChatDialog } from './ChatDialog.js';
import { ChatInbox } from './ChatInbox.js';
import { ChatThread } from './ChatThread.js';

beforeAll(() => {
    // jsdom lays nothing out; the thread scrolls a message into view when a quote is followed.
    Element.prototype.scrollIntoView = function scrollIntoView(): void {
        return undefined;
    };
});

function threadHarness(overrides: Parameters<typeof conversation>[0] = {}): ReturnType<typeof createHarness> {
    const harness = createHarness();
    harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({
        body: conversation({ myLastReadSeq: 5, ...overrides }),
    }));
    harness.stub.on('GET', '/me', () => ({ body: { userId: ME, isNetwork: true } }));
    harness.stub.on('GET', '/blocks', () => ({ body: [] }));

    return harness;
}

describe('ChatThread', () => {
    it('draws a notice as a notice, a deleted message as deleted, an edit, and a reply’s quote', async () => {
        const harness = threadHarness();
        const quoted = message({ seq: 1, body: 'Where are you?' });
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: {
                hasOlder: false,
                lastSeq: 5,
                messages: [
                    quoted,
                    message({
                        seq: 2,
                        sender: null,
                        kind: ChatMessageKind.SYSTEM,
                        body: null,
                        systemKey: 'chat.system.member-added',
                        systemVariables: { actor: 'Nino', name: 'Giorgi' },
                    }),
                    message({ seq: 3, body: null, isDeleted: true }),
                    message({ seq: 4, body: 'Changed my mind', editedAt: '2026-11-11T10:05:00.000Z' }),
                    ownMessage({
                        seq: 5,
                        body: 'Outside the bakery',
                        replyTo: {
                            id: quoted.id,
                            seq: 1,
                            senderName: 'Nino Beridze',
                            kind: ChatMessageKind.TEXT,
                            excerpt: 'Where are you?',
                            isDeleted: false,
                        },
                    }),
                ],
            },
        }));

        render(<ChatThread conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        const log = await screen.findByRole('log', { name: 'chat.thread.messages' });
        const notice = await within(log).findByText('chat.system.member-added {"actor":"Nino","name":"Giorgi"}');
        // A notice is never a person's bubble: no time, no sender, no actions beside it.
        expect(notice.closest('[data-message-id]')).toBeNull();
        expect(within(log).getByText('chat.message.deleted')).toBeInTheDocument();
        expect(within(log).getByText('Changed my mind').closest('[data-message-id]')).toHaveTextContent(
            'chat.message.edited',
        );

        const quote = within(log).getByRole('button', { name: 'chat.message.reply-quote {"name":"Nino Beridze"}' });
        expect(quote).toHaveTextContent('Where are you?');
        await userEvent.click(quote);
        await waitFor(() => {
            expect(log.querySelector('[data-seq="1"] > div')).toHaveClass('ring-2');
        });
    });

    it('closes the composer with the refusal in words, and offers to accept a request', async () => {
        const harness = threadHarness({ canSend: false, refusal: ChatRefusal.REQUEST_PENDING, isRequest: true });
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 0, messages: [] },
        }));

        render(<ChatThread conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        expect(await screen.findByText('chat.refusal.request-pending')).toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: 'chat.composer.label' })).toBeNull();
        expect(screen.getByRole('button', { name: 'chat.thread.request.accept' })).toBeInTheDocument();
    });

    it('sends on Enter and keeps Shift+Enter for a new line', async () => {
        const harness = threadHarness();
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 0, messages: [] },
        }));
        harness.stub.on('POST', `/conversations/${CONVERSATION}/messages`, (request) => ({
            status: 201,
            body: ownMessage({ seq: 1, body: (request.body as { body: string }).body }),
        }));
        harness.stub.on('POST', `/conversations/${CONVERSATION}/typing`, () => ({ body: { accepted: true } }));

        render(<ChatThread conversationId={CONVERSATION} />, { wrapper: harness.wrapper });
        const field = await screen.findByRole('textbox', { name: 'chat.composer.label' });

        await userEvent.type(field, 'first line{Shift>}{Enter}{/Shift}second{Enter}');

        await waitFor(() => {
            const post = harness.stub.requests.find(
                (request) => request.method === 'POST' && request.path.endsWith('/messages'),
            );
            expect((post?.body as { body: string } | undefined)?.body).toBe('first line\nsecond');
        });
        expect(field).toHaveValue('');
    });

    it('leads a ride’s chat with the other person and their translated label', async () => {
        const harness = threadHarness({
            kind: ChatConversationKind.CONTEXT,
            title: 'chat.title.taxi-ride',
            other: null,
            participants: [
                participant({ userId: ME, isMe: true, label: 'chat.label.passenger' }),
                participant({ displayName: 'Giorgi B.', label: 'chat.label.driver' }),
            ],
        });
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 0, messages: [] },
        }));

        render(<ChatThread conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        const header = await screen.findByRole('banner');
        expect(within(header).getByText('Giorgi B.')).toBeInTheDocument();
        expect(within(header).getByText('chat.label.driver')).toBeInTheDocument();
        expect(within(header).getByText('chat.title.taxi-ride')).toBeInTheDocument();
    });
});

describe('ChatThread with no translate, as a customer mounts it', () => {
    it('reads in the words the kit carries, in the reader’s language, and in the app’s own notice words', async () => {
        const harness = createHarness({
            translate: 'bundled',
            locale: 'ka',
            messages: { en: { 'acme.order.shipped': 'Order {order} is on its way' } },
        });
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({ body: conversation({ myLastReadSeq: 2 }) }));
        harness.stub.on('GET', '/me', () => ({ body: { userId: ME, isNetwork: true } }));
        harness.stub.on('GET', '/blocks', () => ({ body: [] }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: {
                hasOlder: false,
                lastSeq: 3,
                messages: [
                    message({
                        seq: 1,
                        sender: null,
                        kind: ChatMessageKind.SYSTEM,
                        body: null,
                        systemKey: 'acme.order.shipped',
                        systemVariables: { order: 'A-17' },
                    }),
                    message({
                        seq: 2,
                        sender: null,
                        kind: ChatMessageKind.SYSTEM,
                        body: null,
                        systemKey: 'acme.unheard-of',
                        systemVariables: {},
                    }),
                    message({
                        seq: 3,
                        sender: null,
                        kind: ChatMessageKind.SYSTEM,
                        body: null,
                        systemKey: 'chat.system.closed',
                    }),
                ],
            },
        }));

        render(<ChatThread conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        const log = await screen.findByRole('log');
        // The app's notice has only English words, so a Georgian reader gets them rather than a key.
        expect(await within(log).findByText('Order A-17 is on its way')).toBeInTheDocument();
        const ka = (key: string): string => CHAT_KIT_DEFAULT_CATALOGUE.messages.ka?.[key] ?? key;
        expect(within(log).getByText(ka('chat.system.unknown'))).toBeInTheDocument();
        expect(within(log).getByText(ka('chat.system.closed'))).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: ka('chat.composer.label') })).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(/\bchat\.[a-z-]+\.[a-z-]/u);
    });
});

describe('ChatThread after a request is accepted', () => {
    it('reports reading once accepted, without a reload, and never while it was a request', async () => {
        const harness = createHarness();
        let accepted = false;
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({
            body: accepted
                ? conversation({ lastSeq: 2, unreadCount: 2 })
                : conversation({
                      isRequest: true,
                      canSend: false,
                      refusal: ChatRefusal.REQUEST_PENDING,
                      lastSeq: 2,
                      unreadCount: 2,
                  }),
        }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 2, messages: [message({ seq: 1 }), message({ seq: 2 })] },
        }));
        harness.stub.on('GET', '/me', () => ({ body: { userId: ME, isNetwork: true } }));
        harness.stub.on('GET', '/blocks', () => ({ body: [] }));
        harness.stub.on('POST', `/conversations/${CONVERSATION}/accept`, () => {
            accepted = true;

            return { body: conversation({ lastSeq: 2, unreadCount: 2 }) };
        });
        harness.stub.on('POST', `/conversations/${CONVERSATION}/read`, () => ({ status: 204 }));
        const reads = (): number => harness.stub.requests.filter((request) => request.path.endsWith('/read')).length;

        render(<ChatThread conversationId={CONVERSATION} />, { wrapper: harness.wrapper });
        await screen.findByText('Message 2');
        await new Promise((resolve) => setTimeout(resolve, 700));
        expect(reads()).toBe(0);

        await userEvent.click(screen.getByRole('button', { name: 'chat.thread.request.accept' }));

        await waitFor(
            () => {
                expect(harness.stub.requests.find((request) => request.path.endsWith('/read'))?.body).toEqual({
                    seq: 2,
                });
            },
            { timeout: 3000 },
        );
    });
});

describe('ChatThread in an embedding', () => {
    it('offers only the attachments and controls the embedding allows, and names its back control', async () => {
        const harness = threadHarness();
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 0, messages: [] },
        }));

        render(
            <ChatThread
                conversationId={CONVERSATION}
                onBack={() => undefined}
                backLabel="Back to the ride"
                attachmentKinds={[ChatAttachmentKind.PHOTO]}
                allowVoice={false}
            />,
            { wrapper: harness.wrapper },
        );

        expect(await screen.findByRole('button', { name: 'Back to the ride' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'chat.composer.record' })).toBeNull();
        expect(screen.getByRole('button', { name: 'chat.composer.send' })).toBeDisabled();
        await userEvent.click(screen.getByRole('button', { name: 'chat.composer.attach' }));
        expect(screen.getByRole('menuitem', { name: 'chat.composer.attach-photo' })).toBeInTheDocument();
        expect(screen.queryByRole('menuitem', { name: 'chat.composer.attach-file' })).toBeNull();
    });

    it('offers no Accept on a request that has closed', async () => {
        const harness = threadHarness({
            isRequest: true,
            canSend: false,
            refusal: ChatRefusal.CLOSED,
            closedAt: '2026-11-11T10:00:00.000Z',
        });
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 0, messages: [] },
        }));

        render(<ChatThread conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        expect(await screen.findByText('chat.refusal.closed')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'chat.thread.request.accept' })).toBeNull();
    });
});

describe('ChatThread layout', () => {
    it('anchors the reaction picker on the side with room, and lets the day label scroll with its day', async () => {
        const harness = threadHarness();
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: {
                hasOlder: false,
                lastSeq: 2,
                messages: [message({ seq: 1, body: 'Theirs' }), ownMessage({ seq: 2, body: 'Mine' })],
            },
        }));

        render(<ChatThread conversationId={CONVERSATION} />, { wrapper: harness.wrapper });
        const log = await screen.findByRole('log');
        await within(log).findByText('Mine');

        const [theirs, mine] = within(log).getAllByRole('button', { name: 'chat.reaction.add' });
        await userEvent.click(theirs);
        expect(within(log).getByRole('group', { name: 'chat.reaction.quick' })).toHaveClass('start-0');
        await userEvent.click(theirs);
        await userEvent.click(mine);
        expect(within(log).getByRole('group', { name: 'chat.reaction.quick' })).toHaveClass('end-0');

        expect(log.querySelector('.sticky')).toBeNull();
    });
});

describe('ChatInbox', () => {
    it('lists conversations with unread counts in words, and moves between folders', async () => {
        const harness = createHarness();
        harness.stub.on('GET', '/conversations', (request) => ({
            body: {
                nextCursor: null,
                conversations:
                    request.query.get('folder') === 'requests'
                        ? []
                        : [
                              conversation({
                                  unreadCount: 140,
                                  lastMessage: {
                                      seq: 3,
                                      kind: ChatMessageKind.TEXT,
                                      excerpt: 'See you',
                                      systemKey: null,
                                      systemVariables: null,
                                      senderName: 'Nino',
                                      isOwn: false,
                                      isDeleted: false,
                                      sentAt: '2026-11-11T09:00:00.000Z',
                                  },
                              }),
                          ],
            },
        }));
        harness.stub.on('GET', '/search/messages', () => ({ body: [] }));
        const selected: string[] = [];

        render(<ChatInbox onSelectConversation={(id) => selected.push(id)} />, { wrapper: harness.wrapper });

        const row = await screen.findByRole('button', { name: /^Nino Beridze/u });
        expect(row).toHaveTextContent('99+');
        expect(row).toHaveTextContent('chat.inbox.unread {"count":140}');
        await userEvent.click(row);
        expect(selected).toEqual([CONVERSATION]);

        await userEvent.click(screen.getByRole('tab', { name: 'chat.inbox.tab.requests' }));
        expect(await screen.findByText('chat.inbox.empty.requests')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'chat.inbox.tab.requests' })).toHaveAttribute('aria-selected', 'true');
    });
});

describe('a ChatProvider theme on the web', () => {
    function brandedThread(theme: Partial<ChatTheme> | undefined): ReturnType<typeof createHarness> {
        const harness = createHarness({ theme });
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({ body: conversation({ myLastReadSeq: 2 }) }));
        harness.stub.on('GET', '/me', () => ({ body: { userId: ME, isNetwork: true } }));
        harness.stub.on('GET', '/blocks', () => ({ body: [] }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: {
                hasOlder: false,
                lastSeq: 2,
                messages: [message({ seq: 1, body: 'From them' }), ownMessage({ seq: 2, body: 'From me' })],
            },
        }));

        return harness;
    }

    it('reaches every component through --baasi-* custom properties on the element around them', async () => {
        const harness = brandedThread({
            colorAccent: '#c2410c',
            colorBubbleOwn: '#ffedd5',
            radius: 18,
            fontFamily: 'Georgia, serif',
        });

        render(<ChatThread conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        const own = await screen.findByText('From me');
        const scope = own.closest<HTMLElement>('[data-baasi-theme]');
        expect(scope).not.toBeNull();
        expect(scope?.style.getPropertyValue('--baasi-color-accent')).toBe('#c2410c');
        expect(scope?.style.getPropertyValue('--baasi-color-bubble-own')).toBe('#ffedd5');
        expect(scope?.style.getPropertyValue('--baasi-radius')).toBe('18px');
        expect(scope?.style.display).toBe('contents');
        expect(scope?.style.fontFamily).toBe('var(--baasi-font-family)');
        // The bubbles read the theme's tokens, and nothing names a colour of its own.
        expect(own.closest('[data-message-id]')?.querySelector('.bg-chat-bubble-own')).not.toBeNull();
        expect(
            screen.getByText('From them').closest('[data-message-id]')?.querySelector('.bg-chat-bubble-other'),
        ).not.toBeNull();
    });

    it('carries the theme into a dialog, which a portal takes out from under the thread', () => {
        const harness = brandedThread({ colorAccent: '#c2410c' });

        render(
            <ChatDialog title="Branded" onClose={() => undefined}>
                body
            </ChatDialog>,
            { wrapper: harness.wrapper },
        );

        const dialog = screen.getByRole('dialog', { name: 'Branded' });
        expect(dialog.closest<HTMLElement>('[data-baasi-theme]')?.style.getPropertyValue('--baasi-color-accent')).toBe(
            '#c2410c',
        );
    });

    it('renders today’s look untouched with no theme: no element, no property, the same tokens', async () => {
        const harness = brandedThread(undefined);

        const { container } = render(<ChatThread conversationId={CONVERSATION} />, { wrapper: harness.wrapper });

        const own = await screen.findByText('From me');
        expect(document.querySelector('[data-baasi-theme]')).toBeNull();
        expect(container.innerHTML).not.toContain('--baasi-');
        // The token falls back to the app's own `accent-soft`, the colour an own bubble has always had.
        expect(own.closest('[data-message-id]')?.querySelector('.bg-chat-bubble-own')).not.toBeNull();
    });

    it('falls back to the app’s own token for every chat token the stylesheet declares', () => {
        const stylesheet = readFileSync(path.resolve(process.cwd(), 'styles/web.css'), 'utf8');
        const tokens = [...stylesheet.matchAll(/^\s*(--(?:color|radius|font)-chat-[\w-]+):\s*([^;]+);/gm)];

        expect(tokens.length).toBeGreaterThan(15);
        for (const [, name, value] of tokens) {
            // Every chain ends in the app's own theme variable, never in a colour the kit chose.
            expect(value, name).toMatch(/var\(--(?:color|radius|font)-(?!chat-)[\w-]+\)[\s)]*$/);
            expect(value, name).not.toMatch(/#[0-9a-f]{3,6}/i);
        }
    });
});
