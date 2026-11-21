import type { UUID } from '@iveri/contracts';
import type { ChatPinnedMessage } from '@iveri/contracts/chat';
import { useState } from 'react';

import { useChatContext, useChatText } from '../provider/index.js';
import { replyExcerpt } from '../util/index.js';

import { CloseIcon, PinIcon } from './icons.js';
import { cn, FOCUS_RING, ICON_BUTTON } from './style.js';

export interface PinnedBarProps {
    pinned: readonly ChatPinnedMessage[];
    canUnpin: boolean;
    onJumpTo: (seq: number) => void;
    onUnpin: (messageId: UUID) => void;
}

/**
 * The pinned messages over a thread, one at a time: the latest pinned first, and each press goes to the message shown
 * and moves on to the next, so a conversation with several pins is walked through rather than listed.
 */
export function PinnedBar({ pinned, canUnpin, onJumpTo, onUnpin }: Readonly<PinnedBarProps>): React.JSX.Element | null {
    const t = useChatText();
    const { translate } = useChatContext();
    const [index, setIndex] = useState(0);

    if (pinned.length === 0) return null;

    const shown = pinned[Math.min(index, pinned.length - 1)];
    const excerpt = replyExcerpt({ ...shown, isDeleted: false }, translate);

    return (
        <div className="flex items-center gap-2 border-b border-chat-line bg-chat-surface px-3 py-1.5 sm:px-4">
            <button
                type="button"
                onClick={() => {
                    onJumpTo(shown.seq);
                    setIndex((current) => (current + 1) % pinned.length);
                }}
                className={cn(
                    'flex min-w-0 flex-1 items-center gap-2.5 rounded-chat-control px-1 py-1 text-start hover:bg-chat-canvas',
                    FOCUS_RING,
                )}
            >
                <span className="text-chat-accent">
                    <PinIcon />
                </span>
                <span className="flex min-w-0 flex-col">
                    <span className="text-caption font-semibold text-chat-accent">
                        {pinned.length > 1
                            ? t('chat.pin.bar-many', {
                                  index: Math.min(index, pinned.length - 1) + 1,
                                  count: pinned.length,
                              })
                            : t('chat.pin.bar')}
                    </span>
                    <span className="truncate text-small text-chat-ink-soft">
                        {shown.senderName === null ? excerpt : `${shown.senderName}: ${excerpt}`}
                    </span>
                </span>
            </button>
            {canUnpin && (
                <button
                    type="button"
                    aria-label={t('chat.action.unpin-message')}
                    onClick={() => {
                        onUnpin(shown.id);
                    }}
                    className={ICON_BUTTON}
                >
                    <CloseIcon />
                </button>
            )}
        </div>
    );
}
