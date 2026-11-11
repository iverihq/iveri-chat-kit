import type { Maybe, UUID } from '@iveri/contracts';
import type { ChatConversationSummary, ChatInboxFolder } from '@iveri/contracts/chat';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useChatContext, useChatRealtime, useChatText, useNow } from '../provider/index.js';
import { isMuted, useInbox } from '../query/index.js';
import {
    conversationHeading,
    formatInboxTime,
    formatUnreadBadge,
    initialsOf,
    lastMessageExcerpt,
} from '../util/index.js';

import { ChatText } from './ChatText.js';
import { useChatNative } from './native-context.js';

const FOLDERS: readonly ChatInboxFolder[] = ['inbox', 'requests', 'archived'];

export interface ChatInboxScreenProps {
    onSelectConversation: (conversationId: UUID) => void;
    product?: Maybe<string>;
    showFolders?: boolean;
}

function Row({
    conversation,
    now,
    onPress,
}: Readonly<{ conversation: ChatConversationSummary; now: Date; onPress: () => void }>): React.JSX.Element {
    const t = useChatText();
    const { translate, locale, timeZone } = useChatContext();
    const { theme } = useChatNative();
    const c = theme.color;
    const heading = conversationHeading(conversation, translate);
    const isUnread = conversation.unreadCount > 0;
    const muted = isMuted(conversation.mutedUntil, now);
    const badge = formatUnreadBadge(conversation.unreadCount, locale);
    const excerpt = lastMessageExcerpt(conversation.lastMessage, translate, {
        // A sender's name only helps where more than two people talk: in a ride's chat it is the title already.
        isGroup: conversation.isGroup || conversation.memberCount > 2,
    });

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={[
                heading.title,
                excerpt,
                badge.length > 0 ? t('chat.inbox.unread', { count: conversation.unreadCount }) : '',
            ]
                .filter((part) => part.length > 0)
                .join('. ')}
            onPress={onPress}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.raised }]}
        >
            {heading.avatar === null ? (
                <View style={[styles.avatar, { backgroundColor: c.accentSoft, borderColor: c.accentLine }]}>
                    <ChatText style={{ color: c.accent, fontWeight: '600' }}>{initialsOf(heading.title)}</ChatText>
                </View>
            ) : (
                <Image
                    source={{ uri: heading.avatar.thumbnailUrl }}
                    style={[styles.avatar, { borderColor: c.accentLine }]}
                />
            )}
            <View style={styles.rowBody}>
                <View style={styles.line}>
                    <ChatText style={[styles.title, { fontWeight: isUnread ? '600' : '500' }]} numberOfLines={1}>
                        {heading.title}
                    </ChatText>
                    {heading.label !== null && (
                        <ChatText style={[styles.caption, { color: c.muted }]} numberOfLines={1}>
                            {heading.label}
                        </ChatText>
                    )}
                    <ChatText style={[styles.caption, styles.time, { color: isUnread && !muted ? c.accent : c.faint }]}>
                        {conversation.lastMessage === null
                            ? ''
                            : formatInboxTime(conversation.lastMessage.sentAt, translate, { locale, timeZone, now })}
                    </ChatText>
                </View>
                {heading.subtitle !== null && (
                    <ChatText style={[styles.caption, { color: c.muted }]} numberOfLines={1}>
                        {heading.subtitle}
                    </ChatText>
                )}
                <View style={styles.line}>
                    <ChatText
                        style={[
                            styles.excerpt,
                            { color: isUnread ? c.inkSoft : c.muted, fontWeight: isUnread ? '500' : '400' },
                        ]}
                        numberOfLines={1}
                    >
                        {excerpt}
                    </ChatText>
                    {conversation.isPinned && (
                        <ChatText style={[styles.caption, { color: c.faint }]}>{t('chat.inbox.pinned')}</ChatText>
                    )}
                    {badge.length > 0 && (
                        <View style={[styles.badge, { backgroundColor: muted ? c.lineStrong : c.accent }]}>
                            <ChatText style={[styles.badgeText, { color: muted ? c.inkSoft : c.accentInk }]}>
                                {badge}
                            </ChatText>
                        </View>
                    )}
                </View>
            </View>
        </Pressable>
    );
}

/** The inbox on a phone: three folders, pull to refresh, more on reaching the end. */
export function ChatInboxScreen({
    onSelectConversation,
    product,
    showFolders = true,
}: Readonly<ChatInboxScreenProps>): React.JSX.Element {
    const t = useChatText();
    const { theme } = useChatNative();
    const c = theme.color;
    const now = useNow();
    useChatRealtime();
    const [folder, setFolder] = useState<ChatInboxFolder>('inbox');
    const inbox = useInbox(folder, { product });

    return (
        <View style={[styles.screen, { backgroundColor: c.surface }]}>
            {showFolders && (
                <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: c.sunken }]}>
                    {FOLDERS.map((entry) => {
                        const isSelected = entry === folder;

                        return (
                            <Pressable
                                key={entry}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: isSelected }}
                                onPress={() => {
                                    setFolder(entry);
                                }}
                                style={[styles.tab, isSelected && { backgroundColor: c.surface }]}
                            >
                                <ChatText
                                    style={{
                                        fontSize: 14,
                                        fontWeight: isSelected ? '600' : '500',
                                        color: isSelected ? c.ink : c.muted,
                                    }}
                                >
                                    {t(`chat.inbox.tab.${entry}`)}
                                </ChatText>
                            </Pressable>
                        );
                    })}
                </View>
            )}
            {inbox.isLoading ? (
                <ActivityIndicator
                    accessibilityLabel={t('chat.common.loading')}
                    color={c.accent}
                    style={styles.center}
                />
            ) : (
                <FlatList
                    data={inbox.conversations}
                    keyExtractor={(conversation) => conversation.id}
                    renderItem={({ item }) => (
                        <Row
                            conversation={item}
                            now={now}
                            onPress={() => {
                                onSelectConversation(item.id);
                            }}
                        />
                    )}
                    refreshControl={
                        <RefreshControl refreshing={false} onRefresh={inbox.refetch} tintColor={c.accent} />
                    }
                    onEndReached={() => {
                        if (inbox.hasMore && !inbox.isLoadingMore) inbox.loadMore();
                    }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <ChatText style={[styles.emptyTitle, { color: c.ink }]}>
                                {inbox.isError ? t('chat.inbox.error') : t(`chat.inbox.empty.${folder}`)}
                            </ChatText>
                            {!inbox.isError && (
                                <ChatText style={[styles.excerpt, { color: c.muted, textAlign: 'center' }]}>
                                    {t(`chat.inbox.empty.${folder}-hint`)}
                                </ChatText>
                            )}
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    tabs: { flexDirection: 'row', margin: 12, padding: 2, borderRadius: 8, gap: 2 },
    tab: { flex: 1, minHeight: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1, gap: 2 },
    line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { flexShrink: 1, fontSize: 16 },
    time: { marginLeft: 'auto' },
    caption: { fontSize: 12 },
    excerpt: { flex: 1, fontSize: 14 },
    badge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeText: { fontSize: 11, fontWeight: '600' },
    center: { marginTop: 48 },
    empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 56, gap: 6 },
    emptyTitle: { fontSize: 18, fontWeight: '600' },
});
