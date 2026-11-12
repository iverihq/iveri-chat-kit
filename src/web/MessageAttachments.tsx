import { ChatAttachmentKind } from '@iveri/contracts/chat';
import type { ChatAttachment } from '@iveri/contracts/chat';

import { useChatContext, useChatText } from '../provider/index.js';
import { formatByteSize } from '../util/index.js';

import { DownloadIcon, FileIcon } from './icons.js';
import { cn, FOCUS_RING } from './style.js';
import { VoiceNotePlayer } from './VoiceNotePlayer.js';

/** Photos shown in a bubble's grid before the rest are summed up as "+3". */
const GRID_LIMIT = 4;

export interface MessageAttachmentsProps {
    attachments: ChatAttachment[];
    senderName: string;
    isOwn: boolean;
    onOpenPhoto: (photos: ChatAttachment[], index: number) => void;
    /** A photo finished loading and the list may need to stay pinned to the bottom. */
    onMediaLoad?: () => void;
}

/**
 * What a message carries besides its text: photographs as a grid that opens the lightbox, files as rows
 * that download (never rendered inline, which is also how the server serves them), voice notes as players.
 */
export function MessageAttachments({
    attachments,
    senderName,
    isOwn,
    onOpenPhoto,
    onMediaLoad,
}: Readonly<MessageAttachmentsProps>): React.JSX.Element {
    const t = useChatText();
    const { locale } = useChatContext();
    const photos = attachments.filter((attachment) => attachment.kind === ChatAttachmentKind.PHOTO);
    const files = attachments.filter((attachment) => attachment.kind === ChatAttachmentKind.FILE);
    const voices = attachments.filter((attachment) => attachment.kind === ChatAttachmentKind.VOICE);
    const shown = photos.slice(0, GRID_LIMIT);
    const hidden = photos.length - shown.length;

    return (
        <div className="flex flex-col gap-1.5">
            {photos.length === 1 && (
                <button
                    type="button"
                    onClick={() => {
                        onOpenPhoto(photos, 0);
                    }}
                    aria-label={t('chat.message.open-photo')}
                    className={cn('block overflow-hidden rounded-[10px] bg-chat-raised', FOCUS_RING)}
                    style={{
                        aspectRatio:
                            photos[0].width !== null && photos[0].height !== null
                                ? `${photos[0].width} / ${photos[0].height}`
                                : '4 / 3',
                    }}
                >
                    <img
                        src={photos[0].thumbnailUrl ?? photos[0].url}
                        alt={t('chat.message.photo', { name: senderName })}
                        loading="lazy"
                        decoding="async"
                        onLoad={onMediaLoad}
                        className="block h-full max-h-80 w-full max-w-80 object-cover"
                    />
                </button>
            )}
            {photos.length > 1 && (
                <div className="grid w-64 grid-cols-2 gap-1 sm:w-72">
                    {shown.map((photo, index) => (
                        <button
                            key={photo.id}
                            type="button"
                            onClick={() => {
                                onOpenPhoto(photos, index);
                            }}
                            aria-label={t('chat.message.open-photo')}
                            className={cn(
                                'relative aspect-square overflow-hidden rounded-[10px] bg-chat-raised',
                                FOCUS_RING,
                            )}
                        >
                            <img
                                src={photo.thumbnailUrl ?? photo.url}
                                alt={t('chat.message.photo', { name: senderName })}
                                loading="lazy"
                                decoding="async"
                                onLoad={onMediaLoad}
                                className="h-full w-full object-cover"
                            />
                            {index === shown.length - 1 && hidden > 0 && (
                                <span className="absolute inset-0 flex items-center justify-center bg-chat-ink/55 font-chat-display text-h2 font-semibold text-white">
                                    +{hidden}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
            {files.map((file) => (
                <a
                    key={file.id}
                    href={file.url}
                    download={file.fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('chat.message.download', { name: file.fileName })}
                    className={cn(
                        'flex min-w-56 items-center gap-3 rounded-[10px] border px-3 py-2 transition-colors duration-fast',
                        isOwn
                            ? 'border-chat-accent-line bg-chat-surface/70 hover:bg-chat-surface'
                            : 'border-chat-line bg-chat-canvas hover:bg-chat-raised',
                        FOCUS_RING,
                    )}
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-chat-control bg-chat-accent-soft text-chat-accent">
                        <FileIcon />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-label font-medium text-chat-ink">{file.fileName}</span>
                        <span className="text-caption text-chat-muted tabular-nums">
                            {formatByteSize(file.sizeBytes, locale)}
                        </span>
                    </span>
                    <DownloadIcon className="h-4.5 w-4.5 text-chat-muted" />
                </a>
            ))}
            {voices.map((voice) => (
                <VoiceNotePlayer key={voice.id} attachment={voice} isOwn={isOwn} />
            ))}
        </div>
    );
}
