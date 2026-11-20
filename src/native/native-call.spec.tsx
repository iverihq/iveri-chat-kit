import {
    ChatCallKind,
    ChatCallParticipantState,
    ChatCallStatus,
    ChatConversationKind,
    type ChatCall,
} from '@iveri/contracts/chat';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatNativeCallLayer } from '../native-call/index.js';
import { CONVERSATION, conversation, ME, participant } from '../testing/fixtures.js';
import { createHarness } from '../testing/render.js';

import { ChatNativeProvider } from './ChatNativeProvider.js';
import { ChatThreadScreen } from './ChatThreadScreen.js';

// The phone's call layer, drawn through react-native-web like every native spec. LiveKit's React Native module and
// its room need a phone; both are stood in for, so this proves the layer rings, answers and connects with what
// `chat-api` gave it, and nothing about audio or video.
const rooms = vi.hoisted(() => ({
    connected: [] as { url: string; token: string }[],
    sessions: 0,
    /** The room made last, so a test can play LiveKit's events into it. */
    current: null as null | { emit: (event: string, ...args: unknown[]) => void },
}));
// Hoisted with the mock that uses it, and named in camelCase as a property, since the rules want one.
const stand = vi.hoisted(() => ({ noVideo: (): null => null }));

vi.mock('@livekit/react-native', () => ({
    VideoView: stand.noVideo,
    AudioSession: {
        startAudioSession: (): Promise<void> => {
            rooms.sessions += 1;

            return Promise.resolve();
        },
        stopAudioSession: (): Promise<void> => Promise.resolve(),
    },
}));

vi.mock('livekit-client', () => {
    class Room {
        remoteParticipants = new Map();
        localParticipant = {
            setMicrophoneEnabled: (): Promise<void> => Promise.resolve(),
            setCameraEnabled: (): Promise<void> => Promise.resolve(),
            getTrackPublication: (): undefined => undefined,
        };

        handlers = new Map<string, ((...args: unknown[]) => void)[]>();

        constructor() {
            rooms.current = this;
        }

        on(event: string, handler: (...args: unknown[]) => void): this {
            this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);

            return this;
        }

        emit(event: string, ...args: unknown[]): void {
            for (const handler of this.handlers.get(event) ?? []) handler(...args);
        }

        connect(url: string, token: string): Promise<void> {
            rooms.connected.push({ url, token });

            return Promise.resolve();
        }

        disconnect(): Promise<void> {
            return Promise.resolve();
        }
    }

    return {
        Room,
        RoomEvent: { TrackSubscribed: 'track-subscribed', ParticipantConnected: 'participant-connected' },
        Track: { Kind: { Video: 'video', Audio: 'audio' }, Source: { Camera: 'camera', ScreenShare: 'screen_share' } },
    };
});

const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CALL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const call = (overrides: Partial<ChatCall> = {}): ChatCall => ({
    id: CALL,
    conversationId: CONVERSATION,
    kind: ChatCallKind.VOICE,
    status: ChatCallStatus.RINGING,
    endReason: null,
    startedBy: OTHER,
    participants: [
        {
            userId: ME,
            displayName: 'Me',
            avatar: null,
            state: ChatCallParticipantState.RINGING,
            joinedAt: null,
            leftAt: null,
            isMe: true,
        },
        {
            userId: OTHER,
            displayName: 'Giorgi',
            avatar: null,
            state: ChatCallParticipantState.JOINED,
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

beforeEach(() => {
    rooms.connected = [];
    rooms.sessions = 0;
    rooms.current = null;
});

describe('ChatNativeCallLayer', () => {
    it('draws the call controls in a thread only inside the layer, and only where calls are allowed', async () => {
        const harness = createHarness();
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({
            body: conversation({
                canCall: true,
                participants: [participant({ userId: ME, isMe: true }), participant({ userId: OTHER })],
            }),
        }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 0, messages: [] },
        }));
        harness.stub.on('GET', '/me/calls/incoming', () => ({ body: [] }));

        render(
            <ChatNativeProvider capabilities={{}}>
                <ChatNativeCallLayer>
                    <ChatThreadScreen conversationId={CONVERSATION} />
                </ChatNativeCallLayer>
            </ChatNativeProvider>,
            { wrapper: harness.wrapper },
        );

        expect(await screen.findByText('chat.call.start-voice')).toBeInTheDocument();
        expect(screen.getByText('chat.call.start-video')).toBeInTheDocument();
    });

    it('shows who is calling, and answering starts the audio session and joins the room', async () => {
        const harness = createHarness();
        const answered = call({ status: ChatCallStatus.ACTIVE });
        harness.stub.on('GET', '/me/calls/incoming', () => ({ body: [call()] }));
        harness.stub.on('POST', `/calls/${CALL}/accept`, () => ({
            body: { call: answered, url: 'ws://livekit.test', token: 'token-1', expiresAt: '2026-11-14T10:10:00Z' },
        }));
        harness.stub.on('GET', `/calls/${CALL}`, () => ({ body: answered }));

        render(
            <ChatNativeProvider capabilities={{}}>
                <ChatNativeCallLayer />
            </ChatNativeProvider>,
            { wrapper: harness.wrapper },
        );

        expect(await screen.findByText('chat.call.incoming {"kind":"voice","name":"Giorgi"}')).toBeInTheDocument();
        fireEvent.click(screen.getByText('chat.call.answer'));

        await waitFor(() => {
            expect(rooms.connected).toEqual([{ url: 'ws://livekit.test', token: 'token-1' }]);
        });
        expect(rooms.sessions).toBe(1);
        expect(await screen.findByLabelText('chat.call.hang-up')).toBeInTheDocument();
    });

    it('shows a screen shared from a browser, and says whose it is', async () => {
        const harness = createHarness();
        const answered = call({
            status: ChatCallStatus.ACTIVE,
            answeredAt: '2026-11-14T10:00:05.000Z',
            participants: call().participants.map((person) => ({ ...person, state: ChatCallParticipantState.JOINED })),
        });
        harness.stub.on('GET', '/me/calls/incoming', () => ({ body: [call()] }));
        harness.stub.on('POST', `/calls/${CALL}/accept`, () => ({
            body: { call: answered, url: 'ws://livekit.test', token: 'token-1', expiresAt: '2026-11-14T10:10:00Z' },
        }));
        harness.stub.on('GET', `/calls/${CALL}`, () => ({ body: answered }));

        render(
            <ChatNativeProvider capabilities={{}}>
                <ChatNativeCallLayer />
            </ChatNativeProvider>,
            { wrapper: harness.wrapper },
        );

        fireEvent.click(await screen.findByText('chat.call.answer'));
        await waitFor(() => {
            expect(rooms.connected).toHaveLength(1);
        });
        act(() => {
            rooms.current?.emit('participant-connected', { identity: OTHER });
            rooms.current?.emit('track-subscribed', { kind: 'video', source: 'screen_share' });
        });

        expect(await screen.findByText('chat.call.sharing {"name":"Giorgi"}')).toBeInTheDocument();
    });

    it('shows a group call going on in the thread, and joining it opens the group screen', async () => {
        const harness = createHarness();
        const group = call({
            isGroup: true,
            title: 'Weekend',
            maxParticipants: 32,
            status: ChatCallStatus.ACTIVE,
            answeredAt: '2026-11-14T10:00:05.000Z',
        });
        const inIt = {
            ...group,
            participants: group.participants.map((p) => ({ ...p, state: ChatCallParticipantState.JOINED })),
        };
        harness.stub.on('GET', `/conversations/${CONVERSATION}`, () => ({
            body: conversation({
                kind: ChatConversationKind.GROUP,
                isGroup: true,
                title: 'Weekend',
                other: null,
                canCall: true,
                participants: [participant({ userId: ME, isMe: true }), participant({ userId: OTHER })],
            }),
        }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/messages`, () => ({
            body: { hasOlder: false, lastSeq: 0, messages: [] },
        }));
        harness.stub.on('GET', '/me/calls/incoming', () => ({ body: [] }));
        harness.stub.on('GET', `/conversations/${CONVERSATION}/calls/current`, () => ({ body: { call: group } }));
        harness.stub.on('POST', `/calls/${CALL}/join`, () => ({
            body: { call: inIt, url: 'ws://livekit.test', token: 'token-g', expiresAt: '2026-11-14T10:10:00Z' },
        }));
        harness.stub.on('GET', `/calls/${CALL}`, () => ({ body: inIt }));

        render(
            <ChatNativeProvider capabilities={{}}>
                <ChatNativeCallLayer>
                    <ChatThreadScreen conversationId={CONVERSATION} />
                </ChatNativeCallLayer>
            </ChatNativeProvider>,
            { wrapper: harness.wrapper },
        );

        expect(await screen.findByText('chat.call.in-progress {"kind":"voice"}')).toBeInTheDocument();
        fireEvent.click(screen.getByText('chat.call.join'));

        await waitFor(() => {
            expect(rooms.connected).toEqual([{ url: 'ws://livekit.test', token: 'token-g' }]);
        });
        expect(await screen.findByLabelText('chat.call.leave')).toBeInTheDocument();
    });
});
