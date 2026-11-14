import type { Nullable } from '@iveri/contracts';
import {
    CHAT_ATTACHMENT_MAX_BYTES,
    CHAT_ATTACHMENTS_PER_MESSAGE,
    CHAT_MESSAGE_MAX_LENGTH,
    ChatAttachmentKind,
} from '@iveri/contracts/chat';
import type { ChatConversation, ChatMessage } from '@iveri/contracts/chat';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useChatContext, useChatText } from '../provider/index.js';
import {
    attachmentKindFor,
    useComposerAttachments,
    useConversationSettings,
    useEditMessage,
    useSendMessage,
    useTyping,
} from '../query/index.js';
import {
    canAcceptRequest,
    cannotSendText,
    describeError,
    encodeWaveformField,
    formatByteSize,
    formatDuration,
    replyExcerpt,
    toReplyPreview,
} from '../util/index.js';

import { ChatText } from './ChatText.js';
import { toUploadFile, useChatNative, type ChatPickedFile, type ChatVoiceRecording } from './native-context.js';

export type NativeComposerMode = { type: 'reply'; message: ChatMessage } | { type: 'edit'; message: ChatMessage };

export interface ChatComposerProps {
    conversation: ChatConversation;
    mode: Nullable<NativeComposerMode>;
    onModeChange: (mode: Nullable<NativeComposerMode>) => void;
}

/**
 * Writing on a phone: a growing field, a send button, photos and files from the app's own pickers, and a
 * voice note from the app's recorder. Every rule (sizes, counts, editing, the optimistic send) is the
 * headless half's, shared with the web composer; only the drawing differs.
 */
export function ChatComposer({ conversation, mode, onModeChange }: Readonly<ChatComposerProps>): React.JSX.Element {
    const t = useChatText();
    const { client, translate, locale } = useChatContext();
    const { theme, capabilities } = useChatNative();
    const sender = useSendMessage(conversation.id);
    const edit = useEditMessage(conversation.id);
    const typing = useTyping(conversation.id);
    const drafts = useComposerAttachments();
    const settings = useConversationSettings(conversation.id);
    const [text, setText] = useState('');
    const [notice, setNotice] = useState<Nullable<string>>(null);
    const [recording, setRecording] = useState<Nullable<{ handle: ChatVoiceRecording; startedAt: number }>>(null);
    const [elapsed, setElapsed] = useState(0);
    const [seenMode, setSeenMode] = useState(mode);
    const field = useRef<React.ComponentRef<typeof TextInput>>(null);

    if (seenMode !== mode) {
        setSeenMode(mode);
        if (mode?.type === 'edit') setText(mode.message.body ?? '');
        else if (seenMode?.type === 'edit') setText('');
    }

    useEffect(() => {
        if (mode !== null) field.current?.focus();
    }, [mode]);

    // The app going to the background with text still in the field tells the others I stopped, after a short delay;
    // coming back before it runs out sends nothing.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') typing.resume();
            else typing.leave();
        });

        return (): void => {
            subscription.remove();
        };
    }, [typing]);

    useEffect(() => {
        if (recording === null) return undefined;
        const timer = setInterval(() => {
            setElapsed(Date.now() - recording.startedAt);
        }, 250);

        return (): void => {
            clearInterval(timer);
        };
    }, [recording]);

    const c = theme.color;

    if (!conversation.canSend) {
        const reason = cannotSendText(conversation.refusal);
        const canAccept = canAcceptRequest(conversation);

        return (
            <View style={[styles.closed, { backgroundColor: c.sunken, borderTopColor: c.line }]}>
                <ChatText style={[styles.small, { color: c.inkSoft, textAlign: 'center' }]}>
                    {t(reason.key, reason.values)}
                </ChatText>
                {canAccept && (
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                            void settings.accept().catch(() => undefined);
                        }}
                        style={[styles.primary, { backgroundColor: c.accent }]}
                    >
                        <ChatText style={{ color: c.accentInk, fontWeight: '600' }}>
                            {t('chat.thread.request.accept')}
                        </ChatText>
                    </Pressable>
                )}
            </View>
        );
    }

    const isEditing = mode?.type === 'edit';
    const trimmed = text.trim();
    const isTooLong = text.length > CHAT_MESSAGE_MAX_LENGTH;
    const hasContent = trimmed.length > 0 || drafts.ready.length > 0;
    const canSubmit = !isTooLong && !drafts.isUploading && (isEditing ? trimmed.length > 0 : hasContent);
    const canRecord = capabilities.recordVoice !== undefined && !isEditing && !hasContent && drafts.drafts.length === 0;

    const addPicked = async (files: ChatPickedFile[] | null, kind: ChatAttachmentKind): Promise<void> => {
        setNotice(null);
        for (const file of files ?? []) {
            let upload;
            try {
                upload = await toUploadFile(file, Platform.OS);
            } catch (error: unknown) {
                setNotice(describeError(error, translate));
                break;
            }
            const refusal = drafts.add({
                file: upload,
                name: file.name,
                sizeBytes: file.size,
                kind: kind === ChatAttachmentKind.PHOTO ? kind : attachmentKindFor(file.type),
                previewUrl: kind === ChatAttachmentKind.PHOTO ? file.uri : null,
            });
            if (refusal !== null) {
                setNotice(
                    refusal.reason === 'too-large'
                        ? t('chat.composer.too-large', {
                              name: refusal.name,
                              size: formatByteSize(CHAT_ATTACHMENT_MAX_BYTES, locale),
                          })
                        : t('chat.composer.too-many', { max: CHAT_ATTACHMENTS_PER_MESSAGE }),
                );
                break;
            }
        }
    };

    const submit = async (): Promise<void> => {
        if (!canSubmit) return;
        setNotice(null);
        if (mode?.type === 'edit') {
            try {
                await edit.mutateAsync({ messageId: mode.message.id, body: trimmed });
                setText('');
                onModeChange(null);
            } catch (error: unknown) {
                setNotice(describeError(error, translate));
            }

            return;
        }
        const attachments = drafts.ready;
        const replyTo = mode?.type === 'reply' ? toReplyPreview(mode.message) : null;
        setText('');
        typing.stop();
        drafts.clear();
        onModeChange(null);
        await sender.send({ body: trimmed, attachments, replyTo });
    };

    const startRecording = async (): Promise<void> => {
        if (capabilities.recordVoice === undefined) return;
        setNotice(null);
        try {
            const handle = await capabilities.recordVoice();
            setElapsed(0);
            setRecording({ handle, startedAt: Date.now() });
        } catch {
            setNotice(t('chat.composer.microphone-denied'));
        }
    };

    const finishRecording = async (shouldSend: boolean): Promise<void> => {
        const current = recording;
        setRecording(null);
        if (current === null) return;
        if (!shouldSend) {
            await current.handle.cancel();

            return;
        }
        try {
            const voice = await current.handle.stop();
            if (voice === null) return;
            const attachment = await client.uploadAttachment(await toUploadFile(voice, Platform.OS), {
                kind: ChatAttachmentKind.VOICE,
                durationMs: Math.round(voice.durationMs),
                ...(voice.levels === undefined ? {} : { waveform: encodeWaveformField(voice.levels) }),
            });
            const replyTo = mode?.type === 'reply' ? toReplyPreview(mode.message) : null;
            onModeChange(null);
            await sender.send({ attachments: [attachment], replyTo });
        } catch (error: unknown) {
            setNotice(describeError(error, translate));
        }
    };

    if (recording !== null) {
        return (
            <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.line }]}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.composer.cancel-recording')}
                    onPress={() => {
                        void finishRecording(false);
                    }}
                    style={styles.iconButton}
                >
                    <ChatText style={{ color: c.critical, fontSize: 18 }}>✕</ChatText>
                </Pressable>
                <View accessibilityLiveRegion="polite" style={[styles.recording, { backgroundColor: c.criticalSoft }]}>
                    <View style={[styles.recordDot, { backgroundColor: c.critical }]} />
                    <ChatText style={{ color: c.critical, fontWeight: '500' }}>
                        {t('chat.composer.recording', { time: formatDuration(elapsed) })}
                    </ChatText>
                </View>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.composer.send-voice')}
                    onPress={() => {
                        void finishRecording(true);
                    }}
                    style={[styles.send, { backgroundColor: c.accent }]}
                >
                    <ChatText style={[styles.sendGlyph, { color: c.accentInk }]}>↑</ChatText>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={[styles.wrapper, { backgroundColor: c.surface, borderTopColor: c.line }]}>
            {mode !== null && (
                <View style={[styles.mode, { backgroundColor: c.accentSoft, borderLeftColor: c.accent }]}>
                    <View style={styles.modeText}>
                        <ChatText style={[styles.caption, { color: c.accent, fontWeight: '600' }]} numberOfLines={1}>
                            {mode.type === 'reply'
                                ? t('chat.composer.replying-to', {
                                      name: mode.message.sender?.displayName ?? t('chat.common.you'),
                                  })
                                : t('chat.composer.editing')}
                        </ChatText>
                        <ChatText style={[styles.small, { color: c.muted }]} numberOfLines={1}>
                            {replyExcerpt(toReplyPreview(mode.message), translate)}
                        </ChatText>
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t(
                            mode.type === 'reply' ? 'chat.composer.cancel-reply' : 'chat.composer.cancel-edit',
                        )}
                        onPress={() => {
                            onModeChange(null);
                        }}
                        hitSlop={10}
                    >
                        <ChatText style={{ color: c.muted, fontSize: 16 }}>✕</ChatText>
                    </Pressable>
                </View>
            )}
            {drafts.drafts.length > 0 && (
                <View style={styles.drafts}>
                    {drafts.drafts.map((draft) => (
                        <View
                            key={draft.localId}
                            style={[styles.draft, { borderColor: draft.status === 'failed' ? c.critical : c.line }]}
                        >
                            {draft.previewUrl === null ? (
                                <ChatText style={[styles.caption, { color: c.ink }]} numberOfLines={2}>
                                    {draft.name}
                                </ChatText>
                            ) : (
                                <Image source={{ uri: draft.previewUrl }} style={styles.draftImage} />
                            )}
                            {draft.status === 'uploading' && (
                                <ActivityIndicator
                                    accessibilityLabel={t('chat.composer.uploading', { name: draft.name })}
                                    color={c.accent}
                                    style={StyleSheet.absoluteFill}
                                />
                            )}
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={t('chat.composer.remove-attachment', { name: draft.name })}
                                onPress={() => {
                                    drafts.remove(draft.localId);
                                }}
                                style={[styles.draftRemove, { backgroundColor: c.ink }]}
                            >
                                <ChatText style={{ color: c.surface, fontSize: 10 }}>✕</ChatText>
                            </Pressable>
                        </View>
                    ))}
                </View>
            )}
            <View style={styles.row}>
                {!isEditing && capabilities.pickImage !== undefined && (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('chat.composer.attach-photo')}
                        onPress={() => {
                            void capabilities.pickImage?.().then((files) => {
                                void addPicked(files, ChatAttachmentKind.PHOTO);
                            });
                        }}
                        style={styles.iconButton}
                    >
                        <ChatText style={{ color: c.muted, fontSize: 20 }}>＋</ChatText>
                    </Pressable>
                )}
                {!isEditing && capabilities.pickFile !== undefined && (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('chat.composer.attach-file')}
                        onPress={() => {
                            void capabilities.pickFile?.().then((files) => {
                                void addPicked(files, ChatAttachmentKind.FILE);
                            });
                        }}
                        style={styles.iconButton}
                    >
                        <ChatText style={{ color: c.muted, fontSize: 17 }}>⎘</ChatText>
                    </Pressable>
                )}
                <TextInput
                    ref={field}
                    value={text}
                    multiline
                    accessibilityLabel={t('chat.composer.label')}
                    placeholder={t('chat.composer.placeholder')}
                    placeholderTextColor={c.faint}
                    onChangeText={(value) => {
                        setText(value);
                        if (isEditing) return;
                        if (value.trim().length > 0) typing.start();
                        else typing.stop();
                    }}
                    style={[
                        styles.input,
                        {
                            borderColor: c.line,
                            backgroundColor: c.canvas,
                            color: c.ink,
                            borderRadius: theme.radius.panel,
                        },
                    ]}
                />
                {canRecord ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('chat.composer.record')}
                        onPress={() => {
                            void startRecording();
                        }}
                        style={[styles.send, { backgroundColor: c.accentSoft }]}
                    >
                        <ChatText style={{ color: c.accent, fontSize: 18 }}>●</ChatText>
                    </Pressable>
                ) : (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t(isEditing ? 'chat.common.save' : 'chat.composer.send')}
                        accessibilityState={{ disabled: !canSubmit }}
                        disabled={!canSubmit}
                        onPress={() => {
                            void submit();
                        }}
                        style={[styles.send, { backgroundColor: c.accent, opacity: canSubmit ? 1 : 0.4 }]}
                    >
                        <ChatText style={[styles.sendGlyph, { color: c.accentInk }]}>{isEditing ? '✓' : '↑'}</ChatText>
                    </Pressable>
                )}
            </View>
            {(notice !== null || isTooLong) && (
                <ChatText
                    accessibilityRole="alert"
                    style={[styles.caption, { color: c.critical, paddingHorizontal: 6 }]}
                >
                    {notice ?? t('chat.composer.too-long', { max: CHAT_MESSAGE_MAX_LENGTH })}
                </ChatText>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 10,
        gap: 8,
    },
    closed: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10, alignItems: 'center' },
    bar: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 10,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    input: {
        flex: 1,
        minHeight: 44,
        maxHeight: 140,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingTop: 11,
        paddingBottom: 11,
        fontSize: 16,
    },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    sendGlyph: { fontSize: 20, fontWeight: '700' },
    primary: { borderRadius: 8, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center' },
    mode: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderLeftWidth: 3,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    modeText: { flex: 1 },
    drafts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    draft: {
        width: 64,
        height: 64,
        borderWidth: 1,
        borderRadius: 12,
        overflow: 'hidden',
        justifyContent: 'center',
        padding: 4,
    },
    draftImage: { ...StyleSheet.absoluteFill },
    draftRemove: {
        position: 'absolute',
        top: 3,
        right: 3,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recording: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 11,
    },
    recordDot: { width: 10, height: 10, borderRadius: 5 },
    caption: { fontSize: 12, lineHeight: 16 },
    small: { fontSize: 14, lineHeight: 20 },
});
