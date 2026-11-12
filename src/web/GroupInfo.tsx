import type { UUID } from '@iveri/contracts';
import {
    CHAT_GROUP_TITLE_MAX_LENGTH,
    ChatConversationKind,
    ChatParticipantRole,
    ChatParticipantStatus,
} from '@iveri/contracts/chat';
import type { ChatConversation, ChatParticipant } from '@iveri/contracts/chat';
import { useState } from 'react';

import { useChatContext, useChatText, useNow } from '../provider/index.js';
import {
    useBlockChange,
    useBlocks,
    useChatProfile,
    useContactChange,
    useContacts,
    useConversation,
    useConversationSettings,
    useRemoveChatMember,
    useResetGroupInvite,
    useUpdateChatMemberRole,
    useUpdateGroupChat,
} from '../query/index.js';
import { conversationHeading, describeError, formatLastActive, productText } from '../util/index.js';

import { ChatAvatar } from './ChatAvatar.js';
import { ChatMenu, type ChatMenuItem } from './ChatMenu.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { BlockIcon, CloseIcon, CopyIcon, EditIcon, FlagIcon, LeaveIcon, LinkIcon, PersonAddIcon } from './icons.js';
import { PersonPicker } from './PersonPicker.js';
import { ReportDialog } from './ReportDialog.js';
import { cn, DANGER_BUTTON, ICON_BUTTON, PRIMARY_BUTTON, QUIET_BUTTON, TEXT_INPUT } from './style.js';

export interface GroupInfoProps {
    conversationId: UUID;
    onClose?: () => void;
    /** After leaving, so the app moves away from a conversation that is gone. */
    onGone?: () => void;
    /** Builds the address an invitation code is shared as; the code alone when absent. */
    inviteLinkFor?: (code: string) => string;
}

const ROLE_KEY = {
    [ChatParticipantRole.OWNER]: 'chat.group.role.owner',
    [ChatParticipantRole.ADMIN]: 'chat.group.role.admin',
    [ChatParticipantRole.MEMBER]: 'chat.group.role.member',
} as const;

type Dialog =
    | { type: 'leave' }
    | { type: 'reset-invite' }
    | { type: 'add' }
    | { type: 'block'; userId: UUID; name: string }
    | { type: 'report'; userId: UUID; name: string };

function isPresent(participant: ChatParticipant): boolean {
    return participant.status === ChatParticipantStatus.ACTIVE || participant.status === ChatParticipantStatus.REQUEST;
}

/**
 * A conversation's details, drawn by the app wherever it puts them (a side panel beside the thread, a
 * route on a phone). A group: its name, invitation link, members and roles, with what my role allows. A
 * one-to-one conversation: the other person, my contact and block for them, and a report. A product's
 * conversation: who is in it and as what, and nothing a product did not decide.
 */
export function GroupInfo({
    conversationId,
    onClose,
    onGone,
    inviteLinkFor,
}: Readonly<GroupInfoProps>): React.JSX.Element {
    const t = useChatText();
    const { translate, locale, timeZone } = useChatContext();
    const now = useNow();
    const conversation = useConversation(conversationId);
    const profile = useChatProfile();
    const isNetwork = profile.data?.isNetwork === true;
    const contacts = useContacts({ enabled: isNetwork });
    const blocks = useBlocks({ enabled: isNetwork });
    const contactChange = useContactChange();
    const blockChange = useBlockChange();
    const settings = useConversationSettings(conversationId);
    const updateGroup = useUpdateGroupChat();
    const updateRole = useUpdateChatMemberRole();
    const removeMember = useRemoveChatMember();
    const resetInvite = useResetGroupInvite();
    const [dialog, setDialog] = useState<Dialog | null>(null);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const data: ChatConversation | undefined = conversation.data;
    if (data === undefined) {
        return (
            <aside
                className="flex h-full items-center justify-center bg-chat-surface p-6 text-small text-chat-muted"
                aria-busy="true"
            >
                {conversation.isError ? describeError(conversation.error, translate) : t('chat.common.loading')}
            </aside>
        );
    }

    const heading = conversationHeading(data, translate);
    const isGroup = data.kind === ChatConversationKind.GROUP;
    const isDirect = data.kind === ChatConversationKind.DIRECT;
    const manages = isGroup && (data.myRole === ChatParticipantRole.OWNER || data.myRole === ChatParticipantRole.ADMIN);
    const isOwner = data.myRole === ChatParticipantRole.OWNER;
    const members = data.participants.filter(isPresent);
    const other = data.other;
    const isContact = other !== null && (contacts.data ?? []).some((contact) => contact.person.userId === other.userId);
    const isBlocked = other !== null && (blocks.data ?? []).some((block) => block.person.userId === other.userId);
    const inviteLink = data.inviteCode === null ? null : (inviteLinkFor?.(data.inviteCode) ?? data.inviteCode);

    const attempt = (work: Promise<unknown>): void => {
        setProblem(null);
        work.catch((error: unknown) => {
            setProblem(describeError(error, translate));
        });
    };

    const memberItems = (participant: ChatParticipant): ChatMenuItem[] => {
        const items: ChatMenuItem[] = [];
        if (isOwner && participant.role !== ChatParticipantRole.OWNER) {
            items.push(
                participant.role === ChatParticipantRole.ADMIN
                    ? {
                          key: 'make-member',
                          label: t('chat.group.make-member'),
                          onSelect: (): void => {
                              attempt(
                                  updateRole.mutateAsync({
                                      conversationId,
                                      userId: participant.userId,
                                      role: ChatParticipantRole.MEMBER,
                                  }),
                              );
                          },
                      }
                    : {
                          key: 'make-admin',
                          label: t('chat.group.make-admin'),
                          onSelect: (): void => {
                              attempt(
                                  updateRole.mutateAsync({
                                      conversationId,
                                      userId: participant.userId,
                                      role: ChatParticipantRole.ADMIN,
                                  }),
                              );
                          },
                      },
                {
                    key: 'make-owner',
                    label: t('chat.group.make-owner'),
                    onSelect: () => {
                        attempt(
                            updateRole.mutateAsync({
                                conversationId,
                                userId: participant.userId,
                                role: ChatParticipantRole.OWNER,
                            }),
                        );
                    },
                },
            );
        }
        const canRemove =
            isOwner || (data.myRole === ChatParticipantRole.ADMIN && participant.role === ChatParticipantRole.MEMBER);
        if (canRemove && participant.role !== ChatParticipantRole.OWNER) {
            items.push({
                key: 'remove',
                label: t('chat.group.remove'),
                tone: 'danger',
                onSelect: () => {
                    attempt(removeMember.mutateAsync({ conversationId, userId: participant.userId }));
                },
            });
        }

        return items;
    };

    return (
        <aside className="flex h-full min-h-0 flex-col bg-chat-surface">
            <div className="flex items-center gap-2 border-b border-chat-line px-4 py-3">
                <h2 className="min-w-0 flex-1 truncate font-chat-display text-h3 font-semibold text-chat-ink">
                    {isGroup ? t('chat.group.title') : t('chat.action.details')}
                </h2>
                {onClose !== undefined && (
                    <button type="button" aria-label={t('chat.common.close')} onClick={onClose} className={ICON_BUTTON}>
                        <CloseIcon />
                    </button>
                )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5">
                <div className="flex flex-col items-center gap-2 text-center">
                    <ChatAvatar name={heading.title} image={heading.avatar} size="lg" />
                    {renaming === null ? (
                        <div className="flex items-center gap-1">
                            <p className="font-chat-display text-h2 font-bold text-chat-ink">{heading.title}</p>
                            {manages && (
                                <button
                                    type="button"
                                    aria-label={t('chat.group.rename')}
                                    onClick={() => {
                                        setRenaming(data.title);
                                    }}
                                    className={cn(ICON_BUTTON, 'h-8 w-8')}
                                >
                                    <EditIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <form
                            className="flex w-full max-w-sm gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                const title = renaming.trim();
                                if (title.length === 0) return;
                                attempt(
                                    updateGroup.mutateAsync({ conversationId, title }).then(() => setRenaming(null)),
                                );
                            }}
                        >
                            <input
                                aria-label={t('chat.people.group-name')}
                                value={renaming}
                                maxLength={CHAT_GROUP_TITLE_MAX_LENGTH}
                                autoFocus
                                onChange={(event) => {
                                    setRenaming(event.target.value);
                                }}
                                className={TEXT_INPUT}
                            />
                            <button type="submit" className={PRIMARY_BUTTON}>
                                {t('chat.common.save')}
                            </button>
                        </form>
                    )}
                    {heading.label !== null && <p className="text-small text-chat-ink-soft">{heading.label}</p>}
                    {heading.subtitle !== null && <p className="text-small text-chat-muted">{heading.subtitle}</p>}
                    {isDirect && other?.handle !== null && other?.handle !== undefined && (
                        <p className="text-small text-chat-muted">@{other.handle}</p>
                    )}
                    {heading.lastActiveAt !== null && (
                        <p className="text-caption text-chat-faint">
                            {formatLastActive(heading.lastActiveAt, translate, { locale, timeZone, now })}
                        </p>
                    )}
                </div>

                {isDirect && isNetwork && other !== null && (
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            className={QUIET_BUTTON}
                            onClick={() => {
                                attempt(contactChange.mutateAsync({ userId: other.userId, isContact: !isContact }));
                            }}
                        >
                            <PersonAddIcon className="h-4.5 w-4.5" />
                            {t(isContact ? 'chat.person.remove-contact' : 'chat.person.add-contact')}
                        </button>
                        <button
                            type="button"
                            className={QUIET_BUTTON}
                            onClick={() => {
                                if (isBlocked)
                                    attempt(blockChange.mutateAsync({ userId: other.userId, isBlocked: false }));
                                else setDialog({ type: 'block', userId: other.userId, name: other.displayName });
                            }}
                        >
                            <BlockIcon className="h-4.5 w-4.5" />
                            {t(isBlocked ? 'chat.person.unblock' : 'chat.person.block', { name: other.displayName })}
                        </button>
                        <button
                            type="button"
                            className={cn(QUIET_BUTTON, 'text-critical')}
                            onClick={() => {
                                setDialog({ type: 'report', userId: other.userId, name: other.displayName });
                            }}
                        >
                            <FlagIcon className="h-4.5 w-4.5" />
                            {t('chat.person.report', { name: other.displayName })}
                        </button>
                    </div>
                )}

                {manages && inviteLink !== null && (
                    <section className="flex flex-col gap-2 rounded-chat-card border border-chat-line bg-chat-canvas p-3">
                        <h3 className="flex items-center gap-2 text-label font-semibold text-chat-ink">
                            <LinkIcon className="h-4.5 w-4.5 text-chat-muted" />
                            {t('chat.group.invite')}
                        </h3>
                        <p className="text-caption text-chat-muted">{t('chat.group.invite-hint')}</p>
                        <code className="truncate rounded-chat-control bg-chat-surface px-2.5 py-1.5 font-mono text-small text-chat-ink-soft">
                            {inviteLink}
                        </code>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={cn(QUIET_BUTTON, 'min-h-9')}
                                onClick={() => {
                                    void navigator.clipboard
                                        .writeText(inviteLink)
                                        .then(() => {
                                            setCopied(true);
                                        })
                                        .catch(() => undefined);
                                }}
                            >
                                <CopyIcon className="h-4 w-4" />
                                {copied ? t('chat.group.invite-copied') : t('chat.group.invite-copy')}
                            </button>
                            <button
                                type="button"
                                className={cn(QUIET_BUTTON, 'min-h-9')}
                                onClick={() => {
                                    setDialog({ type: 'reset-invite' });
                                }}
                            >
                                {t('chat.group.invite-reset')}
                            </button>
                        </div>
                    </section>
                )}

                {!isDirect && (
                    <section className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 pb-1">
                            <h3 className="flex-1 text-caption font-semibold text-chat-faint">
                                {t('chat.group.members')} · {new Intl.NumberFormat(locale).format(members.length)}
                            </h3>
                            {manages && (
                                <button
                                    type="button"
                                    className={cn(QUIET_BUTTON, 'min-h-8 px-2.5 text-caption')}
                                    onClick={() => {
                                        setDialog({ type: 'add' });
                                    }}
                                >
                                    <PersonAddIcon className="h-4 w-4" />
                                    {t('chat.group.add-people')}
                                </button>
                            )}
                        </div>
                        <ul className="flex flex-col">
                            {members.map((participant) => {
                                const items = participant.isMe ? [] : memberItems(participant);
                                const label = productText(participant.label, translate);

                                return (
                                    <li
                                        key={participant.userId}
                                        className="flex items-center gap-3 rounded-chat-card px-1.5 py-1.5"
                                    >
                                        <ChatAvatar
                                            name={participant.displayName}
                                            image={participant.avatar}
                                            size="sm"
                                            className="h-10 w-10"
                                        />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-body font-medium text-chat-ink">
                                                {participant.displayName}
                                                {participant.isMe && (
                                                    <span className="font-normal text-chat-muted">
                                                        {' '}
                                                        · {t('chat.common.you')}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="truncate text-caption text-chat-muted">
                                                {label ??
                                                    (isGroup
                                                        ? t(ROLE_KEY[participant.role])
                                                        : participant.handle === null
                                                          ? ''
                                                          : `@${participant.handle}`)}
                                            </span>
                                        </span>
                                        {items.length > 0 && (
                                            <ChatMenu
                                                label={t('chat.group.member-options', {
                                                    name: participant.displayName,
                                                })}
                                                items={items}
                                                triggerClassName="h-8 w-8"
                                            />
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}

                {problem !== null && (
                    <p role="alert" className="text-small text-critical">
                        {problem}
                    </p>
                )}

                {isGroup && (
                    <button
                        type="button"
                        className={cn(DANGER_BUTTON, 'mt-auto')}
                        onClick={() => {
                            setDialog({ type: 'leave' });
                        }}
                    >
                        <LeaveIcon className="h-4.5 w-4.5" />
                        {t('chat.action.leave')}
                    </button>
                )}
            </div>

            {dialog?.type === 'leave' && (
                <ConfirmDialog
                    title={t('chat.group.leave-title')}
                    body={t('chat.group.leave-body')}
                    confirmLabel={t('chat.action.leave')}
                    onConfirm={async () => {
                        await settings.leave();
                        onGone?.();
                    }}
                    onClose={() => {
                        setDialog(null);
                    }}
                />
            )}
            {dialog?.type === 'reset-invite' && (
                <ConfirmDialog
                    title={t('chat.group.invite-reset')}
                    body={t('chat.group.invite-reset-body')}
                    confirmLabel={t('chat.group.invite-reset')}
                    tone="default"
                    onConfirm={async () => {
                        setCopied(false);
                        await resetInvite.mutateAsync(conversationId);
                    }}
                    onClose={() => {
                        setDialog(null);
                    }}
                />
            )}
            {dialog?.type === 'block' && (
                <ConfirmDialog
                    title={t('chat.person.block-title', { name: dialog.name })}
                    body={t('chat.person.block-body')}
                    confirmLabel={t('chat.thread.request.block')}
                    onConfirm={() => blockChange.mutateAsync({ userId: dialog.userId, isBlocked: true })}
                    onClose={() => {
                        setDialog(null);
                    }}
                />
            )}
            {dialog?.type === 'report' && (
                <ReportDialog
                    target={{ kind: 'person', userId: dialog.userId, name: dialog.name }}
                    onClose={() => {
                        setDialog(null);
                    }}
                />
            )}
            {dialog?.type === 'add' && (
                <PersonPicker
                    mode="add"
                    conversationId={conversationId}
                    excludeUserIds={members.map((participant) => participant.userId)}
                    onDone={() => {
                        setDialog(null);
                    }}
                    onClose={() => {
                        setDialog(null);
                    }}
                />
            )}
        </aside>
    );
}
