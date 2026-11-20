import type { Maybe, Nullable, UUID } from '@iveri/contracts';
import {
    ChatCallKind,
    ChatCallStatus,
    type ChatCallJoin,
    type ChatCallParticipant,
    type ChatImage,
} from '@iveri/contracts/chat';
import type { VideoTrack } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useChatContext, useChatText } from '../provider/index.js';
import { useCall, useCallActions } from '../query/index.js';
import { arrangeCallStage, callEndLine, callMe, callPhase, callTitle, formatCallClock } from '../util/index.js';
import { ChatAvatar } from '../web/ChatAvatar.js';
import { ChatThemeScope } from '../web/ChatThemeScope.js';
import { HangUpIcon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from '../web/icons.js';
import { cn, FOCUS_RING } from '../web/style.js';

import { ScreenShareButton, SharingMyScreen } from './ScreenShareButton.js';
import { useGroupCallMedia } from './use-group-call-media.js';

const END_LINE_MS = 2_500;

const CONTROL_SHAPE = cn(
    'inline-flex h-14 w-14 items-center justify-center rounded-full text-white transition duration-fast',
    FOCUS_RING,
);
const CONTROL = cn(CONTROL_SHAPE, 'bg-white/15 hover:bg-white/25');
const LEAVE = cn(CONTROL_SHAPE, 'bg-critical hover:brightness-95');

/**
 * One video in a group call, or the person's picture while there is none. `stage` is the large one; the others sit in a
 * row under it. A shared screen is fitted whole (`contain`), never cropped, because its words are what was shared.
 */
function Tile({
    track,
    name,
    avatar,
    label,
    isSpeaking,
    isStage,
    isScreen = false,
}: Readonly<{
    track: Nullable<VideoTrack>;
    name: string;
    avatar: Nullable<ChatImage>;
    label: string;
    isSpeaking: boolean;
    isStage: boolean;
    isScreen?: boolean;
}>): React.JSX.Element {
    const video = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const element = video.current;

        if (track === null || element === null) return undefined;

        track.attach(element);

        return (): void => {
            track.detach(element);
        };
    }, [track]);

    return (
        <div
            className={cn(
                'relative flex items-center justify-center overflow-hidden rounded-chat-card bg-white/5',
                isStage ? 'min-h-0 flex-1' : 'aspect-video w-36 shrink-0 sm:w-44',
                isSpeaking && 'ring-2 ring-chat-accent',
                isScreen && 'bg-black',
            )}
        >
            {track === null ? (
                <ChatAvatar name={name} image={avatar} size={isStage ? 'lg' : 'md'} />
            ) : (
                <video
                    ref={video}
                    autoPlay
                    playsInline
                    muted
                    className={cn('absolute inset-0 h-full w-full', isScreen ? 'object-contain' : 'object-cover')}
                />
            )}
            <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-black/50 px-2 py-0.5 text-caption text-white">
                {label}
            </span>
        </div>
    );
}

export interface ChatGroupCallScreenProps {
    callId: UUID;
    join: Maybe<ChatCallJoin>;
    onClose: () => void;
}

/**
 * A group call, over the whole app: the group's name and the clock, one person or screen large (a shared screen, else
 * whoever spoke last) with the others in a row under it, eight videos at most (`arrangeCallStage`), how many more are in
 * it, my own camera small, and mute, camera, share my screen (where the browser can) and leave.
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
    const { stage, tiles, more } = arrangeCallStage(media.people);
    const who = (identity: string): Maybe<ChatCallParticipant> => byUser.get(identity as UUID) ?? null;
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
                <div className="relative flex min-h-0 flex-1 flex-col justify-center gap-3 p-4">
                    {stage !== null && phase !== 'ended' && (
                        <Tile
                            track={stage.kind === 'screen' ? stage.person.screen : stage.person.video}
                            name={who(stage.person.identity)?.displayName ?? ''}
                            avatar={who(stage.person.identity)?.avatar ?? null}
                            label={
                                stage.kind === 'screen'
                                    ? t('chat.call.sharing', { name: who(stage.person.identity)?.displayName ?? '' })
                                    : (who(stage.person.identity)?.displayName ?? '')
                            }
                            isSpeaking={stage.kind === 'speaker' && stage.person.isSpeaking}
                            isStage
                            isScreen={stage.kind === 'screen'}
                        />
                    )}
                    {tiles.length > 0 && phase !== 'ended' && (
                        <ul className="flex shrink-0 justify-center-safe gap-3 overflow-x-auto pb-1">
                            {tiles.map((person) => (
                                <li key={person.identity}>
                                    <Tile
                                        track={person.video}
                                        name={who(person.identity)?.displayName ?? ''}
                                        avatar={who(person.identity)?.avatar ?? null}
                                        label={who(person.identity)?.displayName ?? ''}
                                        isSpeaking={person.isSpeaking}
                                        isStage={false}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                    {more > 0 && phase !== 'ended' && (
                        <p className="text-center text-label text-white/80">{t('chat.call.more', { count: more })}</p>
                    )}
                    {kind === ChatCallKind.VIDEO && (
                        <video
                            ref={localVideo}
                            autoPlay
                            playsInline
                            muted
                            aria-label={me?.displayName}
                            className={cn(
                                'absolute right-6 top-6 z-10 aspect-[3/4] w-20 rounded-chat-card bg-black/40 object-cover shadow-lg sm:w-32',
                                media.isSpeaking && 'ring-2 ring-chat-accent',
                                (!media.isCameraOn || phase === 'ended') && 'hidden',
                            )}
                        />
                    )}
                    {media.isSharingScreen && phase !== 'ended' && <SharingMyScreen onStop={media.toggleScreenShare} />}
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
                        {media.canShareScreen && media.isConnected && (
                            <ScreenShareButton
                                isSharing={media.isSharingScreen}
                                onToggle={media.toggleScreenShare}
                                className={CONTROL}
                            />
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
