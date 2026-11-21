import type { UUID } from '@iveri/contracts';
import { ChatCallDirection, ChatCallKind, type ChatCallHistoryEntry } from '@iveri/contracts/chat';
import { useState } from 'react';

import { useChatCallController, useChatContext, useChatText, useNow } from '../provider/index.js';
import { useCallHistory } from '../query/index.js';
import {
    CALL_HISTORY_KEYS,
    callHistoryOutcome,
    describeError,
    formatDayLabel,
    formatDuration,
    formatMessageTime,
} from '../util/index.js';

import { ChatAvatar } from './ChatAvatar.js';
import { ChatThemeScope } from './ChatThemeScope.js';
import { PhoneIcon, VideoIcon } from './icons.js';
import { cn, FOCUS_RING, ICON_BUTTON, QUIET_BUTTON } from './style.js';

export interface ChatCallHistoryProps {
    /** Opens the conversation a call was in. */
    onSelectConversation?: (conversationId: UUID) => void;
    className?: string;
}

function CallRow({
    entry,
    onSelectConversation,
}: Readonly<{
    entry: ChatCallHistoryEntry;
    onSelectConversation?: (conversationId: UUID) => void;
}>): React.JSX.Element {
    const t = useChatText();
    const { locale, timeZone, translate } = useChatContext();
    const now = useNow();
    const controller = useChatCallController();
    const outcome = callHistoryOutcome(entry);
    const isMissed = outcome === 'missed';
    const when = `${formatDayLabel(entry.createdAt, translate, { locale, timeZone, now })} · ${formatMessageTime(entry.createdAt, { locale, timeZone })}`;
    const line = t(CALL_HISTORY_KEYS[outcome], { kind: entry.kind });
    const duration = entry.durationSeconds === null ? null : formatDuration(entry.durationSeconds * 1000);
    const arrow = entry.direction === ChatCallDirection.OUTGOING ? '↗' : '↙';

    return (
        <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <button
                type="button"
                onClick={() => onSelectConversation?.(entry.conversationId)}
                disabled={onSelectConversation === undefined}
                aria-label={t('chat.calls.open-chat', { name: entry.title })}
                className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-chat-control text-start', FOCUS_RING)}
            >
                <ChatAvatar name={entry.title} image={entry.avatar} />
                <span className="flex min-w-0 flex-col">
                    <span
                        className={cn(
                            'text-label font-semibold break-words',
                            isMissed ? 'text-critical' : 'text-chat-ink',
                        )}
                    >
                        {entry.title}
                    </span>
                    <span className={cn('text-small', isMissed ? 'text-critical' : 'text-chat-muted')}>
                        <span aria-hidden="true">{arrow} </span>
                        {line}
                        {duration !== null && ` · ${duration}`}
                    </span>
                    <span className="text-caption text-chat-faint">{when}</span>
                </span>
            </button>
            {controller !== null && (
                <button
                    type="button"
                    aria-label={t(
                        entry.kind === ChatCallKind.VIDEO ? 'chat.call.start-video' : 'chat.call.start-voice',
                    )}
                    onClick={() => {
                        controller.startCall(entry.conversationId, entry.kind);
                    }}
                    className={ICON_BUTTON}
                >
                    {entry.kind === ChatCallKind.VIDEO ? <VideoIcon /> : <PhoneIcon />}
                </button>
            )}
        </li>
    );
}

/**
 * My calls in every conversation, newest first, with a Missed folder. Each row says from my side what happened
 * (missed in the critical colour and in words, never colour alone), how long it lasted and when; pressing it opens the
 * conversation, and inside a call layer a button calls back the same way.
 */
export function ChatCallHistory({
    onSelectConversation,
    className,
}: Readonly<ChatCallHistoryProps>): React.JSX.Element {
    const t = useChatText();
    const { translate } = useChatContext();
    const [missedOnly, setMissedOnly] = useState(false);
    const history = useCallHistory({ missedOnly });

    return (
        <ChatThemeScope>
            <section className={cn('flex h-full min-h-0 flex-col bg-chat-surface', className)}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-chat-line px-4 py-3">
                    <h2 className="font-chat-display text-h3 font-bold text-chat-ink">{t('chat.calls.title')}</h2>
                    <div role="tablist" className="flex gap-0.5 rounded-chat-control bg-chat-sunken p-0.5">
                        {[false, true].map((missed) => (
                            <button
                                key={String(missed)}
                                type="button"
                                role="tab"
                                aria-selected={missedOnly === missed}
                                onClick={() => {
                                    setMissedOnly(missed);
                                }}
                                className={cn(
                                    'rounded-[calc(var(--radius-chat-control)-2px)] px-3 py-1.5 text-small font-medium',
                                    missedOnly === missed
                                        ? 'bg-chat-surface text-chat-ink shadow-sm'
                                        : 'text-chat-muted hover:text-chat-ink',
                                    FOCUS_RING,
                                )}
                            >
                                {t(missed ? 'chat.calls.missed' : 'chat.calls.all')}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {history.isLoading ? (
                        <p className="p-6 text-center text-small text-chat-muted">{t('chat.common.loading')}</p>
                    ) : history.isError ? (
                        <div className="flex flex-col items-center gap-3 p-6 text-center">
                            <p role="alert" className="text-small text-chat-ink-soft">
                                {history.error === null
                                    ? t('chat.calls.error')
                                    : describeError(history.error, translate)}
                            </p>
                            <button type="button" className={QUIET_BUTTON} onClick={history.refetch}>
                                {t('chat.common.retry')}
                            </button>
                        </div>
                    ) : history.calls.length === 0 ? (
                        <p className="p-6 text-center text-small text-chat-muted">
                            {t(missedOnly ? 'chat.calls.empty-missed' : 'chat.calls.empty')}
                        </p>
                    ) : (
                        <ul className="divide-y divide-chat-line">
                            {history.calls.map((entry) => (
                                <CallRow key={entry.id} entry={entry} onSelectConversation={onSelectConversation} />
                            ))}
                        </ul>
                    )}
                    {history.hasMore && (
                        <div className="p-3 text-center">
                            <button
                                type="button"
                                className={QUIET_BUTTON}
                                disabled={history.isLoadingMore}
                                onClick={history.loadMore}
                            >
                                {t('chat.common.show-more')}
                            </button>
                        </div>
                    )}
                </div>
            </section>
        </ChatThemeScope>
    );
}
