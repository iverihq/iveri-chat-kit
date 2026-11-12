import type { ChatConversationSummary } from '@iveri/contracts/chat';

import { useChatContext, useChatText } from '../provider/index.js';
import { isMuted } from '../query/index.js';
import { conversationHeading, formatInboxTime, formatUnreadBadge, lastMessageExcerpt } from '../util/index.js';

import { ChatAvatar } from './ChatAvatar.js';
import { ConversationMenu } from './ConversationMenu.js';
import { MuteIcon, PinIcon } from './icons.js';
import { cn, FOCUS_RING } from './style.js';

export interface InboxRowProps {
    conversation: ChatConversationSummary;
    isSelected: boolean;
    now: Date;
    onSelect: () => void;
    onGone?: () => void;
}

/**
 * One conversation in the inbox: who, the last thing said, when, and how much is unread.
 *
 * The row is a button and its menu a sibling, never a button inside a button. Unread rows carry the
 * count in a badge **and** a heavier excerpt, so the difference is not colour alone; a muted
 * conversation's badge goes grey, because it should still say "there is something" without asking for
 * attention the person turned off.
 */
export function InboxRow({
    conversation,
    isSelected,
    now,
    onSelect,
    onGone,
}: Readonly<InboxRowProps>): React.JSX.Element {
    const t = useChatText();
    const { translate, locale, timeZone } = useChatContext();
    const heading = conversationHeading(conversation, translate);
    const isUnread = conversation.unreadCount > 0;
    const muted = isMuted(conversation.mutedUntil, now);
    const badge = formatUnreadBadge(conversation.unreadCount, locale);
    const excerpt = lastMessageExcerpt(conversation.lastMessage, translate, {
        // A sender's name only helps where more than two people talk: in a ride's chat it is the title already.
        isGroup: conversation.isGroup || conversation.memberCount > 2,
    });
    const time =
        conversation.lastMessage === null
            ? ''
            : formatInboxTime(conversation.lastMessage.sentAt, translate, { locale, timeZone, now });

    return (
        <li className="group/row relative flex items-center">
            <button
                type="button"
                onClick={onSelect}
                aria-current={isSelected ? 'true' : undefined}
                className={cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-chat-card px-3 py-2.5 text-start transition-colors duration-fast',
                    isSelected
                        ? 'bg-chat-accent-soft shadow-[inset_3px_0_0_var(--color-accent)]'
                        : 'hover:bg-chat-raised',
                    FOCUS_RING,
                )}
            >
                <ChatAvatar name={heading.title} image={heading.avatar} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-2">
                        <span
                            className={cn(
                                'truncate text-body text-chat-ink',
                                isUnread ? 'font-semibold' : 'font-medium',
                            )}
                        >
                            {heading.title}
                        </span>
                        {heading.label !== null && (
                            <span className="shrink-0 truncate text-caption text-chat-muted">{heading.label}</span>
                        )}
                        <span
                            className={cn(
                                'ms-auto shrink-0 text-caption tabular-nums',
                                isUnread && !muted ? 'font-semibold text-chat-accent' : 'text-chat-faint',
                            )}
                        >
                            {time}
                        </span>
                    </span>
                    {heading.subtitle !== null && (
                        <span className="truncate text-caption text-chat-muted">{heading.subtitle}</span>
                    )}
                    <span className="flex min-w-0 items-center gap-2">
                        {conversation.isRequest && (
                            <span className="shrink-0 rounded-full bg-chat-raised px-2 py-px text-2xs font-semibold text-chat-ink-soft">
                                {t('chat.inbox.request')}
                            </span>
                        )}
                        <span
                            className={cn(
                                'min-w-0 truncate text-small',
                                isUnread ? 'font-medium text-chat-ink-soft' : 'text-chat-muted',
                            )}
                        >
                            {excerpt}
                        </span>
                        <span className="ms-auto flex shrink-0 items-center gap-1.5 text-chat-faint [@media(hover:hover)]:group-focus-within/row:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-0">
                            {muted && (
                                <span title={t('chat.inbox.muted')}>
                                    <MuteIcon className="h-4 w-4" />
                                    <span className="sr-only">{t('chat.inbox.muted')}</span>
                                </span>
                            )}
                            {conversation.isPinned && (
                                <span title={t('chat.inbox.pinned')}>
                                    <PinIcon className="h-4 w-4" />
                                    <span className="sr-only">{t('chat.inbox.pinned')}</span>
                                </span>
                            )}
                            {badge.length > 0 && (
                                <span
                                    className={cn(
                                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold tabular-nums',
                                        muted
                                            ? 'bg-chat-line-strong text-chat-ink-soft'
                                            : 'bg-chat-accent text-chat-accent-ink',
                                    )}
                                >
                                    <span aria-hidden="true">{badge}</span>
                                    <span className="sr-only">
                                        {t('chat.inbox.unread', { count: conversation.unreadCount })}
                                    </span>
                                </span>
                            )}
                        </span>
                    </span>
                </span>
            </button>
            {/* A pointer reveals the menu over the badges on hover or focus; a touch screen has no hover, so there
                it keeps a column of its own beside the row. */}
            <div className="shrink-0 pe-1 [@media(hover:hover)]:absolute [@media(hover:hover)]:end-2 [@media(hover:hover)]:bottom-1.5 [@media(hover:hover)]:pe-0 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100">
                <ConversationMenu
                    conversation={conversation}
                    label={t('chat.inbox.options', { title: heading.title })}
                    onGone={onGone}
                    triggerClassName="h-8 w-8 bg-chat-surface shadow-sm ring-1 ring-chat-line"
                />
            </div>
        </li>
    );
}
