import type { Nullable, UUID } from '@iveri/contracts';
import { ChatAttachmentKind } from '@iveri/contracts/chat';
import type { ChatAttachment, ChatConversation, ChatMessage, ChatReplyPreview } from '@iveri/contracts/chat';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';

import type { ChatDeleteScope } from '../client/index.js';
import { useChatContext, useChatText } from '../provider/index.js';
import {
    describeError,
    formatMessageTime,
    linkify,
    messagePermissions,
    replyExcerpt,
    type ChatReadState,
    type ChatThreadItem,
} from '../util/index.js';

import { BlockIcon } from './icons.js';
import { MessageActions } from './MessageActions.js';
import { MessageAttachments } from './MessageAttachments.js';
import { clippingBox, roomBeside } from './popover-fit.js';
import { ReactionBar } from './ReactionBar.js';
import { ReadMark } from './ReadMark.js';
import { cn, FOCUS_RING } from './style.js';

/** Where a bubble sits in its run, which decides which corners tuck in toward the sender's side. */
export type BubblePosition = 'single' | 'first' | 'middle' | 'last';

const OWN_CORNERS: Record<BubblePosition, string> = {
    single: '',
    first: 'rounded-ee-[5px]',
    middle: 'rounded-e-[5px]',
    last: 'rounded-se-[5px]',
};

const OTHER_CORNERS: Record<BubblePosition, string> = {
    single: '',
    first: 'rounded-es-[5px]',
    middle: 'rounded-s-[5px]',
    last: 'rounded-ss-[5px]',
};

const LONG_PRESS_MS = 450;

/** Where the actions toolbar sits: beside the bubble when there is room, else above it, else below it. */
type ToolbarSide = 'beside' | 'above' | 'below';

/** The toolbar's width plus the padding that bridges it to the bubble, before it has been measured. */
const TOOLBAR_FALLBACK_WIDTH_PX = 120;

export interface MessageBubbleProps {
    item: ChatThreadItem;
    conversation: ChatConversation;
    position: BubblePosition;
    readState: ChatReadState | null;
    isHighlighted: boolean;
    now: Date;
    onReply: (message: ChatMessage) => void;
    onEdit: (message: ChatMessage) => void;
    onReport: (message: ChatMessage) => void;
    onReact: (messageId: UUID, emoji: Nullable<string>) => void;
    onDelete: (messageId: UUID, scope: ChatDeleteScope) => Promise<void>;
    onJumpTo: (seq: number) => void;
    onOpenPhoto: (photos: ChatAttachment[], index: number) => void;
    onRetry: (clientMessageId: UUID) => void;
    onDiscard: (clientMessageId: UUID) => void;
    onMediaLoad?: () => void;
}

function MessageText({ text }: Readonly<{ text: string }>): React.JSX.Element {
    return (
        <p className="text-body break-words whitespace-pre-wrap text-chat-ink [overflow-wrap:anywhere]">
            {linkify(text).map((part, index) =>
                part.type === 'link' ? (
                    <a
                        key={`link-${index}`}
                        href={part.href}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className={cn('text-chat-link underline underline-offset-2 hover:text-chat-accent', FOCUS_RING)}
                    >
                        {part.text}
                    </a>
                ) : (
                    <span key={`text-${index}`}>{part.text}</span>
                ),
            )}
        </p>
    );
}

function ReplyQuote({
    reply,
    isOwn,
    onJumpTo,
}: Readonly<{ reply: ChatReplyPreview; isOwn: boolean; onJumpTo: (seq: number) => void }>): React.JSX.Element {
    const t = useChatText();
    const { translate } = useChatContext();
    const name = reply.senderName ?? '';

    return (
        <button
            type="button"
            onClick={() => {
                onJumpTo(reply.seq);
            }}
            aria-label={t('chat.message.reply-quote', { name })}
            className={cn(
                'mb-1.5 flex w-full min-w-40 flex-col rounded-chat-control border-s-[3px] border-chat-accent px-2.5 py-1.5 text-start transition-colors duration-fast',
                isOwn ? 'bg-chat-surface/70 hover:bg-chat-surface' : 'bg-chat-canvas hover:bg-chat-raised',
                FOCUS_RING,
            )}
        >
            <span className="truncate text-caption font-semibold text-chat-accent">{name}</span>
            <span
                className={cn(
                    'line-clamp-2 text-small',
                    reply.isDeleted ? 'text-chat-faint italic' : 'text-chat-muted',
                )}
            >
                {replyExcerpt(reply, translate)}
            </span>
        </button>
    );
}

/**
 * One message in a thread, confirmed or still on its way.
 *
 * Mine sit on the end side in the accent's soft wash; everybody else's on the start side, white with a
 * hairline. Consecutive bubbles from one sender tuck their sender-side corners in, so a run reads as one
 * turn of speech. Actions appear on hover or focus, and from a right click or a long press, which is what
 * a phone offers instead of hovering.
 */
export function MessageBubble({
    item,
    conversation,
    position,
    readState,
    isHighlighted,
    now,
    onReply,
    onEdit,
    onReport,
    onReact,
    onDelete,
    onJumpTo,
    onOpenPhoto,
    onRetry,
    onDiscard,
    onMediaLoad,
}: Readonly<MessageBubbleProps>): React.JSX.Element {
    const t = useChatText();
    const { translate, locale, timeZone } = useChatContext();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [toolbarSide, setToolbarSide] = useState<ToolbarSide>('beside');
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bubble = useRef<HTMLDivElement>(null);
    const toolbar = useRef<HTMLDivElement>(null);

    const message = item.type === 'message' ? item.message : null;
    const pending = item.type === 'pending' ? item.pending : null;
    const isOwn = message?.isOwn ?? true;
    const body = message?.body ?? pending?.body ?? null;
    const attachments = message?.attachments ?? pending?.attachments ?? [];
    const replyTo = message?.replyTo ?? pending?.replyTo ?? null;
    const sentAt = message?.sentAt ?? pending?.createdAt ?? now.toISOString();
    const senderName = message?.sender?.displayName ?? t('chat.common.you');
    const isDeleted = message?.isDeleted ?? false;
    const isPhotoOnly =
        !isDeleted &&
        (body === null || body.length === 0) &&
        replyTo === null &&
        attachments.length > 0 &&
        attachments.every((attachment) => attachment.kind === ChatAttachmentKind.PHOTO);
    const permissions = message === null ? null : messagePermissions(message, conversation, now);

    // Measured whenever the toolbar is about to show: beside the bubble (to the left of mine, to the right of
    // everybody else's) where the thread has room for it, otherwise above the bubble, or below it when the bubble is
    // at the thread's top edge. Never over the bubble's own text.
    const placeToolbar = (): void => {
        const node = bubble.current;
        if (node === null) return;
        const width = toolbar.current?.offsetWidth ?? TOOLBAR_FALLBACK_WIDTH_PX;
        const height = toolbar.current?.offsetHeight ?? 0;
        let next: ToolbarSide = 'beside';
        if (roomBeside(node, isOwn ? 'start' : 'end') < width) {
            next = node.getBoundingClientRect().top - clippingBox(node).top >= height ? 'above' : 'below';
        }
        if (next !== toolbarSide) setToolbarSide(next);
    };

    const openMenu = (): void => {
        placeToolbar();
        setIsMenuOpen(true);
    };

    const cancelPress = (): void => {
        if (pressTimer.current !== null) clearTimeout(pressTimer.current);
        pressTimer.current = null;
    };

    const onPointerDown = (event: ReactPointerEvent): void => {
        if (event.pointerType !== 'touch' || permissions === null) return;
        cancelPress();
        pressTimer.current = setTimeout(openMenu, LONG_PRESS_MS);
    };

    const meta = (
        <span
            className={cn(
                'flex items-center justify-end gap-1.5 text-2xs tabular-nums',
                isPhotoOnly
                    ? 'absolute end-2 bottom-2 rounded-full bg-chat-ink/55 px-2 py-0.5 text-white'
                    : 'mt-0.5 text-chat-faint',
            )}
        >
            {message?.editedAt !== null && message?.editedAt !== undefined && !isDeleted && (
                <span>{t('chat.message.edited')}</span>
            )}
            <time dateTime={sentAt}>{formatMessageTime(sentAt, { locale, timeZone })}</time>
            {readState !== null && <ReadMark state={readState} />}
        </span>
    );

    return (
        <div
            data-seq={message?.seq}
            data-message-id={message?.id}
            className={cn(
                'group/message relative flex w-fit max-w-full flex-col',
                isOwn ? 'items-end self-end' : 'items-start',
            )}
            onContextMenu={(event) => {
                if (permissions === null) return;
                event.preventDefault();
                openMenu();
            }}
            onPointerEnter={placeToolbar}
            onFocus={placeToolbar}
            onPointerDown={onPointerDown}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerMove={(event) => {
                if (event.pointerType === 'touch' && (Math.abs(event.movementX) > 4 || Math.abs(event.movementY) > 4)) {
                    cancelPress();
                }
            }}
        >
            <div
                ref={bubble}
                className={cn(
                    'relative max-w-full rounded-chat-card border transition-shadow duration-normal',
                    isPhotoOnly ? 'p-1' : 'px-3.5 pt-2 pb-1.5',
                    isDeleted
                        ? 'border-dashed border-chat-line-strong bg-transparent'
                        : isOwn
                          ? 'border-chat-bubble-own-line bg-chat-bubble-own'
                          : 'border-chat-bubble-other-line bg-chat-bubble-other shadow-sm',
                    pending?.status === 'sending' && 'opacity-75',
                    pending?.status === 'failed' && 'border-critical/50',
                    (isOwn ? OWN_CORNERS : OTHER_CORNERS)[position],
                    isHighlighted && 'ring-2 ring-chat-accent ring-offset-2 ring-offset-chat-canvas',
                )}
            >
                {isDeleted ? (
                    <p className="flex items-center gap-1.5 text-small text-chat-muted italic">
                        <BlockIcon className="h-4 w-4" />
                        {t('chat.message.deleted')}
                    </p>
                ) : (
                    <>
                        {replyTo !== null && <ReplyQuote reply={replyTo} isOwn={isOwn} onJumpTo={onJumpTo} />}
                        {attachments.length > 0 && (
                            <div className={cn(body !== null && body.length > 0 && 'mb-1.5')}>
                                <MessageAttachments
                                    attachments={attachments}
                                    senderName={senderName}
                                    isOwn={isOwn}
                                    onOpenPhoto={onOpenPhoto}
                                    onMediaLoad={onMediaLoad}
                                />
                            </div>
                        )}
                        {body !== null && body.length > 0 && <MessageText text={body} />}
                    </>
                )}
                {meta}
                {message !== null && permissions !== null && !isDeleted && (
                    // The padding, not a margin, bridges the toolbar to the bubble, so a pointer travelling from one
                    // to the other never leaves the message and the toolbar stays.
                    <div
                        ref={toolbar}
                        className={cn(
                            // Raised while in use: the toolbar is its own stacking context (it is translated), so an
                            // open menu or picker would otherwise sit under the next message's toolbar.
                            'absolute z-20 transition-opacity duration-fast focus-within:z-30 [@media(hover:hover)]:group-hover/message:z-30',
                            toolbarSide === 'beside' &&
                                cn('top-1/2 -translate-y-1/2', isOwn ? 'end-full pe-2' : 'start-full ps-2'),
                            toolbarSide === 'above' && cn('bottom-full pb-1', isOwn ? 'end-0' : 'start-0'),
                            toolbarSide === 'below' && cn('top-full pt-1', isOwn ? 'end-0' : 'start-0'),
                            isMenuOpen
                                ? 'z-30 opacity-100'
                                : 'pointer-events-none opacity-0 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100 [@media(hover:hover)]:group-hover/message:pointer-events-auto [@media(hover:hover)]:group-hover/message:opacity-100',
                        )}
                    >
                        <MessageActions
                            message={message}
                            permissions={permissions}
                            isMenuOpen={isMenuOpen}
                            onMenuOpenChange={setIsMenuOpen}
                            onReply={() => {
                                onReply(message);
                            }}
                            onReact={(emoji) => {
                                onReact(message.id, emoji);
                            }}
                            onEdit={() => {
                                onEdit(message);
                            }}
                            onDelete={(scope) => onDelete(message.id, scope)}
                            onReport={() => {
                                onReport(message);
                            }}
                        />
                    </div>
                )}
            </div>

            {message !== null && (
                <ReactionBar
                    reactions={message.reactions}
                    isOwn={isOwn}
                    disabled={permissions?.canReact !== true}
                    onReact={(emoji) => {
                        onReact(message.id, emoji);
                    }}
                />
            )}

            {pending?.status === 'failed' && (
                <div role="alert" className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-caption">
                    <span className="text-critical">
                        {t('chat.message.failed')}
                        {pending.error !== null && ` · ${describeError(pending.error, translate)}`}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            onRetry(pending.clientMessageId);
                        }}
                        className={cn('font-semibold text-chat-link hover:underline', FOCUS_RING)}
                    >
                        {t('chat.common.retry')}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onDiscard(pending.clientMessageId);
                        }}
                        className={cn('font-medium text-chat-muted hover:text-chat-ink', FOCUS_RING)}
                    >
                        {t('chat.message.discard')}
                    </button>
                </div>
            )}
        </div>
    );
}
