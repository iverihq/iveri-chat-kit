import type { Maybe, Nullable, UUID } from '@iveri/contracts';
import { ChatCallKind, ChatCallStatus, type ChatCallJoin, type ChatCallParticipant } from '@iveri/contracts/chat';
import type { VideoTrack } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useChatContext, useChatText } from '../provider/index.js';
import { useCall, useCallActions } from '../query/index.js';
import { callEndLine, callMe, callPhase, callTitle, formatCallClock, orderCallTiles } from '../util/index.js';
import { ChatAvatar } from '../web/ChatAvatar.js';
import { ChatThemeScope } from '../web/ChatThemeScope.js';
import { HangUpIcon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from '../web/icons.js';
import { cn, FOCUS_RING } from '../web/style.js';

import { useGroupCallMedia, type ChatGroupCallPerson } from './use-group-call-media.js';

const END_LINE_MS = 2_500;

const CONTROL_SHAPE = cn(
    'inline-flex h-14 w-14 items-center justify-center rounded-full text-white transition duration-fast',
    FOCUS_RING,
);
const CONTROL = cn(CONTROL_SHAPE, 'bg-white/15 hover:bg-white/25');
const LEAVE = cn(CONTROL_SHAPE, 'bg-critical hover:brightness-95');

/** Columns by how many tiles there are, so two sit side by side and eight fill a screen. */
function gridColumns(tiles: number): string {
    if (tiles <= 1) return 'grid-cols-1';
    if (tiles <= 4) return 'grid-cols-2';

    return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
}

function Tile({
    person,
    participant,
}: Readonly<{ person: ChatGroupCallPerson; participant: Maybe<ChatCallParticipant> }>): React.JSX.Element {
    const video = useRef<HTMLVideoElement | null>(null);
    const track: Nullable<VideoTrack> = person.video;
    const name = participant?.displayName ?? '';

    useEffect(() => {
        const element = video.current;

        if (track === null || element === null) return undefined;

        track.attach(element);

        return (): void => {
            track.detach(element);
        };
    }, [track]);

    return (
        <li
            className={cn(
                'relative flex aspect-video min-h-0 items-center justify-center overflow-hidden rounded-chat-card bg-white/5',
                person.isSpeaking && 'ring-2 ring-chat-accent',
            )}
        >
            {track === null ? (
                <ChatAvatar name={name} image={participant?.avatar ?? null} size="lg" />
            ) : (
                <video ref={video} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            )}
            <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-black/50 px-2 py-0.5 text-caption text-white">
                {name}
            </span>
        </li>
    );
}

export interface ChatGroupCallScreenProps {
    callId: UUID;
    join: Maybe<ChatCallJoin>;
    onClose: () => void;
}

/**
 * A group call, over the whole app: the group's name and the clock, a grid of up to eight people (video first, then
 * whoever spoke last, the speaker outlined), how many more are in it, my own camera small, and mute, camera and leave.
 * Leaving leaves the call to the others; the screen closes once I have left or the call has ended.
 */
export function ChatGroupCallScreen({
    callId,
    join,
    onClose,
}: Readonly<ChatGroupCallScreenProps>): React.JSX.Element | null {
    const t = useChatText();
    const { translate } = useChatContext();
    const actions = useCallActions();
    const call = useCall(callId).data;
    const [hasLeft, setLeft] = useState(false);
    const isOver = call?.status === ChatCallStatus.ENDED;
    const kind = call?.kind ?? ChatCallKind.VOICE;
    const localVideo = useRef<HTMLVideoElement | null>(null);
    const audio = useRef<HTMLDivElement | null>(null);
    const media = useGroupCallMedia(isOver || hasLeft ? null : join, kind, { localVideo, audio });
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
        }, 1_000);

        return (): void => {
            clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        if (hasLeft) {
            onClose();

            return undefined;
        }
        if (!isOver) return undefined;

        const timer = setTimeout(onClose, END_LINE_MS);

        return (): void => {
            clearTimeout(timer);
        };
    }, [isOver, hasLeft, onClose]);

    if (call === undefined) return null;

    const title = callTitle(call, translate);
    const phase = callPhase(call, media.isConnected);
    const byUser = new Map(call.participants.map((participant) => [participant.userId, participant]));
    const { tiles, more } = orderCallTiles(media.people);
    const leave = (): void => {
        setLeft(true);
        void actions.end(callId).catch(() => undefined);
    };

    const status =
        media.failure === 'permission'
            ? t('chat.call.permission', { kind })
            : media.failure === 'connection'
              ? t('chat.call.failed')
              : phase === 'ended'
                ? t(callEndLine(call).key as Parameters<typeof t>[0], { name: title })
                : phase === 'connecting'
                  ? t('chat.call.connecting')
                  : media.people.length === 0
                    ? t('chat.call.waiting')
                    : call.answeredAt !== null
                      ? formatCallClock(now - new Date(call.answeredAt).getTime())
                      : t('chat.call.waiting');
    const me = callMe(call);

    return createPortal(
        <ChatThemeScope>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="fixed inset-0 z-[70] flex flex-col bg-chat-ink text-white"
            >
                <div ref={audio} hidden />
                <header className="flex flex-col items-center gap-1 px-6 pt-8 text-center">
                    <p className="font-chat-display text-h3 font-semibold [overflow-wrap:break-word]">{title}</p>
                    <p aria-live="polite" className="text-body tabular-nums text-white/80">
                        {status}
                    </p>
                    {phase === 'live' && (
                        <p className="text-caption text-white/60">
                            {t('chat.call.people', { count: media.people.length + 1 })}
                        </p>
                    )}
                </header>
                <div className="relative flex min-h-0 flex-1 flex-col justify-center p-4">
                    {tiles.length > 0 && phase !== 'ended' && (
                        <ul className={cn('mx-auto grid w-full max-w-6xl gap-3', gridColumns(tiles.length))}>
                            {tiles.map((person) => (
                                <Tile
                                    key={person.identity}
                                    person={person}
                                    participant={byUser.get(person.identity as UUID) ?? null}
                                />
                            ))}
                        </ul>
                    )}
                    {more > 0 && phase !== 'ended' && (
                        <p className="mt-3 text-center text-label text-white/80">{t('chat.call.more', { count: more })}</p>
                    )}
                    {kind === ChatCallKind.VIDEO && (
                        <video
                            ref={localVideo}
                            autoPlay
                            playsInline
                            muted
                            aria-label={me?.displayName}
                            className={cn(
                                'absolute bottom-4 right-4 z-10 aspect-[3/4] w-24 rounded-chat-card bg-black/40 object-cover shadow-lg sm:w-36',
                                media.isSpeaking && 'ring-2 ring-chat-accent',
                                (!media.isCameraOn || phase === 'ended') && 'hidden',
                            )}
                        />
                    )}
                </div>
                {phase !== 'ended' && (
                    <div className="relative z-10 flex items-center justify-center gap-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
                        <button
                            type="button"
                            aria-label={t(media.isMicOn ? 'chat.call.mute' : 'chat.call.unmute')}
                            aria-pressed={!media.isMicOn}
                            onClick={media.toggleMic}
                            className={CONTROL}
                        >
                            {media.isMicOn ? <MicIcon className="h-6 w-6" /> : <MicOffIcon className="h-6 w-6" />}
                        </button>
                        {kind === ChatCallKind.VIDEO && (
                            <button
                                type="button"
                                aria-label={t(media.isCameraOn ? 'chat.call.camera-off' : 'chat.call.camera-on')}
                                aria-pressed={!media.isCameraOn}
                                onClick={media.toggleCamera}
                                className={CONTROL}
                            >
                                {media.isCameraOn ? (
                                    <VideoIcon className="h-6 w-6" />
                                ) : (
                                    <VideoOffIcon className="h-6 w-6" />
                                )}
                            </button>
                        )}
                        <button type="button" aria-label={t('chat.call.leave')} onClick={leave} className={LEAVE}>
                            <HangUpIcon className="h-6 w-6" />
                        </button>
                    </div>
                )}
            </div>
        </ChatThemeScope>,
        document.body,
    );
}
