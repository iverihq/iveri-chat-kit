import type { Nullable } from '@iveri/contracts';
import { CHAT_QUICK_REACTIONS } from '@iveri/contracts/chat';
import type { ChatMessage } from '@iveri/contracts/chat';
import { useEffect, useRef, useState } from 'react';

import type { ChatDeleteScope } from '../client/index.js';
import { useChatText } from '../provider/index.js';
import { myReaction, type ChatMessagePermissions } from '../util/index.js';

import { ChatMenu, type ChatMenuItem } from './ChatMenu.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { CopyIcon, EditIcon, FlagIcon, ReactIcon, ReplyIcon, TrashIcon } from './icons.js';
import { cn, FOCUS_RING, ICON_BUTTON } from './style.js';

export interface MessageActionsProps {
    message: ChatMessage;
    permissions: ChatMessagePermissions;
    onReply: () => void;
    onReact: (emoji: Nullable<string>) => void;
    onEdit: () => void;
    onDelete: (scope: ChatDeleteScope) => Promise<void>;
    onReport: () => void;
    /** Opened from outside: a right click or a long press on the bubble. */
    isMenuOpen?: boolean;
    onMenuOpenChange?: (isOpen: boolean) => void;
    className?: string;
}

/**
 * What can be done to one message: react, reply, and a menu with the rest (copy, edit, delete for me or
 * for everyone, report). Only what `messagePermissions` allows is drawn, so a button is never offered
 * for an action the server would refuse.
 */
export function MessageActions({
    message,
    permissions,
    onReply,
    onReact,
    onEdit,
    onDelete,
    onReport,
    isMenuOpen,
    onMenuOpenChange,
    className,
}: Readonly<MessageActionsProps>): React.JSX.Element {
    const t = useChatText();
    const [isPicking, setIsPicking] = useState(false);
    const [deleting, setDeleting] = useState<ChatDeleteScope | null>(null);
    const [copied, setCopied] = useState(false);
    const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mine = myReaction(message.reactions);

    useEffect(
        () => (): void => {
            if (copyTimer.current !== null) clearTimeout(copyTimer.current);
        },
        [],
    );

    const copy = (): void => {
        if (message.body === null) return;
        void navigator.clipboard
            .writeText(message.body)
            .then(() => {
                setCopied(true);
                if (copyTimer.current !== null) clearTimeout(copyTimer.current);
                copyTimer.current = setTimeout(() => {
                    setCopied(false);
                }, 1600);
            })
            .catch(() => undefined);
    };

    const items: ChatMenuItem[] = [
        ...(permissions.canReply
            ? [{ key: 'reply', label: t('chat.action.reply'), icon: <ReplyIcon />, onSelect: onReply }]
            : []),
        ...(permissions.canCopy
            ? [{ key: 'copy', label: t('chat.action.copy'), icon: <CopyIcon />, onSelect: copy }]
            : []),
        ...(permissions.canEdit
            ? [{ key: 'edit', label: t('chat.action.edit'), icon: <EditIcon />, onSelect: onEdit }]
            : []),
        ...(permissions.canReport
            ? [{ key: 'report', label: t('chat.action.report'), icon: <FlagIcon />, onSelect: onReport }]
            : []),
        { type: 'separator', key: 'separator' },
        ...(permissions.canDeleteForEveryone
            ? [
                  {
                      key: 'delete-everyone',
                      label: t('chat.action.delete-for-everyone'),
                      icon: <TrashIcon />,
                      tone: 'danger' as const,
                      onSelect: (): void => {
                          setDeleting('everyone');
                      },
                  },
              ]
            : []),
        ...(permissions.canDeleteForMe
            ? [
                  {
                      key: 'delete-me',
                      label: t('chat.action.delete-for-me'),
                      icon: <TrashIcon />,
                      tone: 'danger' as const,
                      onSelect: (): void => {
                          setDeleting('me');
                      },
                  },
              ]
            : []),
    ];

    return (
        <div
            className={cn(
                'flex items-center gap-0.5 rounded-full border border-chat-line bg-chat-surface p-0.5 shadow-md',
                className,
            )}
        >
            {permissions.canReact && (
                <div className="relative">
                    <button
                        type="button"
                        aria-label={t('chat.reaction.add')}
                        aria-expanded={isPicking}
                        onClick={() => {
                            setIsPicking((current) => !current);
                        }}
                        className={cn(ICON_BUTTON, 'h-8 w-8')}
                    >
                        <ReactIcon className="h-4.5 w-4.5" />
                    </button>
                    {isPicking && (
                        <div
                            role="group"
                            aria-label={t('chat.reaction.quick')}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') setIsPicking(false);
                            }}
                            // Anchored on the side where the thread has room: a picker centred on the button was
                            // cut off by the thread's edge on somebody else's message.
                            className={cn(
                                'absolute bottom-full z-40 mb-2 flex animate-scale-in gap-0.5 rounded-full border border-chat-line bg-chat-surface p-1 shadow-lg',
                                message.isOwn ? 'end-0' : 'start-0',
                            )}
                        >
                            {CHAT_QUICK_REACTIONS.map((emoji) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    aria-pressed={mine === emoji}
                                    aria-label={t('chat.reaction.react-with', { emoji })}
                                    onClick={() => {
                                        setIsPicking(false);
                                        onReact(mine === emoji ? null : emoji);
                                    }}
                                    className={cn(
                                        'flex h-9 w-9 items-center justify-center rounded-full text-[1.25rem] transition-transform duration-fast hover:scale-110 hover:bg-chat-raised',
                                        mine === emoji && 'bg-chat-accent-soft',
                                        FOCUS_RING,
                                    )}
                                >
                                    <span aria-hidden="true">{emoji}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {permissions.canReply && (
                <button
                    type="button"
                    aria-label={t('chat.action.reply')}
                    onClick={onReply}
                    className={cn(ICON_BUTTON, 'h-8 w-8')}
                >
                    <ReplyIcon className="h-4.5 w-4.5" />
                </button>
            )}
            <ChatMenu
                label={t('chat.action.more')}
                items={items}
                isOpen={isMenuOpen}
                onOpenChange={onMenuOpenChange}
                triggerClassName="h-8 w-8"
                placement="above"
            />
            {copied && (
                <span role="status" className="px-2 text-caption font-medium text-positive">
                    {t('chat.action.copied')}
                </span>
            )}
            {deleting !== null && (
                <ConfirmDialog
                    title={t('chat.delete-message.title')}
                    body={t(
                        deleting === 'everyone' ? 'chat.delete-message.everyone-body' : 'chat.delete-message.me-body',
                    )}
                    confirmLabel={t('chat.delete-message.confirm')}
                    onConfirm={() => onDelete(deleting)}
                    onClose={() => {
                        setDeleting(null);
                    }}
                />
            )}
        </div>
    );
}
