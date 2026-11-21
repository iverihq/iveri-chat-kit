import type { UUID } from '@iveri/contracts';
import { ChatCallDirection, ChatCallKind, type ChatCallHistoryEntry } from '@iveri/contracts/chat';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

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

import { ChatText } from './ChatText.js';
import { useChatNative } from './native-context.js';

export interface ChatCallHistoryScreenProps {
    /** Opens the conversation a call was in. */
    onSelectConversation?: (conversationId: UUID) => void;
}

/**
 * My calls on a phone, newest first, with a Missed folder; the same rows as the web list. A missed call is in the
 * critical colour and says so in words. Inside a call layer each row calls back the same way.
 */
export function ChatCallHistoryScreen({
    onSelectConversation,
}: Readonly<ChatCallHistoryScreenProps>): React.JSX.Element {
    const t = useChatText();
    const { translate, locale, timeZone } = useChatContext();
    const { theme } = useChatNative();
    const c = theme.color;
    const now = useNow();
    const calls = useChatCallController();
    const [missedOnly, setMissedOnly] = useState(false);
    const history = useCallHistory({ missedOnly });

    const renderRow = ({ item: entry }: { item: ChatCallHistoryEntry }): React.JSX.Element => {
        const outcome = callHistoryOutcome(entry);
        const isMissed = outcome === 'missed';
        const duration = entry.durationSeconds === null ? null : formatDuration(entry.durationSeconds * 1000);
        const arrow = entry.direction === ChatCallDirection.OUTGOING ? '↗' : '↙';

        return (
            <View style={[styles.row, { borderBottomColor: c.line }]}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.calls.open-chat', { name: entry.title })}
                    disabled={onSelectConversation === undefined}
                    onPress={() => onSelectConversation?.(entry.conversationId)}
                    style={styles.rowText}
                >
                    <ChatText style={{ fontSize: 16, fontWeight: '600', color: isMissed ? c.critical : c.ink }}>
                        {entry.title}
                    </ChatText>
                    <ChatText style={{ fontSize: 14, color: isMissed ? c.critical : c.muted }}>
                        {`${arrow} ${t(CALL_HISTORY_KEYS[outcome], { kind: entry.kind })}${duration === null ? '' : ` · ${duration}`}`}
                    </ChatText>
                    <ChatText style={{ fontSize: 12, color: c.faint }}>
                        {`${formatDayLabel(entry.createdAt, translate, { locale, timeZone, now })} · ${formatMessageTime(entry.createdAt, { locale, timeZone })}`}
                    </ChatText>
                </Pressable>
                {calls !== null && (
                    <Pressable
                        accessibilityRole="button"
                        hitSlop={6}
                        onPress={() => {
                            calls.startCall(entry.conversationId, entry.kind);
                        }}
                        style={[styles.callButton, { borderColor: c.line }]}
                    >
                        <ChatText style={{ fontSize: 13, fontWeight: '600', color: c.ink }}>
                            {t(entry.kind === ChatCallKind.VIDEO ? 'chat.call.start-video' : 'chat.call.start-voice')}
                        </ChatText>
                    </Pressable>
                )}
            </View>
        );
    };

    return (
        <View style={[styles.screen, { backgroundColor: c.canvas }]}>
            <View style={[styles.folders, { backgroundColor: c.sunken }]}>
                {[false, true].map((missed) => (
                    <Pressable
                        key={String(missed)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: missedOnly === missed }}
                        onPress={() => {
                            setMissedOnly(missed);
                        }}
                        style={[styles.folder, missedOnly === missed && { backgroundColor: c.surface }]}
                    >
                        <ChatText
                            style={{ fontSize: 14, fontWeight: '500', color: missedOnly === missed ? c.ink : c.muted }}
                        >
                            {t(missed ? 'chat.calls.missed' : 'chat.calls.all')}
                        </ChatText>
                    </Pressable>
                ))}
            </View>
            {history.isLoading ? (
                <ActivityIndicator
                    accessibilityLabel={t('chat.common.loading')}
                    color={c.accent}
                    style={styles.state}
                />
            ) : history.isError ? (
                <Pressable accessibilityRole="button" onPress={history.refetch} style={styles.state}>
                    <ChatText style={{ color: c.inkSoft, textAlign: 'center' }}>
                        {history.error === null ? t('chat.calls.error') : describeError(history.error, translate)}
                    </ChatText>
                    <ChatText style={{ color: c.accent, textAlign: 'center', marginTop: 8 }}>
                        {t('chat.common.retry')}
                    </ChatText>
                </Pressable>
            ) : (
                <FlatList
                    data={history.calls}
                    keyExtractor={(entry) => entry.id}
                    renderItem={renderRow}
                    onRefresh={history.refetch}
                    refreshing={false}
                    onEndReached={() => {
                        if (history.hasMore && !history.isLoadingMore) history.loadMore();
                    }}
                    ListEmptyComponent={
                        <ChatText style={[styles.state, { color: c.muted, textAlign: 'center' }]}>
                            {t(missedOnly ? 'chat.calls.empty-missed' : 'chat.calls.empty')}
                        </ChatText>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    folders: { flexDirection: 'row', gap: 2, margin: 12, padding: 2, borderRadius: 10 },
    folder: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowText: { flex: 1, minWidth: 0, gap: 2 },
    callButton: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    state: { padding: 32 },
});
