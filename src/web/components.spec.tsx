import { ChatConversationKind, ChatMessageKind, ChatRefusal } from '@iveri/contracts/chat';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import { CONVERSATION, conversation, ME, message, ownMessage, participant } from '../testing/fixtures.js';
import { createHarness } from '../testing/render.js';

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
