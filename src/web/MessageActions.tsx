import type { Nullable } from '@iveri/contracts';
import { CHAT_QUICK_REACTIONS } from '@iveri/contracts/chat';
import type { ChatMessage } from '@iveri/contracts/chat';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ChatDeleteScope } from '../client/index.js';
import { useChatText } from '../provider/index.js';
import { myReaction, type ChatMessagePermissions } from '../util/index.js';

import { ChatMenu, type ChatMenuItem } from './ChatMenu.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { CopyIcon, EditIcon, FlagIcon, ReactIcon, ReplyIcon, TrashIcon } from './icons.js';
import { fitPopover, type PopoverFit } from './popover-fit.js';
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
    // The picker and the menu grow toward the bubble, which is where there is room beside a toolbar at its side.
    const preferredPicker: PopoverFit = { vertical: 'above', align: message.isOwn ? 'start' : 'end' };
    const [pickerFit, setPickerFit] = useState<PopoverFit>(preferredPicker);
    const reactButton = useRef<HTMLButtonElement>(null);
    const picker = useRef<HTMLDivElement>(null);
    const pickerArea = useRef<HTMLDivElement>(null);
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

    // One of the picker and the menu at a time: open together they overlap, and the second click then lands on the
    // one in front.
    const setMenuOpen = (isOpen: boolean): void => {
        if (isOpen) setIsPicking(false);
        onMenuOpenChange?.(isOpen);
    };

    const closePicker = (): void => {
        setIsPicking(false);
    };

    // A click anywhere outside, or Escape wherever focus is (after clicking the button it is on the button, not in
    // the picker), closes it.
    useEffect(() => {
        if (!isPicking) return undefined;
        const onPointerDown = (event: PointerEvent): void => {
            if (pickerArea.current !== null && !pickerArea.current.contains(event.target as Node)) setIsPicking(false);
        };
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setIsPicking(false);
            reactButton.current?.focus();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);

        return (): void => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isPicking]);

    useLayoutEffect(() => {
        if (!isPicking || picker.current === null || reactButton.current === null) return;
        const next = fitPopover(
            reactButton.current,
            { width: picker.current.offsetWidth, height: picker.current.offsetHeight },
            { vertical: 'above', align: message.isOwn ? 'start' : 'end' },
        );
        setPickerFit((current) =>
            current.vertical === next.vertical && current.align === next.align ? current : next,
        );
    }, [isPicking, message.isOwn]);

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
                <div ref={pickerArea} className="relative">
                    <button
                        ref={reactButton}
                        type="button"
                        aria-label={t('chat.reaction.add')}
                        aria-expanded={isPicking}
                        onClick={() => {
                            if (!isPicking) onMenuOpenChange?.(false);
                            setIsPicking(!isPicking);
                        }}
                        className={cn(ICON_BUTTON, 'h-8 w-8')}
                    >
                        <ReactIcon className="h-4.5 w-4.5" />
                    </button>
                    {isPicking && (
                        <div
                            ref={picker}
                            role="group"
                            aria-label={t('chat.reaction.quick')}
                            // Measured on opening, so it is never cut off by the thread's edges.
                            className={cn(
                                'absolute z-40 flex animate-scale-in gap-0.5 rounded-full border border-chat-line bg-chat-surface p-1 shadow-lg',
                                pickerFit.vertical === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
                                pickerFit.align === 'end' ? 'end-0' : 'start-0',
                            )}
                        >
                            {CHAT_QUICK_REACTIONS.map((emoji) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    aria-pressed={mine === emoji}
                                    aria-label={t('chat.reaction.react-with', { emoji })}
                                    onClick={() => {
                                        closePicker();
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
                onOpenChange={setMenuOpen}
                triggerClassName="h-8 w-8"
                placement="above"
                align={message.isOwn ? 'start' : 'end'}
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
