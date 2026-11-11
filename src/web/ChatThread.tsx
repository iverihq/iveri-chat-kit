import type { Nullable, UUID } from '@iveri/contracts';
import type { ChatAttachment } from '@iveri/contracts/chat';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useChatContext, useChatRealtime, useChatText } from '../provider/index.js';
import {
    chatQueryKeys,
    useConversation,
    useDeleteMessage,
    useMarkRead,
    useMessages,
    useReaction,
    useSendMessage,
} from '../query/index.js';
import { conversationHeading, describeError, type ChatMessageWindow } from '../util/index.js';

import { ChatComposer, type ComposerMode } from './ChatComposer.js';
import { Lightbox } from './Lightbox.js';
import { MessageList } from './MessageList.js';
import { ReportDialog, type ReportTarget } from './ReportDialog.js';
import { cn, QUIET_BUTTON } from './style.js';
import { ThreadHeader } from './ThreadHeader.js';
import { TypingLine } from './TypingLine.js';

export interface ChatThreadProps {
    conversationId: UUID;
    /** Shows a back button: a phone showing the inbox and the thread one at a time. */
    onBack?: () => void;
    /** Makes the header open the conversation's details, which the app places (a side panel, a route). */
    onOpenDetails?: () => void;
    /** After leaving or deleting for me, so the app moves away from a conversation that is gone. */
    onGone?: () => void;
    /** A message to open at, highlighted: a search hit. Older pages are loaded until it is found. */
    focusSeq?: number;
    /** Off for an embedding that draws its own header, a ride screen. */
    showHeader?: boolean;
    autoFocusComposer?: boolean;
    className?: string;
}

const HIGHLIGHT_MS = 1_800;
const MAX_JUMP_PAGES = 12;

function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
        else setTimeout(resolve, 16);
    });
}

/**
 * One conversation: its header, its messages, who is typing, and the composer.
 *
 * Holds the realtime connection while mounted and falls back to polling without it. Reports reading
 * when the newest message is on screen and the page is visible, never merely because it was loaded.
 */
export function ChatThread({
    conversationId,
    onBack,
    onOpenDetails,
    onGone,
    focusSeq,
    showHeader = true,
    autoFocusComposer = false,
    className,
}: Readonly<ChatThreadProps>): React.JSX.Element {
    const t = useChatText();
    const { translate } = useChatContext();
    const queryClient = useQueryClient();
    useChatRealtime();

    const conversation = useConversation(conversationId);
    const messages = useMessages(conversationId);
    const markRead = useMarkRead(conversationId);
    const reaction = useReaction(conversationId);
    const deletion = useDeleteMessage(conversationId);
    const sender = useSendMessage(conversationId);

    const [mode, setMode] = useState<Nullable<ComposerMode>>(null);
    const [reporting, setReporting] = useState<Nullable<ReportTarget>>(null);
    const [lightbox, setLightbox] =
        useState<Nullable<{ photos: ChatAttachment[]; index: number; senderName: string }>>(null);
    const [highlightedSeq, setHighlightedSeq] = useState<Nullable<number>>(null);
    const [opened, setOpened] = useState<Nullable<{ id: UUID; seq: number }>>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // My read position is frozen when a conversation opens, so the "new messages" line stays where it was
    // while reading moves it on the server. Adjusted during render, React's pattern for state following a prop.
    if (conversation.data !== undefined && opened?.id !== conversationId) {
        setOpened({ id: conversationId, seq: conversation.data.myLastReadSeq });
    }
    // A different conversation starts without the previous one's reply or edit.
    const [modeFor, setModeFor] = useState(conversationId);
    if (modeFor !== conversationId) {
        setModeFor(conversationId);
        setMode(null);
    }

    useEffect(
        () => (): void => {
            if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
        },
        [],
    );

    const jumpTo = useCallback(
        async (seq: number): Promise<void> => {
            for (let page = 0; page <= MAX_JUMP_PAGES; page += 1) {
                await nextFrame();
                const node = scroller.current?.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
                if (node !== null && node !== undefined) {
                    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    setHighlightedSeq(seq);
                    if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
                    highlightTimer.current = setTimeout(() => {
                        setHighlightedSeq(null);
                    }, HIGHLIGHT_MS);

                    return;
                }
                const held = queryClient.getQueryData<ChatMessageWindow>(chatQueryKeys.messages(conversationId));
                const oldest = held?.messages[0]?.seq;
                if (held?.hasOlder !== true || (oldest !== undefined && oldest < seq)) return;
                await messages.loadOlder();
            }
        },
        [conversationId, messages, queryClient],
    );

    // The latest `jumpTo`, read by the effect below so it runs when the target changes, not on every page
    // loaded on the way to it (which would restart the search each time).
    const jumpRef = useRef(jumpTo);
    useEffect(() => {
        jumpRef.current = jumpTo;
    }, [jumpTo]);

    const isReady = !messages.isLoading;
    useEffect(() => {
        if (focusSeq !== undefined && isReady) void jumpRef.current(focusSeq);
    }, [focusSeq, conversationId, isReady]);

    if (conversation.isError) {
        return (
            <section
                className={cn(
                    'flex h-full flex-col items-center justify-center gap-3 bg-canvas p-8 text-center',
                    className,
                )}
            >
                <p role="alert" className="text-body text-ink-soft">
                    {conversation.error.status === 404
                        ? t('chat.error.not-found')
                        : describeError(conversation.error, translate)}
                </p>
                <button type="button" className={QUIET_BUTTON} onClick={() => void conversation.refetch()}>
                    {t('chat.common.retry')}
                </button>
            </section>
        );
    }

    if (conversation.data === undefined) {
        return (
            <section aria-busy="true" className={cn('flex h-full flex-col bg-canvas', className)}>
                <span className="sr-only">{t('chat.common.loading')}</span>
                {showHeader && <div className="h-16 border-b border-line bg-surface" />}
                <div className="flex flex-1 flex-col justify-end gap-3 p-5" aria-hidden="true">
                    {['w-2/5', 'w-1/3 self-end', 'w-1/2', 'w-1/4 self-end'].map((width) => (
                        <span
                            key={width}
                            className={cn(
                                'h-10 animate-shimmer rounded-card bg-linear-to-r from-sunken via-raised to-sunken bg-[length:200%_100%]',
                                width,
                            )}
                        />
                    ))}
                </div>
            </section>
        );
    }

    const data = conversation.data;
    const heading = conversationHeading(data, translate);

    return (
        <section className={cn('flex h-full min-h-0 flex-col bg-canvas', className)}>
            {showHeader && (
                <ThreadHeader conversation={data} onBack={onBack} onOpenDetails={onOpenDetails} onGone={onGone} />
            )}

            {data.isRequest && (
                <div className="border-b border-line bg-surface px-4 py-3 sm:px-6">
                    <p className="text-label font-semibold text-ink">
                        {t('chat.thread.request.title', { name: heading.title })}
                    </p>
                    <p className="mt-0.5 text-small text-muted">{t('chat.thread.request.body')}</p>
                </div>
            )}

            {messages.isError && messages.items.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                    <p role="alert" className="text-body text-ink-soft">
                        {t('chat.thread.error')}
                    </p>
                    <button type="button" className={QUIET_BUTTON} onClick={messages.refetch}>
                        {t('chat.common.retry')}
                    </button>
                </div>
            ) : (
                <MessageList
                    conversation={data}
                    messages={messages}
                    openedLastReadSeq={opened?.seq ?? data.myLastReadSeq}
                    highlightedSeq={highlightedSeq}
                    scrollerRef={scroller}
                    onReadUpTo={(seq) => {
                        // A request is not marked read until it is accepted (the server keeps its sender from
                        // seeing it was read), so nothing is reported while it is one.
                        if (!data.isRequest && seq > data.myLastReadSeq) markRead(seq);
                    }}
                    onReply={(message) => {
                        setMode({ type: 'reply', message });
                    }}
                    onEdit={(message) => {
                        setMode({ type: 'edit', message });
                    }}
                    onReport={(message) => {
                        setReporting({ kind: 'message', messageId: message.id });
                    }}
                    onReact={(messageId, emoji) => {
                        reaction.mutate({ messageId, emoji });
                    }}
                    onDelete={(messageId, scope) => deletion.mutateAsync({ messageId, scope })}
                    onJumpTo={(seq) => {
                        void jumpTo(seq);
                    }}
                    onOpenPhoto={(photos, index, senderName) => {
                        setLightbox({ photos, index, senderName });
                    }}
                    onRetry={(clientMessageId) => {
                        void sender.retry(clientMessageId);
                    }}
                    onDiscard={sender.discard}
                />
            )}

            <TypingLine conversationId={conversationId} conversation={data} />
            <ChatComposer
                key={conversationId}
                conversation={data}
                mode={mode}
                onModeChange={setMode}
                autoFocus={autoFocusComposer}
            />

            {reporting !== null && (
                <ReportDialog
                    target={reporting}
                    onClose={() => {
                        setReporting(null);
                    }}
                />
            )}
            {lightbox !== null && (
                <Lightbox
                    photos={lightbox.photos}
                    startIndex={lightbox.index}
                    senderName={lightbox.senderName}
                    onClose={() => {
                        setLightbox(null);
                    }}
                />
            )}
        </section>
    );
}
