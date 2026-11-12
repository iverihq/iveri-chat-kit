import type { ChatAttachment } from '@iveri/contracts/chat';
import { useState } from 'react';

import { useChatText } from '../provider/index.js';

import { ChatDialog } from './ChatDialog.js';
import { BackIcon, DownloadIcon, ForwardIcon } from './icons.js';
import { cn, FOCUS_RING } from './style.js';

export interface LightboxProps {
    photos: ChatAttachment[];
    startIndex: number;
    senderName: string;
    onClose: () => void;
}

const ROUND_DARK = cn(
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors duration-fast hover:bg-white/20 disabled:opacity-30',
    FOCUS_RING,
);

/** A message's photographs at full size, one at a time, with the arrow keys moving between them. */
export function Lightbox({ photos, startIndex, senderName, onClose }: Readonly<LightboxProps>): React.JSX.Element {
    const t = useChatText();
    const [index, setIndex] = useState(startIndex);
    const photo = photos[Math.min(index, photos.length - 1)];
    const hasMany = photos.length > 1;

    const move = (step: number): void => {
        setIndex((current) => Math.min(photos.length - 1, Math.max(0, current + step)));
    };

    return (
        <ChatDialog
            title={t('chat.lightbox.label', { index: index + 1, count: photos.length })}
            onClose={onClose}
            tone="media"
        >
            <div
                className="flex h-full min-h-[60dvh] items-center gap-3"
                onKeyDown={(event) => {
                    if (event.key === 'ArrowRight') move(1);
                    if (event.key === 'ArrowLeft') move(-1);
                }}
            >
                {hasMany && (
                    <button
                        type="button"
                        aria-label={t('chat.lightbox.previous')}
                        disabled={index === 0}
                        onClick={() => {
                            move(-1);
                        }}
                        className={ROUND_DARK}
                    >
                        <BackIcon />
                    </button>
                )}
                <figure className="flex min-w-0 flex-1 flex-col items-center gap-3">
                    <img
                        key={photo.id}
                        src={photo.url}
                        alt={t('chat.message.photo', { name: senderName })}
                        className="max-h-[78dvh] max-w-full animate-fade-in rounded-chat-control object-contain"
                    />
                    <figcaption className="flex items-center gap-3 text-small text-white/80">
                        <a
                            href={photo.url}
                            download={photo.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t('chat.message.download', { name: photo.fileName })}
                            className={cn(ROUND_DARK, 'h-9 w-9')}
                        >
                            <DownloadIcon className="h-4.5 w-4.5" />
                        </a>
                    </figcaption>
                </figure>
                {hasMany && (
                    <button
                        type="button"
                        aria-label={t('chat.lightbox.next')}
                        disabled={index === photos.length - 1}
                        onClick={() => {
                            move(1);
                        }}
                        className={ROUND_DARK}
                    >
                        <ForwardIcon />
                    </button>
                )}
            </div>
        </ChatDialog>
    );
}
