import { useState } from 'react';

import { useChatText } from '../provider/index.js';
import type { ChatReadState } from '../util/index.js';

import { cn, FOCUS_RING } from './style.js';

/**
 * How far one of my messages has got, as a small circle that fills as it travels: dashed while sending,
 * an outline with a check once `chat-api` has it, filled once it has been read. Drawn for this kit.
 * The words are always there too, for a screen reader and as a tooltip, because a shape is not a label.
 */
export function ReadMark({ state }: Readonly<{ state: ChatReadState }>): React.JSX.Element {
    const mark = <Mark state={state} />;

    return state.state === 'read-by' ? <ReadersButton state={state}>{mark}</ReadersButton> : mark;
}

/**
 * In a group, the mark opens who has read the message and who has not yet, by name. A count alone answers "how
 * many", and the question in a group is nearly always "who".
 */
function ReadersButton({
    state,
    children,
}: Readonly<{ state: Extract<ChatReadState, { state: 'read-by' }>; children: React.ReactNode }>): React.JSX.Element {
    const t = useChatText();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <span className="relative inline-flex">
            <button
                type="button"
                aria-expanded={isOpen}
                aria-label={t('chat.message.read-by-show')}
                onClick={() => {
                    setIsOpen((open) => !open);
                }}
                onBlur={() => {
                    setIsOpen(false);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') setIsOpen(false);
                }}
                className={cn('rounded-sm', FOCUS_RING)}
            >
                {children}
            </button>
            {isOpen && (
                <span
                    role="status"
                    className="absolute end-0 bottom-full z-20 mb-1 flex w-56 flex-col gap-1.5 rounded-chat-panel border border-chat-line bg-chat-surface p-3 text-start shadow-md"
                >
                    <span className="text-caption font-semibold text-chat-ink">
                        {t('chat.message.read-by-heading')}
                    </span>
                    <span className="text-small break-words text-chat-ink-soft">{state.readers.join(', ')}</span>
                    {state.waiting.length > 0 && (
                        <>
                            <span className="text-caption font-semibold text-chat-muted">
                                {t('chat.message.not-read-heading')}
                            </span>
                            <span className="text-small break-words text-chat-muted">{state.waiting.join(', ')}</span>
                        </>
                    )}
                </span>
            )}
        </span>
    );
}

function Mark({ state }: Readonly<{ state: ChatReadState }>): React.JSX.Element {
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
