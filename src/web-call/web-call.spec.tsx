import {
    ChatCallKind,
    ChatConversationKind,
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
    isGroup: false,
    title: null,
    maxParticipants: 2,
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

function harness(
    options: { canCall?: boolean; incoming?: ChatCall[]; isGroup?: boolean; signedOut?: boolean } = {},
): ReturnType<typeof createHarness> {
    // Signed out: the app passes no user, and `GET /me` is refused, as it is without a token.
    const h = createHarness(options.signedOut === true ? { currentUserId: 'omit' } : {});
    h.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({
        body: conversation({
            canCall: options.canCall ?? true,
            ...(options.isGroup === true
                ? { kind: ChatConversationKind.GROUP, isGroup: true, title: 'Weekend', other: null, memberCount: 3 }
                : {}),
            participants: [participant({ userId: ME, isMe: true }), participant({ userId: OTHER })],
        }),
    }));
    h.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
        body: { hasOlder: false, lastSeq: 0, messages: [] },
    }));
    h.stub.on('GET', '/me', () =>
        options.signedOut === true
            ? { status: 401, body: { error: { code: 'UNAUTHENTICATED' } } }
            : { body: { userId: ME, isNetwork: true } },
    );
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

    it('asks for no ringing call while nobody is signed in', async () => {
        const h = harness({ signedOut: true });

        render(<ChatCallLayer />, { wrapper: h.wrapper });

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(h.stub.requests.some((r) => r.path === '/me/calls/incoming')).toBe(false);
    });
});

describe('Group calls', () => {
    const ANA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const group = (overrides: Partial<ChatCall> = {}, mine: ChatCallParticipantState | null = null): ChatCall => {
        const base = call({ startedBy: OTHER });
        const others = [
            { ...base.participants[1], state: ChatCallParticipantState.JOINED },
            { ...base.participants[1], userId: ANA, displayName: 'Ana', state: ChatCallParticipantState.JOINED },
        ];

        return {
            ...base,
            isGroup: true,
            title: 'Weekend',
            maxParticipants: 3,
            status: ChatCallStatus.ACTIVE,
            answeredAt: '2026-11-14T10:00:05.000Z',
            participants: mine === null ? others : [{ ...base.participants[0], state: mine }, ...others],
            ...overrides,
        };
    };

    const threadInLayer = (h: ReturnType<typeof harness>): void => {
        render(
            <ChatCallLayer>
                <ChatThread conversationId={CONVERSATION} />
            </ChatCallLayer>,
            { wrapper: h.wrapper },
        );
    };

    it('says which group is calling', async () => {
        const h = harness({ incoming: [group({}, ChatCallParticipantState.RINGING)] });

        render(<ChatCallLayer />, { wrapper: h.wrapper });

        expect(await screen.findByRole('alertdialog')).toHaveAccessibleName(
            'chat.call.incoming-group {"kind":"video","name":"Giorgi","title":"Weekend"}',
        );
    });

    it('shows a call going on in the group, and joins it into the group screen', async () => {
        const h = harness({ isGroup: true });
        const inIt = group({}, ChatCallParticipantState.JOINED);
        h.stub.on('GET', `/conversations/${CONVERSATION}/calls/current`, () => ({ body: { call: group() } }));
        h.stub.on('POST', `/calls/${CALL}/join`, () => ({ body: join(inIt) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: inIt }));
        threadInLayer(h);

        const banner = await screen.findByRole('status');
        expect(within(banner).getByText('chat.call.in-progress {"kind":"video"}')).toBeInTheDocument();
        expect(within(banner).getByText('chat.call.people {"count":2}')).toBeInTheDocument();

        await userEvent.click(within(banner).getByRole('button', { name: 'chat.call.join' }));

        expect(await screen.findByRole('dialog', { name: 'Weekend' })).toBeInTheDocument();
        await waitFor(() => {
            expect(rooms.connected).toEqual([{ url: 'ws://livekit.test', token: `token-for-${CALL}` }]);
        });
        expect(screen.getByRole('button', { name: 'chat.call.leave' })).toBeInTheDocument();
    });

    it('says a full call is full and offers no join', async () => {
        const h = harness({ isGroup: true });
        h.stub.on('GET', `/conversations/${CONVERSATION}/calls/current`, () => ({
            body: { call: group({ maxParticipants: 2 }) },
        }));
        threadInLayer(h);

        const banner = await screen.findByRole('status');
        expect(within(banner).getByText('chat.call.full')).toBeInTheDocument();
        expect(within(banner).getByRole('button', { name: 'chat.call.join' })).toBeDisabled();
    });

    it('leaves, and the screen goes at once while the others carry on', async () => {
        const h = harness({ isGroup: true });
        const inIt = group({}, ChatCallParticipantState.JOINED);
        h.stub.on('GET', `/conversations/${CONVERSATION}/calls/current`, () => ({ body: { call: group() } }));
        h.stub.on('POST', `/calls/${CALL}/join`, () => ({ body: join(inIt) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: inIt }));
        h.stub.on('POST', `/calls/${CALL}/end`, () => ({ body: group({}, ChatCallParticipantState.LEFT) }));
        threadInLayer(h);

        await userEvent.click(
            within(await screen.findByRole('status')).getByRole('button', { name: 'chat.call.join' }),
        );
        await userEvent.click(await screen.findByRole('button', { name: 'chat.call.leave' }));

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Weekend' })).not.toBeInTheDocument();
        });
        expect(h.stub.requests.some((r) => r.method === 'POST' && r.path === `/calls/${CALL}/end`)).toBe(true);
        await waitFor(() => {
            expect(rooms.left).toBe(1);
        });
    });
});
