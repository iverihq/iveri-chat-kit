import { useChatText } from '../provider/index.js';
import type { ChatReadState } from '../util/index.js';

import { cn } from './style.js';

/**
 * How far one of my messages has got, as a small circle that fills as it travels: dashed while sending,
 * an outline with a check once `chat-api` has it, filled once it has been read. Drawn for this kit.
 * The words are always there too, for a screen reader and as a tooltip, because a shape is not a label.
 */
export function ReadMark({ state }: Readonly<{ state: ChatReadState }>): React.JSX.Element {
    const t = useChatText();
    const label =
        state.state === 'sending'
            ? t('chat.message.sending')
            : state.state === 'failed'
              ? t('chat.message.failed')
              : state.state === 'sent'
                ? t('chat.message.sent')
                : state.state === 'read'
                  ? t('chat.message.read')
                  : t('chat.message.read-by', { count: state.count });

    const isRead = state.state === 'read' || state.state === 'read-by';

    return (
        <span
            title={label}
            className={cn(
                'inline-flex items-center gap-0.5',
                state.state === 'failed' ? 'text-critical' : isRead ? 'text-chat-accent' : 'text-chat-faint',
            )}
        >
            <svg viewBox="0 0 14 14" aria-hidden="true" focusable="false" className="h-3.5 w-3.5">
                {state.state === 'sending' && (
                    <circle
                        cx="7"
                        cy="7"
                        r="5.25"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="2.2 2.2"
                    />
                )}
                {state.state === 'sent' && (
                    <>
                        <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        <path
                            d="m4.6 7.2 1.7 1.7 3.2-3.4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </>
                )}
                {isRead && (
                    <>
                        <circle cx="7" cy="7" r="6" fill="currentColor" />
                        <path
                            d="m4.4 7.2 1.8 1.8 3.4-3.6"
                            fill="none"
                            stroke="var(--color-surface)"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </>
                )}
                {state.state === 'failed' && (
                    <>
                        <circle cx="7" cy="7" r="6" fill="currentColor" />
                        <path d="M7 3.9v3.6" stroke="var(--color-surface)" strokeWidth="1.6" strokeLinecap="round" />
                        <circle cx="7" cy="9.9" r="0.85" fill="var(--color-surface)" />
                    </>
                )}
            </svg>
            {state.state === 'read-by' && <span className="text-2xs font-semibold tabular-nums">{state.count}</span>}
            <span className="sr-only">{label}</span>
        </span>
    );
}
