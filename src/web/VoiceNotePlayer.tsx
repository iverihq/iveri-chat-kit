import type { ChatAttachment } from '@iveri/contracts/chat';
import { useEffect, useRef, useState } from 'react';

import { useChatText } from '../provider/index.js';
import { downsampleWaveform, formatDuration } from '../util/index.js';

import { PauseIcon, PlayIcon } from './icons.js';
import { cn, FOCUS_RING } from './style.js';

const BARS = 36;

/** Only one voice note plays at a time on a page: starting one pauses whichever was playing. */
let playing: HTMLAudioElement | null = null;

export interface VoiceNotePlayerProps {
    attachment: ChatAttachment;
    isOwn: boolean;
}

/**
 * A voice note: play and pause, its shape, how far through it is, and a slider to move through it.
 *
 * The slider is a real `<input type="range">` laid over the waveform, so it is reachable by keyboard and
 * announced with the position in words; the bars beneath it are decoration. The audio loads only when
 * played (`preload="none"`), because a long conversation is full of notes nobody will play again.
 */
export function VoiceNotePlayer({ attachment, isOwn }: Readonly<VoiceNotePlayerProps>): React.JSX.Element {
    const t = useChatText();
    const audio = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const durationMs = attachment.durationMs ?? 0;
    const bars = downsampleWaveform(attachment.waveform ?? [], BARS);
    const progress = durationMs > 0 ? Math.min(1, position / durationMs) : 0;

    useEffect(() => {
        const node = audio.current;

        return (): void => {
            if (node !== null && playing === node) playing = null;
            node?.pause();
        };
    }, []);

    const toggle = (): void => {
        const node = audio.current;
        if (node === null) return;
        if (node.paused) {
            if (playing !== null && playing !== node) playing.pause();
            playing = node;
            void node.play().catch(() => {
                setIsPlaying(false);
            });
        } else {
            node.pause();
        }
    };

    return (
        <div className="flex min-w-56 items-center gap-3 py-1 sm:min-w-64">
            <audio
                ref={audio}
                src={attachment.url}
                preload="none"
                onPlay={() => {
                    setIsPlaying(true);
                }}
                onPause={() => {
                    setIsPlaying(false);
                }}
                onEnded={() => {
                    setIsPlaying(false);
                    setPosition(0);
                }}
                onTimeUpdate={(event) => {
                    setPosition(event.currentTarget.currentTime * 1000);
                }}
            />
            <button
                type="button"
                onClick={toggle}
                aria-label={t(isPlaying ? 'chat.voice.pause' : 'chat.voice.play')}
                className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-fast',
                    isOwn
                        ? 'bg-chat-accent text-chat-accent-ink hover:bg-chat-accent-hover'
                        : 'bg-chat-accent-soft text-chat-accent hover:bg-chat-accent-line',
                    FOCUS_RING,
                )}
            >
                {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4 translate-x-px" />}
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="relative h-7">
                    <div aria-hidden="true" className="flex h-full items-center gap-[2px]">
                        {bars.map((level, index) => (
                            <span
                                // A fixed sequence for one attachment, never reordered: the position is the identity.
                                key={`bar-${index}`}
                                style={{ height: `${Math.max(12, level)}%` }}
                                className={cn(
                                    'w-[3px] flex-1 rounded-full transition-colors duration-fast',
                                    index / BARS < progress ? 'bg-chat-accent' : 'bg-chat-line-strong',
                                )}
                            />
                        ))}
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={Math.max(1, durationMs)}
                        step={100}
                        value={Math.min(position, Math.max(1, durationMs))}
                        aria-label={t('chat.voice.position')}
                        aria-valuetext={`${formatDuration(position)} / ${formatDuration(durationMs)}`}
                        onChange={(event) => {
                            const next = Number(event.target.value);
                            setPosition(next);
                            if (audio.current !== null) audio.current.currentTime = next / 1000;
                        }}
                        className={cn('absolute inset-0 h-full w-full cursor-pointer opacity-0', FOCUS_RING)}
                    />
                </div>
                <span className="text-2xs text-chat-muted tabular-nums">
                    {formatDuration(isPlaying || position > 0 ? position : durationMs)}
                </span>
            </div>
        </div>
    );
}
