import type { Nullable, UUID } from '@iveri/contracts';
import { ChatAttachmentKind, ChatMessageKind } from '@iveri/contracts/chat';
import type { ChatAttachment, ChatConversation, ChatMessage } from '@iveri/contracts/chat';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';

import { useChatContext, useChatText } from '../provider/index.js';
import {
    describeError,
    downsampleWaveform,
    formatByteSize,
    formatDuration,
    formatMessageTime,
    messageExcerpt,
    linkify,
    readStateOf,
    replyExcerpt,
    type ChatBubblePosition,
    type ChatReadState,
    type ChatThreadItem,
} from '../util/index.js';

import { ChatText } from './ChatText.js';
import { useChatNative, type ChatAudioPlayback, type ChatNativeTheme } from './native-context.js';

export interface MessageBubbleProps {
    item: ChatThreadItem;
    conversation: ChatConversation;
    position: ChatBubblePosition;
    senderName: Nullable<string>;
    onLongPress: (message: ChatMessage) => void;
    onReact: (messageId: UUID, emoji: Nullable<string>) => void;
    onJumpTo: (seq: number) => void;
    onOpenPhoto: (photo: ChatAttachment) => void;
    onRetry: (clientMessageId: UUID) => void;
    onDiscard: (clientMessageId: UUID) => void;
}

const TUCK = 5;

function cornerStyle(isOwn: boolean, position: ChatBubblePosition, round: number): object {
    if (position === 'single') return { borderRadius: round };
    const top = position === 'middle' || position === 'last' ? TUCK : round;
    const bottom = position === 'first' || position === 'middle' ? TUCK : round;

    return isOwn
        ? { borderRadius: round, borderTopRightRadius: top, borderBottomRightRadius: bottom }
        : { borderRadius: round, borderTopLeftRadius: top, borderBottomLeftRadius: bottom };
}

/** The read state as a small circle, drawn with views (no SVG in React Native's core): outline once sent, filled once read. */
function ReadDot({ state, theme }: Readonly<{ state: ChatReadState; theme: ChatNativeTheme }>): React.JSX.Element {
    const t = useChatText();
    const isRead = state.state === 'read' || state.state === 'read-by';
    const tint = state.state === 'failed' ? theme.color.critical : isRead ? theme.color.accent : theme.color.faint;
    const label =
        state.state === 'read-by'
            ? t('chat.message.read-by', { count: state.count })
            : t(`chat.message.${state.state}`);

    return (
        <View accessible accessibilityLabel={label} style={styles.readRow}>
            <View
                style={[
                    styles.readDot,
                    { borderColor: tint, borderStyle: state.state === 'sending' ? 'dashed' : 'solid' },
                    (isRead || state.state === 'failed') && { backgroundColor: tint },
                ]}
            >
                {state.state !== 'sending' && (
                    <ChatText
                        style={[
                            styles.readGlyph,
                            { color: isRead || state.state === 'failed' ? theme.color.surface : tint },
                        ]}
                    >
                        {state.state === 'failed' ? '!' : '✓'}
                    </ChatText>
                )}
            </View>
            {state.state === 'read-by' && <ChatText style={[styles.meta, { color: tint }]}>{state.count}</ChatText>}
        </View>
    );
}

function VoiceNote({ attachment, isOwn }: Readonly<{ attachment: ChatAttachment; isOwn: boolean }>): React.JSX.Element {
    const t = useChatText();
    const { capabilities, theme } = useChatNative();
    const [isPlaying, setIsPlaying] = useState(false);
    const playback = useRef<ChatAudioPlayback | null>(null);
    const bars = downsampleWaveform(attachment.waveform ?? [], 28);

    useEffect(
        () => (): void => {
            void playback.current?.stop();
        },
        [],
    );

    const toggle = async (): Promise<void> => {
        if (capabilities.playAudio === undefined) return;
        if (playback.current !== null) {
            await playback.current.stop();
            playback.current = null;
            setIsPlaying(false);

            return;
        }
        playback.current = await capabilities.playAudio(attachment.url, {
            onFinish: () => {
                playback.current = null;
                setIsPlaying(false);
            },
        });
        setIsPlaying(true);
    };

    return (
        <View style={styles.voice}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(isPlaying ? 'chat.voice.pause' : 'chat.voice.play')}
                disabled={capabilities.playAudio === undefined}
                onPress={() => {
                    void toggle();
                }}
                style={[styles.voiceButton, { backgroundColor: isOwn ? theme.color.accent : theme.color.accentSoft }]}
            >
                <ChatText
                    style={{
                        color: isOwn ? theme.color.accentInk : theme.color.accent,
                        fontSize: 14,
                        fontWeight: '700',
                    }}
                >
                    {isPlaying ? '❚❚' : '▶'}
                </ChatText>
            </Pressable>
            <View style={styles.voiceBody}>
                <View style={styles.waveform}>
                    {bars.map((level, index) => (
                        <View
                            key={`bar-${index}`}
                            style={[
                                styles.bar,
                                { height: `${Math.max(14, level)}%`, backgroundColor: theme.color.lineStrong },
                            ]}
                        />
                    ))}
                </View>
                <ChatText style={[styles.meta, { color: theme.color.muted }]}>
                    {formatDuration(attachment.durationMs ?? 0)}
                </ChatText>
            </View>
        </View>
    );
}

/**
 * One message on a phone: the same shapes as the web bubble, drawn with React Native's core views. A long
 * press opens the message's actions, which is what a phone has instead of hovering.
 */
export function MessageBubble({
    item,
    conversation,
    position,
    senderName,
    onLongPress,
    onReact,
    onJumpTo,
    onOpenPhoto,
    onRetry,
    onDiscard,
}: Readonly<MessageBubbleProps>): React.JSX.Element {
    const t = useChatText();
    const { translate, locale, timeZone } = useChatContext();
    const { theme, capabilities } = useChatNative();
    const message = item.type === 'message' ? item.message : null;
    const pending = item.type === 'pending' ? item.pending : null;
    const isOwn = message?.isOwn ?? true;
    const body = message?.body ?? pending?.body ?? null;
    const attachments = message?.attachments ?? pending?.attachments ?? [];
    const replyTo = message?.replyTo ?? pending?.replyTo ?? null;
    const sentAt = message?.sentAt ?? pending?.createdAt ?? '';
    const isDeleted = message?.isDeleted ?? false;
    const readState = readStateOf(item, conversation);
    // A pending message has no kind yet; what it carries says what it is.
    const KIND_OF_ATTACHMENT = {
        [ChatAttachmentKind.PHOTO]: ChatMessageKind.PHOTO,
        [ChatAttachmentKind.FILE]: ChatMessageKind.FILE,
        [ChatAttachmentKind.VOICE]: ChatMessageKind.VOICE,
    } as const;
    const firstAttachment = attachments.at(0);
    const kind =
        message?.kind ??
        (firstAttachment === undefined ? ChatMessageKind.TEXT : KIND_OF_ATTACHMENT[firstAttachment.kind]);
    // Every bubble has a name a screen reader can say: who, when, and what, rather than "button".
    const accessibleName = t('chat.message.label', {
        name: isOwn ? t('chat.common.you') : (message?.sender?.displayName ?? ''),
        time: sentAt.length > 0 ? formatMessageTime(sentAt, { locale, timeZone }) : '',
        text: messageExcerpt({ body, isDeleted, kind }, translate),
    });
    const openActions =
        message === null || isDeleted
            ? undefined
            : (): void => {
                  onLongPress(message);
              };
    const photos = attachments.filter((attachment) => attachment.kind === ChatAttachmentKind.PHOTO);
    const others = attachments.filter((attachment) => attachment.kind !== ChatAttachmentKind.PHOTO);

    return (
        <View style={[styles.column, isOwn ? styles.own : styles.other]}>
            {senderName !== null && (
                <ChatText style={[styles.sender, { color: theme.color.inkSoft }]}>{senderName}</ChatText>
            )}
            <Pressable
                accessibilityRole={message === null ? undefined : 'button'}
                accessibilityLabel={accessibleName}
                accessibilityHint={message === null ? undefined : t('chat.action.more')}
                // A browser has no long press worth relying on, so on the web build a tap opens the actions too.
                onPress={Platform.OS === 'web' ? openActions : undefined}
                delayLongPress={350}
                onLongPress={openActions}
                style={[
                    styles.bubble,
                    cornerStyle(isOwn, position, theme.radius.card),
                    isDeleted
                        ? { borderColor: theme.color.lineStrong, borderStyle: 'dashed', backgroundColor: 'transparent' }
                        : isOwn
                          ? { backgroundColor: theme.bubble.own, borderColor: theme.bubble.ownLine }
                          : { backgroundColor: theme.bubble.other, borderColor: theme.bubble.otherLine },
                    pending?.status === 'sending' && { opacity: 0.75 },
                    pending?.status === 'failed' && { borderColor: theme.color.critical },
                ]}
            >
                {isDeleted ? (
                    <ChatText style={[styles.body, { color: theme.color.muted, fontStyle: 'italic' }]}>
                        {t('chat.message.deleted')}
                    </ChatText>
                ) : (
                    <>
                        {replyTo !== null && (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={t('chat.message.reply-quote', { name: replyTo.senderName ?? '' })}
                                onPress={() => {
                                    onJumpTo(replyTo.seq);
                                }}
                                style={[
                                    styles.quote,
                                    {
                                        borderLeftColor: theme.color.accent,
                                        backgroundColor: isOwn ? theme.color.surface : theme.color.canvas,
                                    },
                                ]}
                            >
                                <ChatText style={[styles.quoteName, { color: theme.color.accent }]} numberOfLines={1}>
                                    {replyTo.senderName ?? ''}
                                </ChatText>
                                <ChatText style={[styles.quoteText, { color: theme.color.muted }]} numberOfLines={2}>
                                    {replyExcerpt(replyTo, translate)}
                                </ChatText>
                            </Pressable>
                        )}
                        {photos.length > 0 && (
                            <View style={styles.photos}>
                                {photos.map((photo) => (
                                    <Pressable
                                        key={photo.id}
                                        accessibilityRole="imagebutton"
                                        accessibilityLabel={t('chat.message.open-photo')}
                                        onPress={() => {
                                            onOpenPhoto(photo);
                                        }}
                                    >
                                        <Image
                                            source={{ uri: photo.thumbnailUrl ?? photo.url }}
                                            accessibilityLabel={t('chat.message.photo', { name: senderName ?? '' })}
                                            style={[styles.photo, photos.length === 1 && styles.photoSingle]}
                                        />
                                    </Pressable>
                                ))}
                            </View>
                        )}
                        {others.map((attachment) =>
                            attachment.kind === ChatAttachmentKind.VOICE ? (
                                <VoiceNote key={attachment.id} attachment={attachment} isOwn={isOwn} />
                            ) : (
                                <Pressable
                                    key={attachment.id}
                                    accessibilityRole="link"
                                    accessibilityLabel={t('chat.message.download', { name: attachment.fileName })}
                                    disabled={capabilities.openUrl === undefined}
                                    onPress={() => capabilities.openUrl?.(attachment.url)}
                                    style={[
                                        styles.file,
                                        { borderColor: theme.color.line, backgroundColor: theme.color.canvas },
                                    ]}
                                >
                                    <ChatText style={[styles.fileName, { color: theme.color.ink }]} numberOfLines={1}>
                                        {attachment.fileName}
                                    </ChatText>
                                    <ChatText style={[styles.meta, { color: theme.color.muted }]}>
                                        {formatByteSize(attachment.sizeBytes, locale)}
                                    </ChatText>
                                </Pressable>
                            ),
                        )}
                        {body !== null && body.length > 0 && (
                            <ChatText style={styles.body}>
                                {linkify(body).map((part, index) =>
                                    part.type === 'link' ? (
                                        <ChatText
                                            key={`link-${index}`}
                                            accessibilityRole="link"
                                            onPress={() => capabilities.openUrl?.(part.href)}
                                            style={{ color: theme.color.link, textDecorationLine: 'underline' }}
                                        >
                                            {part.text}
                                        </ChatText>
                                    ) : (
                                        part.text
                                    ),
                                )}
                            </ChatText>
                        )}
                    </>
                )}
                <View style={styles.metaRow}>
                    {message?.editedAt !== null && message?.editedAt !== undefined && !isDeleted && (
                        <ChatText style={[styles.meta, { color: theme.color.faint }]}>
                            {t('chat.message.edited')}
                        </ChatText>
                    )}
                    {sentAt.length > 0 && (
                        <ChatText style={[styles.meta, { color: theme.color.faint }]}>
                            {formatMessageTime(sentAt, { locale, timeZone })}
                        </ChatText>
                    )}
                    {readState !== null && <ReadDot state={readState} theme={theme} />}
                </View>
            </Pressable>
            {message !== null && message.reactions.length > 0 && (
                <View style={[styles.reactions, isOwn ? styles.own : styles.other]}>
                    {message.reactions.map((reaction) => (
                        <Pressable
                            key={reaction.emoji}
                            accessibilityRole="button"
                            accessibilityState={{ selected: reaction.isMine }}
                            accessibilityLabel={t('chat.reaction.count', {
                                count: reaction.count,
                                emoji: reaction.emoji,
                            })}
                            onPress={() => {
                                onReact(message.id, reaction.isMine ? null : reaction.emoji);
                            }}
                            style={[
                                styles.chip,
                                reaction.isMine
                                    ? { backgroundColor: theme.color.accentSoft, borderColor: theme.color.accentLine }
                                    : { backgroundColor: theme.color.surface, borderColor: theme.color.line },
                            ]}
                        >
                            <ChatText style={styles.chipText}>
                                {reaction.emoji}
                                {reaction.count > 1 ? ` ${reaction.count}` : ''}
                            </ChatText>
                        </Pressable>
                    ))}
                </View>
            )}
            {pending?.status === 'failed' && (
                <View style={styles.failed}>
                    <ChatText style={[styles.meta, { color: theme.color.critical }]}>
                        {t('chat.message.failed')}
                        {pending.error === null ? '' : ` · ${describeError(pending.error, translate)}`}
                    </ChatText>
                    <Pressable accessibilityRole="button" onPress={() => onRetry(pending.clientMessageId)} hitSlop={8}>
                        <ChatText style={[styles.metaStrong, { color: theme.color.link }]}>
                            {t('chat.common.retry')}
                        </ChatText>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => onDiscard(pending.clientMessageId)}
                        hitSlop={8}
                    >
                        <ChatText style={[styles.metaStrong, { color: theme.color.muted }]}>
                            {t('chat.message.discard')}
                        </ChatText>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    column: { maxWidth: '85%', gap: 2 },
    own: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    other: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    sender: { fontSize: 12, fontWeight: '600', paddingHorizontal: 4, marginBottom: 2 },
    bubble: { borderWidth: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 6 },
    body: { fontSize: 16, lineHeight: 22 },
    quote: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    quoteName: { fontSize: 12, fontWeight: '600' },
    quoteText: { fontSize: 14, lineHeight: 19 },
    photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    photo: { width: 120, height: 120, borderRadius: 10 },
    photoSingle: { width: 220, height: 180 },
    file: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minWidth: 180 },
    fileName: { fontSize: 14, fontWeight: '500' },
    voice: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
    voiceButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    voiceBody: { flex: 1, gap: 2 },
    waveform: { flexDirection: 'row', alignItems: 'center', height: 26, gap: 2 },
    bar: { flex: 1, borderRadius: 2 },
    metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
    meta: { fontSize: 11, lineHeight: 14 },
    metaStrong: { fontSize: 12, fontWeight: '600' },
    readRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    readDot: {
        width: 13,
        height: 13,
        borderRadius: 7,
        borderWidth: 1.4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    readGlyph: { fontSize: 8, lineHeight: 10, fontWeight: '700' },
    reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -6, paddingHorizontal: 8 },
    chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, height: 24, justifyContent: 'center' },
    chipText: { fontSize: 13 },
    failed: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 2,
    },
});
