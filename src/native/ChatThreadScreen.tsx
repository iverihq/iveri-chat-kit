import type { Nullable, UUID } from '@iveri/contracts';
import {
    CHAT_QUICK_REACTIONS,
    ChatConversationKind,
    ChatParticipantStatus,
    ChatReportReason,
    ChatReportTarget,
} from '@iveri/contracts/chat';
import type { ChatAttachment, ChatMessage } from '@iveri/contracts/chat';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';

import { useChatContext, useChatRealtime, useChatText, useNow } from '../provider/index.js';
import {
    useConversation,
    useDeleteMessage,
    useMarkRead,
    useMessages,
    useReaction,
    useReport,
    useSendMessage,
    useTypingPeople,
} from '../query/index.js';
import {
    conversationHeading,
    describeError,
    firstUnreadKey,
    formatDayLabel,
    formatLastActive,
    groupMessages,
    messagePermissions,
    shouldPinToNewest,
    myReaction,
    systemNoticeText,
    threadRows,
    typingText,
    type ChatThreadRow,
} from '../util/index.js';

import { ChatComposer, type NativeComposerMode } from './ChatComposer.js';
import { ChatText } from './ChatText.js';
import { MessageBubble } from './MessageBubble.js';
import { useChatNative } from './native-context.js';

export interface ChatThreadScreenProps {
    conversationId: UUID;
    /** Draws a back control in the header. Off when the app's own navigator draws one. */
    onBack?: () => void;
    /** The back control's name, already translated: "Back to the ride" in an embedding. */
    backLabel?: string;
    showHeader?: boolean;
}

type Sheet =
    | { type: 'actions'; message: ChatMessage }
    | { type: 'report'; message: ChatMessage }
    | { type: 'photo'; photo: ChatAttachment };

/**
 * One conversation on a phone. An inverted list, so the newest message sits above the composer and the
 * keyboard pushes the conversation up rather than covering it; a long press opens a message's actions in
 * a sheet; reaching the top loads older messages.
 */
export function ChatThreadScreen({
    conversationId,
    onBack,
    backLabel,
    showHeader = true,
}: Readonly<ChatThreadScreenProps>): React.JSX.Element {
    const t = useChatText();
    const { translate, locale, timeZone, currentUserId } = useChatContext();
    const { theme, capabilities } = useChatNative();
    const c = theme.color;
    const now = useNow();
    useChatRealtime();
    const conversation = useConversation(conversationId);
    const messages = useMessages(conversationId);
    const markRead = useMarkRead(conversationId);
    const reaction = useReaction(conversationId);
    const deletion = useDeleteMessage(conversationId);
    const sender = useSendMessage(conversationId);
    const report = useReport();
    const typing = useTypingPeople(conversationId);
    const [mode, setMode] = useState<Nullable<NativeComposerMode>>(null);
    const [sheet, setSheet] = useState<Nullable<Sheet>>(null);
    const [opened, setOpened] = useState<Nullable<{ id: UUID; seq: number }>>(null);
    const data = conversation.data;

    const list = useRef<FlatList<ChatThreadRow>>(null);
    const atNewest = useRef(true);
    const previousNewestKey = useRef<Nullable<string>>(null);

    if (data !== undefined && opened?.id !== conversationId) setOpened({ id: conversationId, seq: data.myLastReadSeq });

    const rows = useMemo(() => {
        if (data === undefined) return [];
        const dividerKey = firstUnreadKey(messages.items, opened?.seq ?? data.myLastReadSeq);
        const others = data.participants.filter(
            (participant) => !participant.isMe && participant.status === ChatParticipantStatus.ACTIVE,
        );
        const sections = groupMessages(messages.items, {
            myUserId: currentUserId ?? null,
            timeZone,
            breakBefore: dividerKey,
        });

        return threadRows(sections, {
            dividerKey,
            showsSenders: data.kind === ChatConversationKind.GROUP || others.length > 1,
        }).reverse();
    }, [data, messages.items, opened, currentUserId, timeZone]);

    // The list is inverted, so offset 0 is the newest message. Kept there explicitly when the newest row
    // changes and the reader was at the bottom or sent it: a list that only relies on the platform keeping
    // its offset was seen in the web build to jump to the oldest message after a send.
    useEffect(() => {
        const newest = rows.find(
            (row): row is Extract<ChatThreadRow, { item: unknown }> => row.type === 'message' || row.type === 'notice',
        );
        const newestKey = newest?.key ?? null;
        const item = newest?.item ?? null;
        const newestIsOwn = item !== null && (item.type === 'pending' || item.message.isOwn);
        if (
            shouldPinToNewest({
                previousNewestKey: previousNewestKey.current,
                newestKey,
                wasAtNewest: atNewest.current,
                newestIsOwn,
            })
        ) {
            // Not animated: the new message has to be on screen in the very next paint, not after a glide.
            list.current?.scrollToOffset({ offset: 0, animated: false });
            atNewest.current = true;
        }
        previousNewestKey.current = newestKey;
    }, [rows]);

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
    const subtitle =
        heading.subtitle ??
        (data.kind === ChatConversationKind.GROUP
            ? t('chat.thread.members', { count: data.memberCount })
            : heading.lastActiveAt === null
              ? null
              : formatLastActive(heading.lastActiveAt, translate, { locale, timeZone, now }));
    const typingNames = typing
        .map((userId) => data.participants.find((participant) => participant.userId === userId)?.displayName ?? '')
        .filter((name) => name.length > 0);
    const typingLine = typingText(typingNames, translate);
    const newestSeq = messages.window.messages.at(-1)?.seq ?? 0;

    const renderRow = ({ item: row }: { item: ChatThreadRow }): React.JSX.Element => {
        if (row.type === 'day') {
            return (
                <View style={styles.day}>
                    <ChatText
                        style={[styles.dayText, { color: c.muted, backgroundColor: c.surface, borderColor: c.line }]}
                    >
                        {formatDayLabel(row.sentAt, translate, { locale, timeZone, now })}
                    </ChatText>
                </View>
            );
        }
        if (row.type === 'new-messages') {
            return (
                <View style={styles.divider}>
                    <View style={[styles.rule, { backgroundColor: c.accentLine }]} />
                    <ChatText style={[styles.caption, { color: c.accent, fontWeight: '600' }]}>
                        {t('chat.thread.new-messages')}
                    </ChatText>
                    <View style={[styles.rule, { backgroundColor: c.accentLine }]} />
                </View>
            );
        }
        if (row.type === 'notice') {
            const message = row.item.type === 'message' ? row.item.message : null;

            const notice =
                message === null ? '' : systemNoticeText(message.systemKey ?? '', message.systemVariables, translate);

            // One element with a role and the sentence as its name, so a screen reader reaches a notice the way
            // it reaches a message; inside an inverted list on the web the bare text was missing from the tree.
            return (
                <View style={styles.notice} accessible accessibilityRole="text" accessibilityLabel={notice}>
                    <ChatText style={[styles.noticeText, { color: c.inkSoft, backgroundColor: c.sunken }]}>
                        {notice}
                    </ChatText>
                </View>
            );
        }
        const senderName =
            row.showSender && row.item.type === 'message' ? (row.item.message.sender?.displayName ?? null) : null;

        return (
            <View style={styles.messageRow}>
                <MessageBubble
                    item={row.item}
                    conversation={data}
                    position={row.position}
                    senderName={senderName}
                    onLongPress={(message) => {
                        setSheet({ type: 'actions', message });
                    }}
                    onReact={(messageId, emoji) => {
                        reaction.mutate({ messageId, emoji });
                    }}
                    onJumpTo={() => undefined}
                    onOpenPhoto={(photo) => {
                        setSheet({ type: 'photo', photo });
                    }}
                    onRetry={(clientMessageId) => {
                        void sender.retry(clientMessageId);
                    }}
                    onDiscard={sender.discard}
                />
            </View>
        );
    };

    const sheetMessage = sheet?.type === 'actions' || sheet?.type === 'report' ? sheet.message : null;
    const permissions = sheetMessage === null ? null : messagePermissions(sheetMessage, data, now);
    const closeSheet = (): void => {
        setSheet(null);
    };
    const act = (label: string, run: () => void, tone: 'default' | 'danger' = 'default'): React.JSX.Element => (
        <Pressable
            key={label}
            accessibilityRole="button"
            onPress={() => {
                closeSheet();
                run();
            }}
            style={({ pressed }) => [styles.sheetItem, pressed && { backgroundColor: c.raised }]}
        >
            <ChatText style={{ fontSize: 16, color: tone === 'danger' ? c.critical : c.ink }}>{label}</ChatText>
        </Pressable>
    );

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.screen, { backgroundColor: c.canvas }]}
        >
            {showHeader && (
                <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.line }]}>
                    {onBack !== undefined && (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={backLabel ?? t('chat.thread.back')}
                            onPress={onBack}
                            hitSlop={10}
                            style={styles.back}
                        >
                            <ChatText style={{ fontSize: 22, color: c.ink }}>‹</ChatText>
                        </Pressable>
                    )}
                    <View style={styles.headerText}>
                        <View style={styles.titleRow}>
                            <ChatText style={styles.headerTitle} numberOfLines={1}>
                                {heading.title}
                            </ChatText>
                            {heading.label !== null && (
                                <ChatText style={[styles.label, { backgroundColor: c.raised, color: c.inkSoft }]}>
                                    {heading.label}
                                </ChatText>
                            )}
                        </View>
                        {subtitle !== null && (
                            <ChatText style={[styles.caption, { color: c.muted }]} numberOfLines={1}>
                                {subtitle}
                            </ChatText>
                        )}
                    </View>
                </View>
            )}
            <FlatList
                ref={list}
                inverted
                style={styles.listFrame}
                data={rows}
                keyExtractor={(row) => row.key}
                renderItem={renderRow}
                accessibilityLabel={t('chat.thread.messages')}
                contentContainerStyle={styles.list}
                onEndReached={() => {
                    if (messages.hasOlder && !messages.isLoadingOlder) void messages.loadOlder();
                }}
                onScroll={(event) => {
                    atNewest.current = event.nativeEvent.contentOffset.y < 48;
                    if (atNewest.current && !data.isRequest && newestSeq > data.myLastReadSeq) markRead(newestSeq);
                }}
                onContentSizeChange={() => {
                    if (!data.isRequest && newestSeq > data.myLastReadSeq) markRead(newestSeq);
                }}
                scrollEventThrottle={250}
                ListFooterComponent={
                    messages.isLoadingOlder ? <ActivityIndicator color={c.accent} style={styles.older} /> : undefined
                }
                ListEmptyComponent={
                    messages.isLoading ? undefined : (
                        <View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
                            <ChatText style={{ fontSize: 18, fontWeight: '600' }}>{t('chat.thread.empty')}</ChatText>
                            <ChatText style={{ color: c.muted }}>{t('chat.thread.empty-hint')}</ChatText>
                        </View>
                    )
                }
            />
            <View accessibilityLiveRegion="polite" style={styles.typing}>
                {typingLine !== null && <ChatText style={[styles.caption, { color: c.muted }]}>{typingLine}</ChatText>}
            </View>
            <ChatComposer conversation={data} mode={mode} onModeChange={setMode} />

            <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={closeSheet}>
                <Pressable accessibilityLabel={t('chat.common.close')} style={styles.scrim} onPress={closeSheet} />
                {sheet?.type === 'photo' ? (
                    <View style={[styles.photoSheet, { backgroundColor: c.ink }]}>
                        <Image source={{ uri: sheet.photo.url }} resizeMode="contain" style={styles.photoFull} />
                        <Pressable accessibilityRole="button" onPress={closeSheet} style={styles.sheetItem}>
                            <ChatText style={{ color: c.surface, fontSize: 16 }}>{t('chat.common.close')}</ChatText>
                        </Pressable>
                    </View>
                ) : (
                    <View
                        style={[
                            styles.sheet,
                            {
                                backgroundColor: c.surface,
                                borderTopLeftRadius: theme.radius.panel,
                                borderTopRightRadius: theme.radius.panel,
                            },
                        ]}
                    >
                        {sheet?.type === 'actions' && permissions !== null && sheetMessage !== null && (
                            <>
                                {permissions.canReact && (
                                    <View accessibilityLabel={t('chat.reaction.quick')} style={styles.quick}>
                                        {CHAT_QUICK_REACTIONS.map((emoji) => {
                                            const mine = myReaction(sheetMessage.reactions) === emoji;

                                            return (
                                                <Pressable
                                                    key={emoji}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={t('chat.reaction.react-with', { emoji })}
                                                    accessibilityState={{ selected: mine }}
                                                    onPress={() => {
                                                        closeSheet();
                                                        reaction.mutate({
                                                            messageId: sheetMessage.id,
                                                            emoji: mine ? null : emoji,
                                                        });
                                                    }}
                                                    style={[
                                                        styles.quickButton,
                                                        mine && { backgroundColor: c.accentSoft },
                                                    ]}
                                                >
                                                    <ChatText style={{ fontSize: 24 }}>{emoji}</ChatText>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                )}
                                {permissions.canReply &&
                                    act(t('chat.action.reply'), () =>
                                        setMode({ type: 'reply', message: sheetMessage }),
                                    )}
                                {permissions.canCopy &&
                                    capabilities.copyText !== undefined &&
                                    act(t('chat.action.copy'), () => capabilities.copyText?.(sheetMessage.body ?? ''))}
                                {permissions.canEdit &&
                                    act(t('chat.action.edit'), () => setMode({ type: 'edit', message: sheetMessage }))}
                                {permissions.canReport &&
                                    act(t('chat.action.report'), () =>
                                        setSheet({ type: 'report', message: sheetMessage }),
                                    )}
                                {permissions.canDeleteForEveryone &&
                                    act(
                                        t('chat.action.delete-for-everyone'),
                                        () => deletion.mutate({ messageId: sheetMessage.id, scope: 'everyone' }),
                                        'danger',
                                    )}
                                {permissions.canDeleteForMe &&
                                    act(
                                        t('chat.action.delete-for-me'),
                                        () => deletion.mutate({ messageId: sheetMessage.id, scope: 'me' }),
                                        'danger',
                                    )}
                            </>
                        )}
                        {sheet?.type === 'report' && sheetMessage !== null && (
                            <>
                                <ChatText style={styles.sheetTitle}>{t('chat.report.title-message')}</ChatText>
                                <ChatText
                                    style={[
                                        styles.caption,
                                        { color: c.muted, paddingHorizontal: 20, paddingBottom: 8 },
                                    ]}
                                >
                                    {t('chat.report.disclosure')}
                                </ChatText>
                                {Object.values(ChatReportReason).map((reason) =>
                                    act(t(`chat.report.reason.${reason}`), () =>
                                        report.mutate({
                                            target: ChatReportTarget.MESSAGE,
                                            messageId: sheetMessage.id,
                                            reason,
                                            note: null,
                                        }),
                                    ),
                                )}
                            </>
                        )}
                        {act(t('chat.common.cancel'), () => undefined)}
                    </View>
                )}
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    back: { width: 32, alignItems: 'center' },
    headerText: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerTitle: { flexShrink: 1, fontSize: 18, fontWeight: '600' },
    label: {
        fontSize: 12,
        fontWeight: '500',
        paddingHorizontal: 8,
        paddingVertical: 1,
        borderRadius: 10,
        overflow: 'hidden',
    },
    // Bounded, so the list scrolls inside itself rather than growing the page around it.
    listFrame: { flex: 1, minHeight: 0 },
    list: { paddingHorizontal: 12, paddingVertical: 12 },
    messageRow: { paddingVertical: 3 },
    day: { alignItems: 'center', paddingVertical: 8 },
    dayText: {
        fontSize: 12,
        fontWeight: '500',
        paddingHorizontal: 12,
        paddingVertical: 2,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    rule: { flex: 1, height: 1 },
    notice: { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 24 },
    noticeText: {
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        overflow: 'hidden',
    },
    caption: { fontSize: 12 },
    typing: { minHeight: 22, paddingHorizontal: 16, justifyContent: 'center' },
    older: { paddingVertical: 12 },
    empty: { alignItems: 'center', gap: 6, paddingVertical: 64 },
    scrim: { flex: 1, backgroundColor: 'rgba(17, 23, 41, 0.4)' },
    sheet: { paddingTop: 12, paddingBottom: 28 },
    sheetTitle: { fontSize: 18, fontWeight: '600', paddingHorizontal: 20, paddingBottom: 4 },
    sheetItem: { paddingHorizontal: 20, paddingVertical: 14 },
    quick: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingBottom: 8 },
    quickButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    photoSheet: { flex: 4, paddingBottom: 24 },
    photoFull: { flex: 1, width: '100%' },
});
