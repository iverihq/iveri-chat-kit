import type { Nullable, UUID } from '@iveri/contracts';
import { ChatParticipantStatus } from '@iveri/contracts/chat';
import type { ChatAttachment, ChatConversation, ChatMessage } from '@iveri/contracts/chat';
import type { RefObject } from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ChatDeleteScope } from '../client/index.js';
import { useChatContext, useChatText, useNow } from '../provider/index.js';
import type { ChatMessagesState } from '../query/index.js';
import {
    firstUnreadKey,
    formatDayLabel,
    groupMessages,
    readStateOf,
    systemNoticeText,
    type ChatMessageRun,
} from '../util/index.js';

import { ChatAvatar } from './ChatAvatar.js';
import { ArrowDownIcon, ChatBubblesIcon } from './icons.js';
import { MessageBubble, type BubblePosition } from './MessageBubble.js';
import { cn, FOCUS_RING, QUIET_BUTTON } from './style.js';

/** Within this many pixels of the end counts as "at the bottom": new messages keep the view pinned there. */
const BOTTOM_SLACK_PX = 96;

export interface MessageListProps {
    conversation: ChatConversation;
    messages: ChatMessagesState;
    /** My read position when the conversation was opened, frozen so the "new messages" line stays put. */
    openedLastReadSeq: number;
    highlightedSeq: Nullable<number>;
    scrollerRef: RefObject<HTMLDivElement | null>;
    /** Called while the newest message is in view, with its `seq`. */
    onReadUpTo: (seq: number) => void;
    onReply: (message: ChatMessage) => void;
    onEdit: (message: ChatMessage) => void;
    onReport: (message: ChatMessage) => void;
    onReact: (messageId: UUID, emoji: Nullable<string>) => void;
    onDelete: (messageId: UUID, scope: ChatDeleteScope) => Promise<void>;
    onJumpTo: (seq: number) => void;
    onOpenPhoto: (photos: ChatAttachment[], index: number, senderName: string) => void;
    onRetry: (clientMessageId: UUID) => void;
    onDiscard: (clientMessageId: UUID) => void;
}

function positionIn(run: ChatMessageRun, index: number): BubblePosition {
    if (run.items.length === 1) return 'single';
    if (index === 0) return 'first';

    return index === run.items.length - 1 ? 'last' : 'middle';
}

/**
 * The conversation itself: days under their separators, each day as runs by sender, notices centred.
 *
 * A `log` region with polite announcements, which is what a screen reader expects of a chat. Scrolling
 * is handled here and nowhere else: opening lands on the "new messages" line (or the end), loading older
 * pages keeps what was on screen exactly where it was, and an arriving message keeps the view at the end
 * only if the reader was already there (or wrote it), so reading back through a conversation is never
 * interrupted by it moving.
 */
export function MessageList({
    conversation,
    messages,
    openedLastReadSeq,
    highlightedSeq,
    scrollerRef,
    onReadUpTo,
    onReply,
    onEdit,
    onReport,
    onReact,
    onDelete,
    onJumpTo,
    onOpenPhoto,
    onRetry,
    onDiscard,
}: Readonly<MessageListProps>): React.JSX.Element {
    const t = useChatText();
    const { translate, locale, timeZone, currentUserId } = useChatContext();
    const now = useNow();
    const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
    const atBottom = useRef(true);
    const previous = useRef<{ firstKey: string | null; lastKey: string | null; height: number; top: number }>({
        firstKey: null,
        lastKey: null,
        height: 0,
        top: 0,
    });

    const { items } = messages;
    const dividerKey = useMemo(() => firstUnreadKey(items, openedLastReadSeq), [items, openedLastReadSeq]);
    const sections = useMemo(
        () => groupMessages(items, { myUserId: currentUserId ?? null, timeZone, breakBefore: dividerKey }),
        [items, currentUserId, timeZone, dividerKey],
    );
    const activeOthers = conversation.participants.filter(
        (participant) => !participant.isMe && participant.status === ChatParticipantStatus.ACTIVE,
    ).length;
    const showsSenders = conversation.isGroup || activeOthers > 1;
    const newestSeq = messages.window.messages.at(-1)?.seq ?? 0;

    const reportReadIfAtEnd = (): void => {
        if (atBottom.current && typeof document !== 'undefined' && document.visibilityState === 'visible') {
            onReadUpTo(newestSeq);
        }
    };

    const pinToBottom = (): void => {
        const node = scrollerRef.current;
        if (node !== null && atBottom.current) node.scrollTop = node.scrollHeight;
    };

    useLayoutEffect(() => {
        const node = scrollerRef.current;
        if (node === null) return;

        const firstKey = items[0]?.key ?? null;
        const lastKey = items.at(-1)?.key ?? null;
        const before = previous.current;

        if (before.lastKey === null && lastKey !== null) {
            // First paint of a conversation: the "new messages" line if there is one, else the end.
            const divider = node.querySelector<HTMLElement>('[data-new-messages]');
            if (divider !== null) {
                node.scrollTop = Math.max(0, divider.offsetTop - node.clientHeight / 3);
                atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < BOTTOM_SLACK_PX;
            } else {
                node.scrollTop = node.scrollHeight;
                atBottom.current = true;
            }
        } else if (firstKey !== before.firstKey && lastKey === before.lastKey) {
            // Older messages arrived above: keep what the reader was looking at exactly where it was.
            node.scrollTop = before.top + (node.scrollHeight - before.height);
        } else if (lastKey !== before.lastKey && lastKey !== null) {
            const newest = items.at(-1);
            const isMine = newest?.type === 'pending' || (newest?.type === 'message' && newest.message.isOwn);
            if (atBottom.current || isMine) {
                node.scrollTop = node.scrollHeight;
                atBottom.current = true;
            }
        }

        previous.current = { firstKey, lastKey, height: node.scrollHeight, top: node.scrollTop };
    }, [items, scrollerRef]);

    useLayoutEffect(() => {
        reportReadIfAtEnd();
    });

    const onScroll = (): void => {
        const node = scrollerRef.current;
        if (node === null) return;
        atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < BOTTOM_SLACK_PX;
        previous.current = { ...previous.current, height: node.scrollHeight, top: node.scrollTop };
        setIsAwayFromBottom(!atBottom.current);
        reportReadIfAtEnd();
        if (node.scrollTop < 160 && messages.hasOlder && !messages.isLoadingOlder) void messages.loadOlder();
    };

    const renderRun = (run: ChatMessageRun): React.JSX.Element => {
        const first = run.items[0];

        if (run.isSystem && first.type === 'message') {
            return (
                <div key={run.key} className="flex justify-center px-6 py-1" data-seq={first.message.seq}>
                    <p className="max-w-md rounded-control bg-sunken px-3 py-1.5 text-center text-small text-ink-soft">
                        {systemNoticeText(first.message.systemKey ?? '', first.message.systemVariables, translate)}
                    </p>
                </div>
            );
        }

        const sender = first.type === 'message' ? first.message.sender : null;
        const senderName = sender?.displayName ?? t('chat.common.you');
        const showSender = showsSenders && !run.isOwn && sender !== null;

        return (
            <div
                key={run.key}
                className={cn('flex items-end gap-2', run.isOwn ? 'justify-end ps-10' : 'justify-start pe-10')}
            >
                {showsSenders && !run.isOwn && (
                    <div className="w-8 shrink-0 pb-0.5">
                        <ChatAvatar name={senderName} image={sender?.avatar ?? null} size="sm" />
                    </div>
                )}
                <div
                    className={cn(
                        'flex max-w-[min(36rem,100%)] min-w-0 flex-col gap-1',
                        run.isOwn ? 'items-end' : 'items-start',
                    )}
                >
                    {showSender && <span className="px-1 text-caption font-semibold text-ink-soft">{senderName}</span>}
                    {run.items.map((item, index) => (
                        <MessageBubble
                            key={item.key}
                            item={item}
                            conversation={conversation}
                            position={positionIn(run, index)}
                            readState={readStateOf(item, conversation)}
                            isHighlighted={item.type === 'message' && item.message.seq === highlightedSeq}
                            now={now}
                            onReply={onReply}
                            onEdit={onEdit}
                            onReport={onReport}
                            onReact={onReact}
                            onDelete={onDelete}
                            onJumpTo={onJumpTo}
                            onOpenPhoto={(photos, photoIndex) => {
                                onOpenPhoto(photos, photoIndex, senderName);
                            }}
                            onRetry={onRetry}
                            onDiscard={onDiscard}
                            onMediaLoad={pinToBottom}
                        />
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div
                ref={scrollerRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label={t('chat.thread.messages')}
                tabIndex={0}
                onScroll={onScroll}
                className={cn('min-h-0 flex-1 overflow-y-auto px-3 py-3 [overflow-anchor:none] sm:px-5', FOCUS_RING)}
            >
                {messages.hasOlder && (
                    <div className="flex justify-center pb-2">
                        <button
                            type="button"
                            className={cn(QUIET_BUTTON, 'min-h-8 px-3 text-caption')}
                            disabled={messages.isLoadingOlder}
                            onClick={() => {
                                void messages.loadOlder();
                            }}
                        >
                            {messages.isLoadingOlder ? t('chat.common.loading') : t('chat.thread.load-older')}
                        </button>
                    </div>
                )}

                {items.length === 0 && !messages.isLoading && (
                    <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
                        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                            <ChatBubblesIcon />
                        </span>
                        <p className="font-display text-h3 font-semibold text-ink">{t('chat.thread.empty')}</p>
                        <p className="mt-1 text-small text-muted">{t('chat.thread.empty-hint')}</p>
                    </div>
                )}

                {sections.map((section) => {
                    const dayLabel = formatDayLabel(section.firstSentAt, translate, { locale, timeZone, now });

                    return (
                        <section key={section.day} aria-label={dayLabel} className="pb-2">
                            <div className="flex justify-center py-2">
                                <span className="rounded-full border border-line bg-surface px-3 py-0.5 text-caption font-medium text-muted shadow-sm">
                                    {dayLabel}
                                </span>
                            </div>
                            <div className="flex flex-col gap-3">
                                {section.runs.map((run) => (
                                    <div key={run.key} className="flex flex-col gap-3">
                                        {run.key === dividerKey && (
                                            <div
                                                data-new-messages=""
                                                className="flex items-center gap-3 px-2 text-caption font-semibold text-accent"
                                            >
                                                <span className="h-px flex-1 bg-accent-line" />
                                                {t('chat.thread.new-messages')}
                                                <span className="h-px flex-1 bg-accent-line" />
                                            </div>
                                        )}
                                        {renderRun(run)}
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>

            {isAwayFromBottom && (
                <button
                    type="button"
                    aria-label={t('chat.thread.jump-latest')}
                    onClick={() => {
                        const node = scrollerRef.current;
                        if (node !== null) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
                    }}
                    className={cn(
                        'absolute end-4 bottom-3 flex h-10 w-10 animate-fade-in items-center justify-center rounded-full border border-line bg-surface text-ink-soft shadow-md hover:bg-raised',
                        FOCUS_RING,
                    )}
                >
                    <ArrowDownIcon />
                </button>
            )}
        </div>
    );
}
