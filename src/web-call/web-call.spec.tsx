import {
    ChatCallKind,
    ChatConversationKind,
    ChatCallParticipantState,
    ChatCallStatus,
    type ChatCall,
    type ChatCallJoin,
} from '@iveri/contracts/chat';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONVERSATION, conversation, ME, participant } from '../testing/fixtures.js';
import { createHarness } from '../testing/render.js';
import { ChatThread } from '../web/ChatThread.js';

import { ChatCallLayer } from './ChatCallLayer.js';

/** LiveKit's browser client needs WebRTC, which jsdom has none of; the room is the one thing stood in for. */
type Handler = (...args: unknown[]) => void;
const rooms = vi.hoisted(() => ({
    connected: [] as { url: string; token: string }[],
    left: 0,
    /** What the browser lists, by kind; a test fills it before the call connects. */
    devices: new Map<string, { deviceId: string; label: string }[]>(),
    /** Every device switch the screen asked LiveKit for. */
    switched: [] as [string, string][],
    canChooseSpeaker: true,
    /** The room the screen made last, so a test can play LiveKit's events into it. */
    current: null as null | {
        emit: (event: string, ...args: unknown[]) => void;
        remoteParticipants: Map<string, unknown>;
        shares: boolean[];
    },
}));

vi.mock('livekit-client', () => {
    class Room {
        static getLocalDevices(kind: string): Promise<{ deviceId: string; label: string }[]> {
            return Promise.resolve(rooms.devices.get(kind) ?? []);
        }

        active = new Map<string, string>();
        remoteParticipants = new Map<string, unknown>();
        handlers = new Map<string, Handler[]>();
        shares: boolean[] = [];
        localParticipant = {
            identity: 'me',
            isScreenShareEnabled: false,
            setMicrophoneEnabled: (): Promise<void> => Promise.resolve(),
            setCameraEnabled: (): Promise<void> => Promise.resolve(),
            setScreenShareEnabled: (on: boolean): Promise<void> => {
                this.shares.push(on);

                return Promise.resolve();
            },
        };

        constructor() {
            rooms.current = this;
        }

        on(event: string, handler: Handler): this {
            this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);

            return this;
        }

        off(event: string, handler: Handler): this {
            this.handlers.set(
                event,
                (this.handlers.get(event) ?? []).filter((known) => known !== handler),
            );

            return this;
        }

        getActiveDevice(kind: string): string | undefined {
            return this.active.get(kind);
        }

        switchActiveDevice(kind: string, deviceId: string): Promise<boolean> {
            rooms.switched.push([kind, deviceId]);
            this.active.set(kind, deviceId);
            this.emit('active-device-changed', kind, deviceId);

            return Promise.resolve(true);
        }

        emit(event: string, ...args: unknown[]): void {
            for (const handler of this.handlers.get(event) ?? []) handler(...args);
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
            TrackSubscribed: 'track-subscribed',
            TrackUnsubscribed: 'track-unsubscribed',
            TrackUnpublished: 'track-unpublished',
            TrackMuted: 'track-muted',
            TrackUnmuted: 'track-unmuted',
            ParticipantConnected: 'participant-connected',
            ParticipantDisconnected: 'participant-disconnected',
            ActiveSpeakersChanged: 'active-speakers-changed',
            LocalTrackPublished: 'local-track-published',
            LocalTrackUnpublished: 'local-track-unpublished',
            MediaDevicesChanged: 'media-devices-changed',
            ActiveDeviceChanged: 'active-device-changed',
        },
        supportsAudioOutputSelection: (): boolean => rooms.canChooseSpeaker,
        Track: {
            Kind: { Video: 'video', Audio: 'audio' },
            Source: { Camera: 'camera', ScreenShare: 'screen_share' },
        },
    };
});

/** A video track as LiveKit hands one over, with the source that tells a camera from a shared screen. */
const videoTrack = (source: 'camera' | 'screen_share') => ({
    kind: 'video',
    source,
    attach: vi.fn(),
    detach: vi.fn((): HTMLElement[] => []),
});

const emit = (event: string, ...args: unknown[]): void => {
    act(() => {
        rooms.current?.emit(event, ...args);
    });
};

/** Lets this browser share a screen, as a desktop browser can and jsdom cannot. */
const allowScreenShare = (): (() => void) => {
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getDisplayMedia: vi.fn() },
    });

    return (): void => {
        Reflect.deleteProperty(navigator, 'mediaDevices');
    };
};

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
    rooms.current = null;
    rooms.devices = new Map();
    rooms.switched = [];
    rooms.canChooseSpeaker = true;
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

    it('offers no screen sharing where the browser cannot share a screen', async () => {
        const answered = call({ status: ChatCallStatus.ACTIVE }, true);
        const h = harness({ incoming: [call({}, true)] });
        h.stub.on('POST', `/calls/${CALL}/accept`, () => ({ body: join(answered) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: answered }));

        render(<ChatCallLayer />, { wrapper: h.wrapper });
        await userEvent.click(await screen.findByRole('button', { name: /chat.call.answer/u }));

        expect(await screen.findByRole('button', { name: 'chat.call.hang-up' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'chat.call.share-screen' })).not.toBeInTheDocument();
    });

    it("shares my screen, says so, and goes back when the browser's own bar stops it", async () => {
        const restore = allowScreenShare();
        const answered = call({ status: ChatCallStatus.ACTIVE }, true);
        const h = harness({ incoming: [call({}, true)] });
        h.stub.on('POST', `/calls/${CALL}/accept`, () => ({ body: join(answered) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: answered }));

        try {
            render(<ChatCallLayer />, { wrapper: h.wrapper });
            await userEvent.click(await screen.findByRole('button', { name: /chat.call.answer/u }));
            await userEvent.click(await screen.findByRole('button', { name: 'chat.call.share-screen' }));

            expect(rooms.current?.shares).toEqual([true]);

            emit('local-track-published', { source: 'screen_share', track: videoTrack('screen_share') });
            expect(await screen.findByText('chat.call.sharing-mine')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'chat.call.stop-sharing', pressed: true })).toBeInTheDocument();

            // The browser's "Stop sharing" ends the track; LiveKit unpublishes it and the screen hears only that.
            emit('local-track-unpublished', { source: 'screen_share' });
            expect(screen.queryByText('chat.call.sharing-mine')).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'chat.call.share-screen' })).toBeInTheDocument();
        } finally {
            restore();
        }
    });

    it('lists the microphones, cameras and speakers, and switches to the one chosen', async () => {
        rooms.devices = new Map(
            Object.entries({
                audioinput: [
                    { deviceId: 'default', label: 'Default - Built-in microphone' },
                    { deviceId: 'headset-mic', label: 'Headset' },
                ],
                videoinput: [{ deviceId: 'cam-a', label: '' }],
                audiooutput: [{ deviceId: 'default', label: 'Built-in speakers' }],
            }),
        );
        const answered = call({ status: ChatCallStatus.ACTIVE }, true);
        const h = harness({ incoming: [call({}, true)] });
        h.stub.on('POST', `/calls/${CALL}/accept`, () => ({ body: join(answered) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: answered }));

        render(<ChatCallLayer />, { wrapper: h.wrapper });
        await userEvent.click(await screen.findByRole('button', { name: /chat.call.answer/u }));
        const control = await screen.findByRole('button', { name: 'chat.call.devices', expanded: false });
        await userEvent.click(control);

        const panel = screen.getByRole('group', { name: 'chat.call.devices' });
        const microphone = within(panel).getByRole('combobox', { name: 'chat.call.device.microphone' });
        await waitFor(() => {
            expect(within(microphone).getAllByRole('option')).toHaveLength(2);
        });
        expect(microphone).toHaveValue('default');
        // A camera the browser gave no name is numbered rather than left blank.
        expect(within(panel).getByRole('option', { name: 'chat.call.device.unnamed {"index":1}' })).toBeInTheDocument();
        expect(within(panel).getByRole('combobox', { name: 'chat.call.device.speaker' })).toBeInTheDocument();

        await userEvent.selectOptions(microphone, 'headset-mic');
        expect(rooms.switched).toEqual([['audioinput', 'headset-mic']]);
        expect(microphone).toHaveValue('headset-mic');

        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('group', { name: 'chat.call.devices' })).not.toBeInTheDocument();
    });

    it('offers no camera in a voice call, and no speaker where the browser cannot switch one', async () => {
        rooms.canChooseSpeaker = false;
        rooms.devices = new Map(
            Object.entries({
                audioinput: [{ deviceId: 'mic-a', label: 'Microphone' }],
                videoinput: [{ deviceId: 'cam-a', label: 'Camera' }],
                audiooutput: [{ deviceId: 'out-a', label: 'Speakers' }],
            }),
        );
        const answered = call({ status: ChatCallStatus.ACTIVE, kind: ChatCallKind.VOICE }, true);
        const h = harness({ incoming: [call({ kind: ChatCallKind.VOICE }, true)] });
        h.stub.on('POST', `/calls/${CALL}/accept`, () => ({ body: join(answered) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: answered }));

        render(<ChatCallLayer />, { wrapper: h.wrapper });
        await userEvent.click(await screen.findByRole('button', { name: /chat.call.answer/u }));
        await userEvent.click(await screen.findByRole('button', { name: 'chat.call.devices' }));

        const panel = screen.getByRole('group', { name: 'chat.call.devices' });
        expect(await within(panel).findByRole('combobox', { name: 'chat.call.device.microphone' })).toHaveValue(
            'mic-a',
        );
        expect(within(panel).queryByRole('combobox', { name: 'chat.call.device.camera' })).not.toBeInTheDocument();
        expect(within(panel).queryByRole('combobox', { name: 'chat.call.device.speaker' })).not.toBeInTheDocument();
    });

    it('says so when the browser lists no device at all', async () => {
        const answered = call({ status: ChatCallStatus.ACTIVE }, true);
        const h = harness({ incoming: [call({}, true)] });
        h.stub.on('POST', `/calls/${CALL}/accept`, () => ({ body: join(answered) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: answered }));

        render(<ChatCallLayer />, { wrapper: h.wrapper });
        await userEvent.click(await screen.findByRole('button', { name: /chat.call.answer/u }));
        await userEvent.click(await screen.findByRole('button', { name: 'chat.call.devices' }));

        expect(screen.getByText('chat.call.devices.none')).toBeInTheDocument();
    });

    it("shows the other person's shared screen whole, and names who is sharing", async () => {
        const ringing = call({}, true);
        const answered = call(
            {
                status: ChatCallStatus.ACTIVE,
                answeredAt: '2026-11-14T10:00:05.000Z',
                participants: ringing.participants.map((person) => ({
                    ...person,
                    state: ChatCallParticipantState.JOINED,
                })),
            },
            true,
        );
        const h = harness({ incoming: [call({}, true)] });
        h.stub.on('POST', `/calls/${CALL}/accept`, () => ({ body: join(answered) }));
        h.stub.on('GET', `/calls/${CALL}`, () => ({ body: answered }));

        render(<ChatCallLayer />, { wrapper: h.wrapper });
        await userEvent.click(await screen.findByRole('button', { name: /chat.call.answer/u }));
        await screen.findByRole('dialog', { name: 'Giorgi' });

        const shared = videoTrack('screen_share');
        emit('participant-connected', { identity: OTHER });
        emit('track-subscribed', shared, { source: 'screen_share' }, { identity: OTHER });

        expect(await screen.findByText('chat.call.sharing {"name":"Giorgi"}')).toBeInTheDocument();
        const element = shared.attach.mock.calls[0]?.[0] as HTMLVideoElement;
        expect(element.className).toContain('object-contain');
        expect(element.className).not.toContain('hidden');

        emit('track-unsubscribed', shared, { source: 'screen_share' }, { identity: OTHER });
        expect(screen.queryByText('chat.call.sharing {"name":"Giorgi"}')).not.toBeInTheDocument();
    });

    it('asks for no ringing call while nobody is signed in', async () => {
        const h = harness({ signedOut: true });

        render(<ChatCallLayer />, { wrapper: h.wrapper });

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(h.stub.requests.some((r) => r.path === '/me/calls/incoming')).toBe(false);
    });
});

describe('Group calls', () => {
    const ANA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as ChatCall['startedBy'];
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
    describe('the stage', () => {
        /** Somebody in the room, with a camera or a shared screen the test can switch on. */
        const remote = (identity: string) => {
            const tracks = new Map<string, ReturnType<typeof videoTrack>>();

            return {
                identity,
                isSpeaking: false,
                tracks,
                getTrackPublication: (source: string) => {
                    const track = tracks.get(source);

                    return track === undefined ? undefined : { isSubscribed: true, isMuted: false, videoTrack: track };
                },
            };
        };

        const joinGroup = async (h: ReturnType<typeof harness>): Promise<void> => {
            const inIt = group({}, ChatCallParticipantState.JOINED);
            h.stub.on('GET', `/conversations/${CONVERSATION}/calls/current`, () => ({ body: { call: group() } }));
            h.stub.on('POST', `/calls/${CALL}/join`, () => ({ body: join(inIt) }));
            h.stub.on('GET', `/calls/${CALL}`, () => ({ body: inIt }));
            threadInLayer(h);
            await userEvent.click(
                within(await screen.findByRole('status')).getByRole('button', { name: 'chat.call.join' }),
            );
            await waitFor(() => {
                expect(rooms.connected).toHaveLength(1);
            });
        };

        it('draws whoever spoke last large, and the others in a row', async () => {
            const h = harness({ isGroup: true });
            await joinGroup(h);
            const giorgi = remote(OTHER);
            const ana = remote(ANA);
            rooms.current?.remoteParticipants.set(OTHER, giorgi);
            rooms.current?.remoteParticipants.set(ANA, ana);

            emit('participant-connected', giorgi);
            emit('active-speakers-changed', [ana]);

            const row = await screen.findByRole('list');
            expect(within(row).getByText('Giorgi')).toBeInTheDocument();
            expect(within(row).queryByText('Ana')).not.toBeInTheDocument();
            expect(screen.getByText('Ana')).toBeInTheDocument();

            emit('active-speakers-changed', [giorgi]);
            expect(within(screen.getByRole('list')).getByText('Ana')).toBeInTheDocument();
            expect(within(screen.getByRole('list')).queryByText('Giorgi')).not.toBeInTheDocument();
        });

        it('gives a shared screen the stage, its sharer keeping a tile', async () => {
            const h = harness({ isGroup: true });
            await joinGroup(h);
            const giorgi = remote(OTHER);
            const ana = remote(ANA);
            rooms.current?.remoteParticipants.set(OTHER, giorgi);
            rooms.current?.remoteParticipants.set(ANA, ana);
            emit('participant-connected', giorgi);
            emit('active-speakers-changed', [ana]);

            const shared = videoTrack('screen_share');
            giorgi.tracks.set('screen_share', shared);
            emit('track-subscribed', shared, { source: 'screen_share' }, giorgi);

            expect(await screen.findByText('chat.call.sharing {"name":"Giorgi"}')).toBeInTheDocument();
            const row = screen.getByRole('list');
            expect(within(row).getByText('Giorgi')).toBeInTheDocument();
            expect(within(row).getByText('Ana')).toBeInTheDocument();
            await waitFor(() => {
                expect((shared.attach.mock.calls[0]?.[0] as HTMLVideoElement).className).toContain('object-contain');
            });

            // LiveKit's order: the track is announced as unsubscribed while its publication still holds it.
            emit('track-unsubscribed', shared, { source: 'screen_share' }, giorgi);
            expect(screen.queryByText('chat.call.sharing {"name":"Giorgi"}')).not.toBeInTheDocument();
            giorgi.tracks.delete('screen_share');
            emit('track-unpublished', { source: 'screen_share' }, giorgi);
            expect(screen.queryByText('chat.call.sharing {"name":"Giorgi"}')).not.toBeInTheDocument();
        });
    });
});
