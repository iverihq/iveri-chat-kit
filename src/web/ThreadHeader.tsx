import { ChatCallKind, ChatConversationKind } from '@iveri/contracts/chat';
import type { ChatConversation } from '@iveri/contracts/chat';
import { useState } from 'react';

import { useChatCallController, useChatContext, useChatText, useNow } from '../provider/index.js';
import { useBlockChange, useBlocks, useChatProfile } from '../query/index.js';
import { conversationHeading, formatLastActive } from '../util/index.js';

import { ChatAvatar } from './ChatAvatar.js';
import type { ChatMenuItem } from './ChatMenu.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { ConversationMenu } from './ConversationMenu.js';
import { BackIcon, BlockIcon, FlagIcon, PhoneIcon, VideoIcon } from './icons.js';
import { ReportDialog } from './ReportDialog.js';
import { cn, FOCUS_RING, ICON_BUTTON } from './style.js';

export interface ThreadHeaderProps {
    conversation: ChatConversation;
    onBack?: () => void;
    /** The back control's name, already translated: "Back to the ride" in an embedding. "Back to conversations" otherwise. */
    backLabel?: string;
    onOpenDetails?: () => void;
    onGone?: () => void;
}

/**
 * Who the conversation is with, and its menu.
 *
 * For a product's conversation between two people the other person leads, with the product's label
 * beside their name and the product's title beneath ("Giorgi B. · Driver", then "Taxi ride"), which is
 * `conversationHeading`'s rule. A one-to-one conversation in Baasi says when the other person was last
 * active, if they allow it; a group says how many are in it.
 */
export function ThreadHeader({
    conversation,
    onBack,
    backLabel,
    onOpenDetails,
    onGone,
}: Readonly<ThreadHeaderProps>): React.JSX.Element {
    const t = useChatText();
    const { translate, locale, timeZone } = useChatContext();
    const now = useNow();
    const profile = useChatProfile();
    const calls = useChatCallController();
    // Only where a call layer is mounted and the server says this conversation takes calls now.
    const showsCalls = calls !== null && conversation.canCall && calls.activeCallId === null;
    const isNetworkDirect = conversation.kind === ChatConversationKind.DIRECT && profile.data?.isNetwork === true;
    const blocks = useBlocks({ enabled: isNetworkDirect });
    const blockChange = useBlockChange();
    const [dialog, setDialog] = useState<'block' | 'report' | null>(null);
    const heading = conversationHeading(conversation, translate);
    const other = conversation.other;
    const isBlocked = other !== null && (blocks.data ?? []).some((block) => block.person.userId === other.userId);

    const subtitle =
        heading.subtitle ??
        (conversation.isGroup
            ? t('chat.thread.members', { count: conversation.memberCount })
            : heading.lastActiveAt !== null
              ? formatLastActive(heading.lastActiveAt, translate, { locale, timeZone, now })
              : null);

    const personItems: ChatMenuItem[] =
        isNetworkDirect && other !== null
            ? [
                  { type: 'separator', key: 'separator-person' },
                  {
                      key: 'block',
                      label: t(isBlocked ? 'chat.person.unblock' : 'chat.person.block', { name: other.displayName }),
                      icon: <BlockIcon />,
                      onSelect: (): void => {
                          if (isBlocked) blockChange.mutate({ userId: other.userId, isBlocked: false });
                          else setDialog('block');
                      },
                  },
                  {
                      key: 'report',
                      label: t('chat.person.report', { name: other.displayName }),
                      icon: <FlagIcon />,
                      onSelect: (): void => {
                          setDialog('report');
                      },
                  },
              ]
            : [];

    const identity = (
        <>
            <ChatAvatar name={heading.title} image={heading.avatar} size="sm" className="h-10 w-10" />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-chat-display text-h3 font-semibold text-chat-ink">
                        {heading.title}
                    </span>
                    {heading.label !== null && (
                        <span className="shrink-0 rounded-full bg-chat-raised px-2 py-px text-caption font-medium text-chat-ink-soft">
                            {heading.label}
                        </span>
                    )}
                </span>
                {subtitle !== null && <span className="truncate text-caption text-chat-muted">{subtitle}</span>}
            </span>
        </>
    );

    return (
        <header className="flex min-h-16 items-center gap-1 border-b border-chat-line bg-chat-surface px-2 py-2 sm:gap-2 sm:px-4">
            {onBack !== undefined && (
                <button
                    type="button"
                    aria-label={backLabel ?? t('chat.thread.back')}
                    onClick={onBack}
                    className={ICON_BUTTON}
                >
                    <BackIcon />
                </button>
            )}
            {onOpenDetails === undefined ? (
                <div className="flex min-w-0 flex-1 items-center gap-3 px-1.5 py-1">{identity}</div>
            ) : (
                <button
                    type="button"
                    onClick={onOpenDetails}
                    aria-label={`${heading.title}. ${t('chat.action.details')}`}
                    className={cn(
                        'flex min-w-0 flex-1 items-center gap-3 rounded-chat-card px-1.5 py-1 text-start transition-colors duration-fast hover:bg-chat-raised',
                        FOCUS_RING,
                    )}
                >
                    {identity}
                </button>
            )}
            {showsCalls && (
                <>
                    <button
                        type="button"
                        aria-label={t('chat.call.start-voice')}
                        onClick={() => {
                            calls.startCall(conversation.id, ChatCallKind.VOICE);
                        }}
                        className={ICON_BUTTON}
                    >
                        <PhoneIcon />
                    </button>
                    <button
                        type="button"
                        aria-label={t('chat.call.start-video')}
                        onClick={() => {
                            calls.startCall(conversation.id, ChatCallKind.VIDEO);
                        }}
                        className={ICON_BUTTON}
                    >
                        <VideoIcon />
                    </button>
                </>
            )}
            <ConversationMenu
                conversation={conversation}
                label={t('chat.thread.options')}
                onOpenDetails={onOpenDetails}
                onGone={onGone}
                extraItems={personItems}
            />
            {dialog === 'block' && other !== null && (
                <ConfirmDialog
                    title={t('chat.person.block-title', { name: other.displayName })}
                    body={t('chat.person.block-body')}
                    confirmLabel={t('chat.thread.request.block')}
                    onConfirm={() => blockChange.mutateAsync({ userId: other.userId, isBlocked: true })}
                    onClose={() => {
                        setDialog(null);
                    }}
                />
            )}
            {dialog === 'report' && other !== null && (
                <ReportDialog
                    target={{ kind: 'person', userId: other.userId, name: other.displayName }}
                    onClose={() => {
                        setDialog(null);
                    }}
                />
            )}
        </header>
    );
}
