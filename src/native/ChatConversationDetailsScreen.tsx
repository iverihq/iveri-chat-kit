import type { Nullable, UUID } from '@iveri/contracts';
import {
    CHAT_GROUP_DESCRIPTION_MAX_LENGTH,
    CHAT_GROUP_TITLE_MAX_LENGTH,
    ChatConversationKind,
    ChatParticipantRole,
    ChatParticipantStatus,
    type ChatParticipant,
} from '@iveri/contracts/chat';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    TextInput,
    View,
} from 'react-native';

import { useChatContext, useChatText, useNow } from '../provider/index.js';
import {
    isMuted,
    useAddChatMembers,
    useConversation,
    useConversationSettings,
    usePeopleSearch,
    useRemoveChatMember,
    useResetGroupInvite,
    useUpdateChatMemberRole,
    useUpdateGroupChat,
    type ChatMuteDuration,
} from '../query/index.js';
import { conversationHeading, describeError } from '../util/index.js';

import { ChatText } from './ChatText.js';
import { useChatNative } from './native-context.js';

export interface ChatConversationDetailsScreenProps {
    conversationId: UUID;
    onBack?: () => void;
    /** Called once I have left or deleted the conversation, so the app can leave its screen. */
    onGone?: () => void;
    /** The full address of a group's invitation, for sharing; the bare code when absent. */
    inviteLinkFor?: (code: string) => string;
    /** Shares a text with the platform's share sheet. Absent, the link is only copied. */
    share?: (text: string) => void;
}

const MUTE_DURATIONS: readonly ChatMuteDuration[] = ['8h', 'week', 'always'];

function isPresent(participant: ChatParticipant): boolean {
    return participant.status === ChatParticipantStatus.ACTIVE || participant.status === ChatParticipantStatus.REQUEST;
}

/**
 * A conversation's details on a phone, the screen the thread's header opens: my own settings (mute, pin, archive,
 * leave, delete), and for a group its name, description, who may write, its invitation link and its members, with
 * what my role allows. The same rules the web panel draws; `chat-api` decides, and a refusal is shown as it says.
 */
export function ChatConversationDetailsScreen({
    conversationId,
    onBack,
    onGone,
    inviteLinkFor,
    share,
}: Readonly<ChatConversationDetailsScreenProps>): React.JSX.Element {
    const t = useChatText();
    const { translate } = useChatContext();
    const { theme, capabilities } = useChatNative();
    const c = theme.color;
    const now = useNow();
    const conversation = useConversation(conversationId);
    const settings = useConversationSettings(conversationId);
    const updateGroup = useUpdateGroupChat();
    const updateRole = useUpdateChatMemberRole();
    const removeMember = useRemoveChatMember();
    const addMembers = useAddChatMembers();
    const resetInvite = useResetGroupInvite();
    const [renaming, setRenaming] = useState<Nullable<string>>(null);
    const [describing, setDescribing] = useState<Nullable<string>>(null);
    const [member, setMember] = useState<Nullable<ChatParticipant>>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [query, setQuery] = useState('');
    const [problem, setProblem] = useState<Nullable<string>>(null);
    const [copied, setCopied] = useState(false);
    const search = usePeopleSearch(isAdding ? query : '');

    const data = conversation.data;
    if (data === undefined) {
        return (
            <View style={[styles.screen, styles.center, { backgroundColor: c.canvas }]}>
                {conversation.isError ? (
                    <ChatText style={{ color: c.inkSoft }}>{describeError(conversation.error, translate)}</ChatText>
                ) : (
                    <ActivityIndicator accessibilityLabel={t('chat.common.loading')} color={c.accent} />
                )}
            </View>
        );
    }

    const heading = conversationHeading(data, translate);
    const isGroup = data.kind === ChatConversationKind.GROUP;
    const manages = isGroup && (data.myRole === ChatParticipantRole.OWNER || data.myRole === ChatParticipantRole.ADMIN);
    const isOwner = data.myRole === ChatParticipantRole.OWNER;
    const members = data.participants.filter(isPresent);
    const memberIds = new Set(members.map((participant) => participant.userId));
    const inviteLink = data.inviteCode === null ? null : (inviteLinkFor?.(data.inviteCode) ?? data.inviteCode);
    const muted = isMuted(data.mutedUntil, now);

    const attempt = (work: Promise<unknown>, after?: () => void): void => {
        setProblem(null);
        work.then(after).catch((error: unknown) => {
            setProblem(describeError(error, translate));
        });
    };

    const confirm = (title: string, body: string, action: string, run: () => void): void => {
        Alert.alert(title, body, [
            { text: t('chat.common.cancel'), style: 'cancel' },
            { text: action, style: 'destructive', onPress: run },
        ]);
    };

    const row = (
        label: string,
        onPress: () => void,
        tone: 'default' | 'danger' = 'default',
        key: string = label,
    ): React.JSX.Element => (
        <Pressable
            key={key}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.row,
                { borderBottomColor: c.line },
                pressed && { backgroundColor: c.raised },
            ]}
        >
            <ChatText style={{ fontSize: 16, color: tone === 'danger' ? c.critical : c.ink }}>{label}</ChatText>
        </Pressable>
    );

    const roleLabel = (role: ChatParticipantRole): string =>
        role === ChatParticipantRole.OWNER
            ? t('chat.group.role.owner')
            : role === ChatParticipantRole.ADMIN
              ? t('chat.group.role.admin')
              : t('chat.group.role.member');

    const section = (title: string, children: React.ReactNode): React.JSX.Element => (
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.line }]}>
            <ChatText style={[styles.sectionTitle, { color: c.muted }]}>{title}</ChatText>
            {children}
        </View>
    );

    return (
        <View style={[styles.screen, { backgroundColor: c.canvas }]}>
            <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.line }]}>
                {onBack !== undefined && (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('chat.thread.back')}
                        onPress={onBack}
                        hitSlop={10}
                        style={styles.back}
                    >
                        <ChatText style={{ fontSize: 22, color: c.ink }}>‹</ChatText>
                    </Pressable>
                )}
                <ChatText style={styles.headerTitle} numberOfLines={1}>
                    {isGroup ? t('chat.group.title') : t('chat.action.details')}
                </ChatText>
            </View>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                <View style={styles.identity}>
                    {heading.avatar === null ? (
                        <View style={[styles.avatar, { backgroundColor: c.accentSoft }]}>
                            <ChatText style={{ color: c.accent, fontSize: 26, fontWeight: '700' }}>
                                {heading.title.slice(0, 1).toUpperCase()}
                            </ChatText>
                        </View>
                    ) : (
                        <Image source={{ uri: heading.avatar.thumbnailUrl }} style={styles.avatar} />
                    )}
                    {renaming === null ? (
                        <Pressable
                            accessibilityRole={manages ? 'button' : undefined}
                            accessibilityLabel={manages ? t('chat.group.rename') : undefined}
                            disabled={!manages}
                            onPress={() => {
                                setRenaming(data.title);
                            }}
                        >
                            <ChatText style={styles.title}>
                                {heading.title}
                                {manages ? '  ✎' : ''}
                            </ChatText>
                        </Pressable>
                    ) : (
                        <View style={styles.editRow}>
                            <TextInput
                                value={renaming}
                                autoFocus
                                maxLength={CHAT_GROUP_TITLE_MAX_LENGTH}
                                accessibilityLabel={t('chat.people.group-name')}
                                onChangeText={setRenaming}
                                style={[
                                    styles.input,
                                    { borderColor: c.line, color: c.ink, backgroundColor: c.surface },
                                ]}
                            />
                            {row(t('chat.common.save'), () => {
                                const title = renaming.trim();
                                if (title.length === 0) return;
                                attempt(updateGroup.mutateAsync({ conversationId, title }), () => {
                                    setRenaming(null);
                                });
                            })}
                        </View>
                    )}
                    {heading.subtitle !== null && (
                        <ChatText style={{ color: c.muted, fontSize: 14 }}>{heading.subtitle}</ChatText>
                    )}
                </View>

                {problem !== null && (
                    <ChatText accessibilityRole="alert" style={[styles.problem, { color: c.critical }]}>
                        {problem}
                    </ChatText>
                )}

                {isGroup &&
                    (data.description !== null || manages) &&
                    section(
                        t('chat.group.description'),
                        describing === null ? (
                            <Pressable
                                accessibilityRole={manages ? 'button' : undefined}
                                accessibilityLabel={manages ? t('chat.group.description-edit') : undefined}
                                disabled={!manages}
                                onPress={() => {
                                    setDescribing(data.description ?? '');
                                }}
                                style={styles.padded}
                            >
                                <ChatText
                                    style={{ color: data.description === null ? c.faint : c.inkSoft, fontSize: 15 }}
                                >
                                    {data.description ?? t('chat.group.description-empty')}
                                </ChatText>
                            </Pressable>
                        ) : (
                            <View style={styles.padded}>
                                <TextInput
                                    value={describing}
                                    multiline
                                    autoFocus
                                    maxLength={CHAT_GROUP_DESCRIPTION_MAX_LENGTH}
                                    accessibilityLabel={t('chat.group.description')}
                                    onChangeText={setDescribing}
                                    style={[
                                        styles.input,
                                        styles.multiline,
                                        { borderColor: c.line, color: c.ink, backgroundColor: c.canvas },
                                    ]}
                                />
                                <View style={styles.buttons}>
                                    {row(t('chat.common.cancel'), () => {
                                        setDescribing(null);
                                    })}
                                    {row(t('chat.common.save'), () => {
                                        attempt(
                                            updateGroup.mutateAsync({ conversationId, description: describing.trim() }),
                                            () => {
                                                setDescribing(null);
                                            },
                                        );
                                    })}
                                </View>
                            </View>
                        ),
                    )}

                {isGroup &&
                    manages &&
                    section(
                        t('chat.group.admins-only'),
                        <View style={[styles.padded, styles.switchRow]}>
                            <ChatText style={{ flex: 1, color: c.muted, fontSize: 14 }}>
                                {t('chat.group.admins-only-hint')}
                            </ChatText>
                            <Switch
                                accessibilityLabel={t('chat.group.admins-only')}
                                value={data.onlyAdminsCanSend}
                                onValueChange={(value) => {
                                    attempt(updateGroup.mutateAsync({ conversationId, onlyAdminsCanSend: value }));
                                }}
                            />
                        </View>,
                    )}

                {manages &&
                    inviteLink !== null &&
                    section(
                        t('chat.group.invite'),
                        <>
                            <ChatText style={[styles.padded, { color: c.muted, fontSize: 13 }]}>
                                {t('chat.group.invite-hint')}
                            </ChatText>
                            <ChatText selectable style={[styles.padded, styles.code, { color: c.inkSoft }]}>
                                {inviteLink}
                            </ChatText>
                            {share !== undefined && row(t('chat.group.invite-share'), () => share(inviteLink))}
                            {capabilities.copyText !== undefined &&
                                row(t(copied ? 'chat.group.invite-copied' : 'chat.group.invite-copy'), () => {
                                    capabilities.copyText?.(inviteLink);
                                    setCopied(true);
                                })}
                            {row(
                                t('chat.group.invite-reset'),
                                () => {
                                    confirm(
                                        t('chat.group.invite-reset'),
                                        t('chat.group.invite-reset-body'),
                                        t('chat.group.invite-reset'),
                                        () => {
                                            attempt(resetInvite.mutateAsync(conversationId));
                                        },
                                    );
                                },
                                'danger',
                            )}
                        </>,
                    )}

                {(isGroup || data.isGroup) &&
                    section(
                        `${t('chat.group.members')} · ${members.length}`,
                        <>
                            {manages &&
                                row(t('chat.group.add-people'), () => {
                                    setIsAdding(true);
                                })}
                            {members.map((participant) => (
                                <Pressable
                                    key={participant.userId}
                                    accessibilityRole={manages && !participant.isMe ? 'button' : undefined}
                                    accessibilityLabel={
                                        manages && !participant.isMe
                                            ? t('chat.group.member-options', { name: participant.displayName })
                                            : undefined
                                    }
                                    disabled={!manages || participant.isMe}
                                    onPress={() => {
                                        setMember(participant);
                                    }}
                                    style={[styles.member, { borderBottomColor: c.line }]}
                                >
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <ChatText style={{ fontSize: 16, color: c.ink }} numberOfLines={1}>
                                            {participant.isMe ? t('chat.common.you') : participant.displayName}
                                        </ChatText>
                                        {participant.handle !== null && (
                                            <ChatText style={{ fontSize: 13, color: c.muted }} numberOfLines={1}>
                                                @{participant.handle}
                                            </ChatText>
                                        )}
                                    </View>
                                    {isGroup && participant.role !== ChatParticipantRole.MEMBER && (
                                        <ChatText
                                            style={[styles.badge, { backgroundColor: c.raised, color: c.inkSoft }]}
                                        >
                                            {roleLabel(participant.role)}
                                        </ChatText>
                                    )}
                                    {participant.label !== null && (
                                        <ChatText
                                            style={[styles.badge, { backgroundColor: c.raised, color: c.inkSoft }]}
                                        >
                                            {participant.label}
                                        </ChatText>
                                    )}
                                </Pressable>
                            ))}
                        </>,
                    )}

                {section(
                    t('chat.action.details'),
                    <>
                        {muted
                            ? row(t('chat.action.unmute'), () => {
                                  attempt(settings.mute(null));
                              })
                            : MUTE_DURATIONS.map((duration) =>
                                  row(
                                      t(
                                          duration === '8h'
                                              ? 'chat.action.mute-8h'
                                              : duration === 'week'
                                                ? 'chat.action.mute-week'
                                                : 'chat.action.mute-always',
                                      ),
                                      () => {
                                          attempt(settings.mute(duration));
                                      },
                                      'default',
                                      `mute-${duration}`,
                                  ),
                              )}
                        {row(t(data.isPinned ? 'chat.action.unpin' : 'chat.action.pin'), () => {
                            attempt(settings.pin(!data.isPinned));
                        })}
                        {row(t(data.isArchived ? 'chat.action.unarchive' : 'chat.action.archive'), () => {
                            attempt(settings.archive(!data.isArchived));
                        })}
                        {isGroup &&
                            data.canSend !== false &&
                            row(
                                t('chat.action.leave'),
                                () => {
                                    confirm(
                                        t('chat.group.leave-title'),
                                        t('chat.group.leave-body'),
                                        t('chat.action.leave'),
                                        () => {
                                            attempt(settings.leave(), onGone);
                                        },
                                    );
                                },
                                'danger',
                            )}
                        {row(
                            t('chat.action.delete-conversation'),
                            () => {
                                confirm(
                                    t('chat.delete-conversation.title'),
                                    t('chat.delete-conversation.body'),
                                    t('chat.delete-conversation.confirm'),
                                    () => {
                                        attempt(settings.deleteForMe(), onGone);
                                    },
                                );
                            },
                            'danger',
                        )}
                    </>,
                )}
            </ScrollView>

            <Modal
                visible={member !== null}
                transparent
                animationType="slide"
                onRequestClose={() => {
                    setMember(null);
                }}
            >
                <Pressable
                    accessibilityLabel={t('chat.common.close')}
                    style={styles.scrim}
                    onPress={() => {
                        setMember(null);
                    }}
                />
                {member !== null && (
                    <View style={[styles.sheet, { backgroundColor: c.surface }]}>
                        <ChatText style={styles.sheetTitle}>{member.displayName}</ChatText>
                        {isOwner &&
                            member.role !== ChatParticipantRole.OWNER &&
                            row(
                                t(
                                    member.role === ChatParticipantRole.ADMIN
                                        ? 'chat.group.make-member'
                                        : 'chat.group.make-admin',
                                ),
                                () => {
                                    attempt(
                                        updateRole.mutateAsync({
                                            conversationId,
                                            userId: member.userId,
                                            role:
                                                member.role === ChatParticipantRole.ADMIN
                                                    ? ChatParticipantRole.MEMBER
                                                    : ChatParticipantRole.ADMIN,
                                        }),
                                    );
                                    setMember(null);
                                },
                            )}
                        {isOwner &&
                            member.role !== ChatParticipantRole.OWNER &&
                            row(t('chat.group.make-owner'), () => {
                                attempt(
                                    updateRole.mutateAsync({
                                        conversationId,
                                        userId: member.userId,
                                        role: ChatParticipantRole.OWNER,
                                    }),
                                );
                                setMember(null);
                            })}
                        {(isOwner || member.role === ChatParticipantRole.MEMBER) &&
                            row(
                                t('chat.group.remove'),
                                () => {
                                    attempt(removeMember.mutateAsync({ conversationId, userId: member.userId }));
                                    setMember(null);
                                },
                                'danger',
                            )}
                        {row(t('chat.common.cancel'), () => {
                            setMember(null);
                        })}
                    </View>
                )}
            </Modal>

            <Modal
                visible={isAdding}
                animationType="slide"
                onRequestClose={() => {
                    setIsAdding(false);
                }}
            >
                <View style={[styles.screen, { backgroundColor: c.canvas }]}>
                    <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.line }]}>
                        <ChatText style={styles.headerTitle}>{t('chat.group.add-people')}</ChatText>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                                setIsAdding(false);
                                setQuery('');
                            }}
                            hitSlop={8}
                        >
                            <ChatText style={{ color: c.accent, fontSize: 16 }}>{t('chat.common.close')}</ChatText>
                        </Pressable>
                    </View>
                    <View style={styles.padded}>
                        <TextInput
                            value={query}
                            autoFocus
                            accessibilityLabel={t('chat.people.search')}
                            placeholder={t('chat.people.search-placeholder')}
                            placeholderTextColor={c.faint}
                            onChangeText={setQuery}
                            style={[styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.surface }]}
                        />
                    </View>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        {search.results
                            .filter((person) => !memberIds.has(person.userId))
                            .map((person) => (
                                <Pressable
                                    key={person.userId}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${t('chat.people.add')}: ${person.displayName}`}
                                    onPress={() => {
                                        attempt(addMembers.mutateAsync({ conversationId, userIds: [person.userId] }));
                                    }}
                                    style={[styles.member, { borderBottomColor: c.line }]}
                                >
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <ChatText style={{ fontSize: 16, color: c.ink }} numberOfLines={1}>
                                            {person.displayName}
                                        </ChatText>
                                        {person.handle !== null && (
                                            <ChatText style={{ fontSize: 13, color: c.muted }}>
                                                @{person.handle}
                                            </ChatText>
                                        )}
                                    </View>
                                    <ChatText style={{ color: c.accent, fontSize: 15, fontWeight: '600' }}>
                                        {t('chat.people.add')}
                                    </ChatText>
                                </Pressable>
                            ))}
                        {search.isActive && !search.isFetching && search.results.length === 0 && (
                            <ChatText style={[styles.padded, { color: c.muted }]}>{t('chat.people.empty')}</ChatText>
                        )}
                    </ScrollView>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    back: { width: 32, alignItems: 'center' },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
    body: { padding: 16, gap: 16 },
    identity: { alignItems: 'center', gap: 6 },
    avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
    editRow: { alignSelf: 'stretch', gap: 4 },
    input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
    multiline: { minHeight: 88, textAlignVertical: 'top' },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end' },
    problem: { textAlign: 'center', fontSize: 14 },
    section: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
    sectionTitle: { fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    padded: { paddingHorizontal: 16, paddingVertical: 10 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    code: { fontFamily: 'Courier', fontSize: 13 },
    row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    member: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    badge: { fontSize: 12, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
    scrim: { flex: 1, backgroundColor: 'rgba(17, 23, 41, 0.4)' },
    sheet: { paddingTop: 12, paddingBottom: 28, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    sheetTitle: { fontSize: 18, fontWeight: '600', paddingHorizontal: 20, paddingBottom: 4 },
});
