import type { UUID } from '@iveri/contracts';
import { ChatCallStatus } from '@iveri/contracts/chat';
import { Pressable, StyleSheet, View } from 'react-native';

import { useChatCallController, useChatText } from '../provider/index.js';
import { useCurrentCall } from '../query/index.js';
import { callPeopleIn, isCallFull } from '../util/index.js';

import { ChatText } from './ChatText.js';
import { useChatNative } from './native-context.js';

/**
 * A group call going on in this conversation that I am not in, with Join (or that it is full): the phone's half of the
 * web's banner, drawn only inside a call layer and never for the call already on my screen.
 */
export function CallBanner({ conversationId }: Readonly<{ conversationId: UUID }>): React.JSX.Element | null {
    const t = useChatText();
    const { theme } = useChatNative();
    const calls = useChatCallController();
    const current = useCurrentCall(calls === null ? null : conversationId).data ?? null;

    if (
        calls === null ||
        current === null ||
        !current.isGroup ||
        current.status === ChatCallStatus.ENDED ||
        calls.activeCallId === current.id
    ) {
        return null;
    }

    const isFull = isCallFull(current);
    const isDisabled = isFull || calls.activeCallId !== null;

    return (
        <View
            accessibilityRole="summary"
            style={[styles.banner, { backgroundColor: theme.color.accentSoft, borderColor: theme.color.line }]}
        >
            <View style={styles.text}>
                <ChatText style={[styles.title, { color: theme.color.ink }]}>
                    {t('chat.call.in-progress', { kind: current.kind })}
                </ChatText>
                <ChatText style={{ color: theme.color.muted, fontSize: 13 }}>
                    {isFull ? t('chat.call.full') : t('chat.call.people', { count: callPeopleIn(current).length })}
                </ChatText>
            </View>
            <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isDisabled }}
                disabled={isDisabled}
                onPress={() => {
                    calls.joinCall(current.id);
                }}
                style={[styles.join, { backgroundColor: theme.color.accent, opacity: isDisabled ? 0.5 : 1 }]}
            >
                <ChatText style={styles.joinText}>{t('chat.call.join')}</ChatText>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    text: { flex: 1, gap: 2 },
    title: { fontSize: 15, fontWeight: '600' },
    join: { minHeight: 40, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    joinText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
