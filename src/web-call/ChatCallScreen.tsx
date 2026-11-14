import type { Maybe, UUID } from '@iveri/contracts';
import { ChatCallKind, ChatCallStatus, type ChatCallJoin } from '@iveri/contracts/chat';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useChatText } from '../provider/index.js';
import { useCall, useCallActions } from '../query/index.js';
import { callEndLine, callOther, callPhase, formatCallClock } from '../util/index.js';
import { ChatAvatar } from '../web/ChatAvatar.js';
import { ChatThemeScope } from '../web/ChatThemeScope.js';
import { HangUpIcon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from '../web/icons.js';
import { cn, FOCUS_RING } from '../web/style.js';

import { useCallMedia } from './use-call-media.js';

/** How long the last line ("No answer", "Call ended") stays before the screen goes. */
const END_LINE_MS = 2_500;

const CONTROL = cn(
    'inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-fast hover:bg-white/25',
    FOCUS_RING,
);

export interface ChatCallScreenProps {
    callId: UUID;
    /** What connects this person to the call's room; null until the server has answered. */
    join: Maybe<ChatCallJoin>;
    onClose: () => void;
}

/**
 * The one call under way, over the whole app: who it is with, how long it has lasted, the other person's video large
 * and mine small, and mute, camera and hang up. It reads how the call stands from `chat-api` and leaves the room once
 * the call has ended, so a call the other person hung up, or one that rang out, closes here too.
 */
export function ChatCallScreen({ callId, join, onClose }: Readonly<ChatCallScreenProps>): React.JSX.Element | null {
    const t = useChatText();
    const actions = useCallActions();
    const call = useCall(callId).data;
    const isOver = call?.status === ChatCallStatus.ENDED;
    const kind = call?.kind ?? ChatCallKind.VOICE;
    const remoteVideo = useRef<HTMLVideoElement | null>(null);
    const remoteAudio = useRef<HTMLAudioElement | null>(null);
    const localVideo = useRef<HTMLVideoElement | null>(null);
    const media = useCallMedia(isOver ? null : join, kind, { remoteVideo, remoteAudio, localVideo });
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
        if (!isOver) return undefined;

        const timer = setTimeout(onClose, END_LINE_MS);

        return (): void => {
            clearTimeout(timer);
        };
    }, [isOver, onClose]);

    if (call === undefined) return null;

    const other = callOther(call);
    const name = other?.displayName ?? '';
    const phase = callPhase(call, media.hasOther);
    const hangUp = (): void => {
        void actions.end(callId).catch(() => undefined);
    };

    const status =
        media.failure === 'permission'
            ? t('chat.call.permission', { kind })
            : media.failure === 'connection'
              ? t('chat.call.failed')
              : phase === 'ended'
                ? t(callEndLine(call).key as Parameters<typeof t>[0], { name })
                : phase === 'outgoing'
                  ? t('chat.call.calling', { name })
                  : phase === 'live' && call.answeredAt !== null
                    ? formatCallClock(now - new Date(call.answeredAt).getTime())
                    : t('chat.call.connecting');

    const showsOtherVideo = kind === ChatCallKind.VIDEO && media.hasOtherVideo && phase === 'live';

    return createPortal(
        <ChatThemeScope>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={name}
                className="fixed inset-0 z-[70] flex flex-col bg-chat-ink text-white"
            >
                {/* The other person's sound plays whatever the call's kind. */}
                <audio ref={remoteAudio} autoPlay />
                <video
                    ref={remoteVideo}
                    autoPlay
                    playsInline
                    className={cn('absolute inset-0 h-full w-full object-cover', !showsOtherVideo && 'hidden')}
                />
                {kind === ChatCallKind.VIDEO && (
                    <video
                        ref={localVideo}
                        autoPlay
                        playsInline
                        muted
                        className={cn(
                            'absolute right-4 top-4 z-10 aspect-[3/4] w-28 rounded-chat-card bg-black/40 object-cover shadow-lg sm:w-40',
                            (!media.isCameraOn || phase === 'ended') && 'hidden',
                        )}
                    />
                )}
                <div
                    className={cn(
                        'relative z-10 flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center',
                        showsOtherVideo && 'justify-start pt-10',
                    )}
                >
                    {!showsOtherVideo && <ChatAvatar name={name} image={other?.avatar ?? null} size="lg" />}
                    <p className="font-chat-display text-h2 font-semibold drop-shadow">{name}</p>
                    <p aria-live="polite" className="text-body tabular-nums text-white/80 drop-shadow">
                        {status}
                    </p>
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
                        <button
                            type="button"
                            aria-label={t('chat.call.hang-up')}
                            onClick={hangUp}
                            className={cn(CONTROL, 'bg-critical hover:bg-critical hover:brightness-95')}
                        >
                            <HangUpIcon className="h-6 w-6" />
                        </button>
                    </div>
                )}
            </div>
        </ChatThemeScope>,
        document.body,
    );
}
