import type { Nullable } from '@iveri/contracts';
import type { ChatReactionSummary } from '@iveri/contracts/chat';

import { useChatContext, useChatText } from '../provider/index.js';

import { cn, FOCUS_RING } from './style.js';

export interface ReactionBarProps {
    reactions: ChatReactionSummary[];
    isOwn: boolean;
    disabled?: boolean;
    onReact: (emoji: Nullable<string>) => void;
}

/**
 * The reactions under a bubble, tucked against its lower edge. Each chip is a toggle: pressing mine takes
 * it away, pressing another moves mine to it, since a person has one reaction per message. `aria-pressed`
 * says which is mine, as well as the tint.
 */
export function ReactionBar({
    reactions,
    isOwn,
    disabled = false,
    onReact,
}: Readonly<ReactionBarProps>): React.JSX.Element | null {
    const t = useChatText();
    const { locale } = useChatContext();
    if (reactions.length === 0) return null;

    const format = new Intl.NumberFormat(locale);

    return (
        <div
            className={cn('relative z-[1] -mt-1.5 flex flex-wrap gap-1 px-2', isOwn ? 'justify-end' : 'justify-start')}
        >
            {reactions.map((reaction) => (
                <button
                    key={reaction.emoji}
                    type="button"
                    disabled={disabled}
                    aria-pressed={reaction.isMine}
                    aria-label={t('chat.reaction.count', { count: reaction.count, emoji: reaction.emoji })}
                    onClick={() => {
                        onReact(reaction.isMine ? null : reaction.emoji);
                    }}
                    className={cn(
                        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-caption shadow-sm transition-colors duration-fast',
                        reaction.isMine
                            ? 'border-accent-line bg-accent-soft font-semibold text-accent'
                            : 'border-line bg-surface text-ink-soft hover:border-line-strong',
                        'disabled:cursor-default',
                        FOCUS_RING,
                    )}
                >
                    <span aria-hidden="true" className="text-[0.9rem] leading-none">
                        {reaction.emoji}
                    </span>
                    {reaction.count > 1 && <span className="tabular-nums">{format.format(reaction.count)}</span>}
                </button>
            ))}
        </div>
    );
}
