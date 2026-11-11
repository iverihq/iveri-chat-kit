import { ChatConversationKind } from '@iveri/contracts/chat';
import type { ChatConversationSummary } from '@iveri/contracts/chat';
import { useState } from 'react';

import { useChatText, useNow } from '../provider/index.js';
import { isMuted, useConversationSettings } from '../query/index.js';

import { ChatMenu, type ChatMenuItem } from './ChatMenu.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { ArchiveIcon, BellIcon, InfoIcon, LeaveIcon, MuteIcon, PinIcon, TrashIcon } from './icons.js';

export interface ConversationMenuProps {
    conversation: ChatConversationSummary;
    /** The trigger's accessible name. */
    label: string;
    onOpenDetails?: () => void;
    /** After leaving or deleting for me, so the app can move away from a conversation that is gone. */
    onGone?: () => void;
    /** Actions only the caller knows about, drawn after the conversation's own. */
    extraItems?: ChatMenuItem[];
    triggerClassName?: string;
}

/** My own settings for one conversation, as a menu: pin, mute, archive, details, leave, delete for me. */
export function ConversationMenu({
    conversation,
    label,
    onOpenDetails,
    onGone,
    extraItems = [],
    triggerClassName,
}: Readonly<ConversationMenuProps>): React.JSX.Element {
    const t = useChatText();
    const now = useNow();
    const settings = useConversationSettings(conversation.id);
    const [confirming, setConfirming] = useState<'delete' | 'leave' | null>(null);
    const muted = isMuted(conversation.mutedUntil, now);

    const items: ChatMenuItem[] = [
        {
            key: 'pin',
            label: t(conversation.isPinned ? 'chat.action.unpin' : 'chat.action.pin'),
            icon: <PinIcon />,
            onSelect: (): void => {
                void settings.pin(!conversation.isPinned).catch(() => undefined);
            },
        },
        ...(muted
            ? [
                  {
                      key: 'unmute',
                      label: t('chat.action.unmute'),
                      icon: <BellIcon />,
                      onSelect: (): void => {
                          void settings.mute(null).catch(() => undefined);
                      },
                  },
              ]
            : ([
                  { type: 'heading', key: 'mute-heading', label: t('chat.action.mute') },
                  ...(['8h', 'week', 'always'] as const).map((duration) => ({
                      key: `mute-${duration}`,
                      label: t(
                          duration === '8h'
                              ? 'chat.action.mute-8h'
                              : duration === 'week'
                                ? 'chat.action.mute-week'
                                : 'chat.action.mute-always',
                      ),
                      icon: <MuteIcon />,
                      onSelect: (): void => {
                          void settings.mute(duration).catch(() => undefined);
                      },
                  })),
              ] satisfies ChatMenuItem[])),
        { type: 'separator', key: 'separator-archive' },
        {
            key: 'archive',
            label: t(conversation.isArchived ? 'chat.action.unarchive' : 'chat.action.archive'),
            icon: <ArchiveIcon />,
            onSelect: (): void => {
                void settings.archive(!conversation.isArchived).catch(() => undefined);
            },
        },
        ...(onOpenDetails === undefined
            ? []
            : [{ key: 'details', label: t('chat.action.details'), icon: <InfoIcon />, onSelect: onOpenDetails }]),
        ...extraItems,
        { type: 'separator', key: 'separator-danger' },
        ...(conversation.kind === ChatConversationKind.GROUP
            ? [
                  {
                      key: 'leave',
                      label: t('chat.action.leave'),
                      icon: <LeaveIcon />,
                      tone: 'danger' as const,
                      onSelect: (): void => {
                          setConfirming('leave');
                      },
                  },
              ]
            : []),
        {
            key: 'delete',
            label: t('chat.action.delete-conversation'),
            icon: <TrashIcon />,
            tone: 'danger',
            onSelect: (): void => {
                setConfirming('delete');
            },
        },
    ];

    return (
        <>
            <ChatMenu label={label} items={items} triggerClassName={triggerClassName} />
            {confirming === 'delete' && (
                <ConfirmDialog
                    title={t('chat.delete-conversation.title')}
                    body={t('chat.delete-conversation.body')}
                    confirmLabel={t('chat.delete-conversation.confirm')}
                    onConfirm={async () => {
                        await settings.deleteForMe();
                        onGone?.();
                    }}
                    onClose={() => {
                        setConfirming(null);
                    }}
                />
            )}
            {confirming === 'leave' && (
                <ConfirmDialog
                    title={t('chat.group.leave-title')}
                    body={t('chat.group.leave-body')}
                    confirmLabel={t('chat.action.leave')}
                    onConfirm={async () => {
                        await settings.leave();
                        onGone?.();
                    }}
                    onClose={() => {
                        setConfirming(null);
                    }}
                />
            )}
        </>
    );
}
