import {
    ChatCallKind,
    ChatCallParticipantState,
    ChatCallStatus,
    type ChatCall,
    type ChatCallJoin,
} from '@iveri/contracts/chat';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONVERSATION, conversation, ME, participant } from '../testing/fixtures.js';
import { createHarness } from '../testing/render.js';
import { ChatThread } from '../web/ChatThread.js';

import { ChatCallLayer } from './ChatCallLayer.js';

/** LiveKit's browser client needs WebRTC, which jsdom has none of; the room is the one thing stood in for. */
const rooms = vi.hoisted(() => ({ connected: [] as { url: string; token: string }[], left: 0 }));

vi.mock('livekit-client', () => {
    class Room {
        remoteParticipants = new Map();
        localParticipant = {
            setMicrophoneEnabled: (): Promise<void> => Promise.resolve(),
            setCameraEnabled: (): Promise<void> => Promise.resolve(),
        };

        on(): this {
            return this;
        }

        connect(url: string, token: string): Promise<void> {
            rooms.connected.push({ url, token });

            return Promise.resolve();
        }

        disconnect(): Promise<void> {
            rooms.left += 1;

            return Promise.resolve();
        }
    }

    return {
        Room,
        RoomEvent: {
            TrackSubscribed: 'a',
            TrackUnsubscribed: 'b',
            ParticipantConnected: 'c',
            ParticipantDisconnected: 'd',
            LocalTrackPublished: 'e',
        },
        Track: { Kind: { Video: 'video', Audio: 'audio' } },
    };
});

const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CALL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const call = (overrides: Partial<ChatCall> = {}, iAmCalled = false): ChatCall => ({
    id: CALL,
    conversationId: CONVERSATION,
    kind: ChatCallKind.VIDEO,
    status: ChatCallStatus.RINGING,
    endReason: null,
    startedBy: iAmCalled ? OTHER : ME,
    participants: [
        {
            userId: ME,
            displayName: 'Me',
            avatar: null,
            state: iAmCalled ? ChatCallParticipantState.RINGING : ChatCallParticipantState.JOINED,
            joinedAt: null,
            leftAt: null,
            isMe: true,
        },
        {
            userId: OTHER,
            displayName: 'Giorgi',
            avatar: null,
            state: iAmCalled ? ChatCallParticipantState.JOINED : ChatCallParticipantState.RINGING,
            joinedAt: null,
            leftAt: null,
            isMe: false,
        },
    ],
    ringExpiresAt: '2026-11-14T10:00:45.000Z',
    answeredAt: null,
    endedAt: null,
    createdAt: '2026-11-14T10:00:00.000Z',
    ...overrides,
});

const join = (answer: ChatCall): ChatCallJoin => ({
    call: answer,
    url: 'ws://livekit.test',
    token: `token-for-${answer.id}`,
    expiresAt: '2026-11-14T10:10:00.000Z',
});

function harness(options: { canCall?: boolean; incoming?: ChatCall[] } = {}): ReturnType<typeof createHarness> {
    const h = createHarness();
    h.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({
        body: conversation({
            canCall: options.canCall ?? true,
            participants: [participant({ userId: ME, isMe: true }), participant({ userId: OTHER })],
        }),
    }));
    h.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
        body: { hasOlder: false, lastSeq: 0, messages: [] },
    }));
    h.stub.on('GET', '/me', () => ({ body: { userId: ME, isNetwork: true } }));
    h.stub.on('GET', '/blocks', () => ({ body: [] }));
    h.stub.on('GET', '/me/calls/incoming', () => ({ body: options.incoming ?? [] }));

    return h;
}

beforeAll(() => {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {
        return undefined;
    };
});

beforeEach(() => {
    rooms.connected = [];
    rooms.left = 0;
});

describe('ChatCallLayer', () => {
    it('draws no call button without a layer, or where the server says no call can be made', async () => {
        const plain = harness();
        const { unmount } = render(<ChatThread conversationId={CONVERSATION} />, { wrapper: plain.wrapper });

        await screen.findByRole('banner');
        expect(screen.queryByRole('button', { name: 'chat.call.start-voice' })).not.toBeInTheDocument();
        unmount();

        const refused = harness({ canCall: false });
        render(
            <ChatCallLayer>
                <ChatThread conversationId={CONVERSATION} />
            </ChatCallLayer>,
            { wrapper: refused.wrapper },
        );

        await screen.findByRole('banner');
        expect(screen.queryByRole('button', { name: 'chat.call.start-video' })).not.toBeInTheDocument();
    });

    it('starts a call from the thread, joins it, and connects to the room it was given', async () => {
        const h = harness();
        h.stub.on('POST', `/conversations/${CONVERSATION}/calls`, (request) => ({
            status: 201,
            body: call({ kind: (request.body as { kind: ChatCallKind }).kind }),
        }));
        h.stub.on('POST', `/calls/${CALL}/join`, () => ({ body: join(call()) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: call() }));

        render(
            <ChatCallLayer>
                <ChatThread conversationId={CONVERSATION} />
            </ChatCallLayer>,
            { wrapper: h.wrapper },
        );

        await userEvent.click(await screen.findByRole('button', { name: 'chat.call.start-video' }));

        const dialog = await screen.findByRole('dialog', { name: 'Giorgi' });
        expect(within(dialog).getByText('chat.call.calling {"name":"Giorgi"}')).toBeInTheDocument();
        await waitFor(() => {
            expect(rooms.connected).toEqual([{ url: 'ws://livekit.test', token: `token-for-${CALL}` }]);
        });
        expect(h.stub.requests.find((r) => r.method === 'POST' && r.path.endsWith('/calls'))?.body).toMatchObject({
            kind: ChatCallKind.VIDEO,
            clientCallId: expect.any(String),
        });
    });

    it('shows who is calling, and answering joins the room', async () => {
        const ringing = call({}, true);
        const answered = call({ status: ChatCallStatus.ACTIVE }, true);
        const h = harness({ incoming: [ringing] });
        h.stub.on('POST', `/calls/${CALL}/accept`, () => ({ body: join(answered) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: answered }));

        render(<ChatCallLayer />, { wrapper: h.wrapper });

        const card = await screen.findByRole('alertdialog');
        expect(card).toHaveAccessibleName('chat.call.incoming {"kind":"video","name":"Giorgi"}');

        await userEvent.click(within(card).getByRole('button', { name: /chat.call.answer/u }));

        await waitFor(() => {
            expect(rooms.connected).toHaveLength(1);
        });
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(await screen.findByRole('dialog', { name: 'Giorgi' })).toBeInTheDocument();
    });

    it('declines, and hides the ring at once', async () => {
        const h = harness({ incoming: [call({}, true)] });
        h.stub.on('POST', `/calls/${CALL}/decline`, () => ({
            body: call({ status: ChatCallStatus.ENDED, endReason: 'declined' as ChatCall['endReason'] }, true),
        }));

        render(<ChatCallLayer />, { wrapper: h.wrapper });

        await userEvent.click(await screen.findByRole('button', { name: /chat.call.decline/u }));

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        await waitFor(() => {
            expect(h.stub.requests.some((r) => r.method === 'POST' && r.path === `/calls/${CALL}/decline`)).toBe(true);
        });
        expect(rooms.connected).toEqual([]);
    });

    it('leaves the room and says so once the call has ended', async () => {
        const h = harness();
        let ended = false;
        h.stub.on('POST', `/conversations/${CONVERSATION}/calls`, () => ({ status: 201, body: call() }));
        h.stub.on('POST', `/calls/${CALL}/join`, () => ({ body: join(call()) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: ended ? call({ status: ChatCallStatus.ENDED }) : call() }));
        h.stub.on('POST', `/calls/${CALL}/end`, () => {
            ended = true;

            return { body: call({ status: ChatCallStatus.ENDED, endReason: 'cancelled' as ChatCall['endReason'] }) };
        });

        render(
            <ChatCallLayer>
                <ChatThread conversationId={CONVERSATION} />
            </ChatCallLayer>,
            { wrapper: h.wrapper },
        );

        await userEvent.click(await screen.findByRole('button', { name: 'chat.call.start-voice' }));
        await waitFor(() => {
            expect(rooms.connected).toHaveLength(1);
        });
        const hangUp = await screen.findByRole('button', { name: 'chat.call.hang-up' });

        // Red, and only red: a second background beside it would be decided by Tailwind's emit order.
        expect(hangUp.className).toContain('bg-critical');
        expect(hangUp.className).not.toContain('bg-white');
        await userEvent.click(hangUp);

        expect(await screen.findByText('chat.call.ended {"name":"Giorgi"}')).toBeInTheDocument();
        await waitFor(() => {
            expect(rooms.left).toBe(1);
        });
    });
});
