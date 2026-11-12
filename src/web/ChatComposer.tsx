import type { Nullable } from '@iveri/contracts';
import {
    CHAT_ATTACHMENT_MAX_BYTES,
    CHAT_ATTACHMENTS_PER_MESSAGE,
    CHAT_MESSAGE_MAX_LENGTH,
    ChatAttachmentKind,
} from '@iveri/contracts/chat';
import type { ChatConversation, ChatMessage } from '@iveri/contracts/chat';
import type { ClipboardEvent, DragEvent, KeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { useChatContext, useChatText } from '../provider/index.js';
import {
    attachmentKindFor,
    useComposerAttachments,
    useConversationSettings,
    useEditMessage,
    useSendMessage,
    useTyping,
    type ChatDraftRefusal,
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

import { ChatMenu } from './ChatMenu.js';
import {
    AttachIcon,
    CheckIcon,
    CloseIcon,
    EditIcon,
    FileIcon,
    MicIcon,
    PhotoIcon,
    ReplyIcon,
    SendIcon,
    TrashIcon,
} from './icons.js';
import { cn, FOCUS_RING, ICON_BUTTON, PRIMARY_BUTTON } from './style.js';
import { useVoiceRecorder } from './use-voice-recorder.js';

/** What the composer is doing besides writing a new message. */
export type ComposerMode = { type: 'reply'; message: ChatMessage } | { type: 'edit'; message: ChatMessage };

export interface ChatComposerProps {
    conversation: ChatConversation;
    mode: Nullable<ComposerMode>;
    onModeChange: (mode: Nullable<ComposerMode>) => void;
    autoFocus?: boolean;
    /**
     * What a person may attach here: photos, files, both (the default) or neither. An embedding limits it to
     * what its product allows, Taxi's ride chat to photos. Pasting and dropping follow the same rule.
     */
    attachmentKinds?: readonly (ChatAttachmentKind.PHOTO | ChatAttachmentKind.FILE)[];
    /** Whether a voice note can be recorded here. On by default. */
    allowVoice?: boolean;
}

const ALL_KINDS = [ChatAttachmentKind.PHOTO, ChatAttachmentKind.FILE] as const;

const MAX_HEIGHT_PX = 200;

function modeKeyOf(mode: Nullable<ComposerMode>): string {
    return mode === null ? 'none' : `${mode.type}:${mode.message.id}`;
}

/**
 * Where a message is written: text with Enter to send and Shift+Enter for a new line, photos and files
 * uploaded the moment they are chosen (or pasted, or dropped), a voice note recorded in place, and a strip
 * above the field when replying or editing. When the conversation does not accept messages, the composer
 * is replaced by the reason, and by the one action that would change it where there is one.
 */
export function ChatComposer({
    conversation,
    mode,
    onModeChange,
    autoFocus = false,
    attachmentKinds = ALL_KINDS,
    allowVoice = true,
}: Readonly<ChatComposerProps>): React.JSX.Element {
    const t = useChatText();
    const { client, translate, locale } = useChatContext();
    const sender = useSendMessage(conversation.id);
    const edit = useEditMessage(conversation.id);
    const notifyTyping = useTyping(conversation.id);
    const drafts = useComposerAttachments();
    const recorder = useVoiceRecorder();
    const settings = useConversationSettings(conversation.id);

    const [text, setText] = useState('');
    const [notice, setNotice] = useState<Nullable<string>>(null);
    const [isSendingVoice, setIsSendingVoice] = useState(false);
    const [seenModeKey, setSeenModeKey] = useState(modeKeyOf(mode));
    const field = useRef<HTMLTextAreaElement>(null);
    const photoInput = useRef<HTMLInputElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const previews = useRef(new Set<string>());
    const hintId = useId();

    // Entering edit mode loads the message's text; leaving it clears what was being edited. Adjusted during
    // render, React's own pattern for state that follows a prop, rather than in an effect a frame later.
    const modeKey = modeKeyOf(mode);
    if (seenModeKey !== modeKey) {
        setSeenModeKey(modeKey);
        if (mode?.type === 'edit') setText(mode.message.body ?? '');
        else if (seenModeKey.startsWith('edit:')) setText('');
    }

    useEffect(() => {
        if (mode !== null) field.current?.focus();
    }, [mode]);

    // The field grows with its text. A browser with `field-sizing` does this in CSS; elsewhere it is measured,
    // again whenever the field's width changes, because a field measured while its layout was still narrow
    // keeps the height of every line the placeholder wrapped onto.
    useEffect(() => {
        const node = field.current;
        if (node === null || (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content'))) return undefined;
        const measure = (): void => {
            node.style.height = 'auto';
            node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(node);

        return (): void => {
            observer.disconnect();
        };
    }, [text]);

    useEffect(() => {
        const urls = previews.current;

        return (): void => {
            for (const url of urls) URL.revokeObjectURL(url);
            urls.clear();
        };
    }, []);

    if (!conversation.canSend) {
        const reason = cannotSendText(conversation.refusal);
        const canAccept = canAcceptRequest(conversation);

        return (
            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-chat-line bg-chat-sunken px-4 py-4 text-center">
                <p className="text-small text-chat-ink-soft">{t(reason.key, reason.values)}</p>
                {canAccept && (
                    <button
                        type="button"
                        className={cn(PRIMARY_BUTTON, 'min-h-9')}
                        disabled={settings.isPending}
                        onClick={() => {
                            void settings.accept().catch(() => undefined);
                        }}
                    >
                        {t('chat.thread.request.accept')}
                    </button>
                )}
            </div>
        );
    }

    const isEditing = mode?.type === 'edit';
    const trimmed = text.trim();
    const isTooLong = text.length > CHAT_MESSAGE_MAX_LENGTH;
    const hasContent = trimmed.length > 0 || drafts.ready.length > 0;
    const canSubmit = !isTooLong && !drafts.isUploading && (isEditing ? trimmed.length > 0 : hasContent);

    const describeRefusal = (refusal: ChatDraftRefusal): string =>
        refusal.reason === 'too-large'
            ? t('chat.composer.too-large', {
                  name: refusal.name,
                  size: formatByteSize(CHAT_ATTACHMENT_MAX_BYTES, locale),
              })
            : t('chat.composer.too-many', { max: CHAT_ATTACHMENTS_PER_MESSAGE });

    const addFiles = (files: FileList | File[] | null, kind?: ChatAttachmentKind): void => {
        setNotice(null);
        for (const file of files ?? []) {
            const resolvedKind = kind ?? attachmentKindFor(file.type);
            // Only what this conversation allows; a pasted PDF in a photos-only chat is left out.
            if (!(attachmentKinds as readonly ChatAttachmentKind[]).includes(resolvedKind)) continue;
            let previewUrl: Nullable<string> = null;
            if (resolvedKind === ChatAttachmentKind.PHOTO && typeof URL.createObjectURL === 'function') {
                previewUrl = URL.createObjectURL(file);
                previews.current.add(previewUrl);
            }
            const refusal = drafts.add({ file, name: file.name, sizeBytes: file.size, kind: resolvedKind, previewUrl });
            if (refusal !== null) {
                setNotice(describeRefusal(refusal));
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
        // Cleared before the answer: the message is already on screen as "sending", and a failure keeps it
        // there with its retry, so the composer is free for the next one.
        setText('');
        drafts.clear();
        onModeChange(null);
        await sender.send({ body: trimmed, attachments, replyTo });
    };

    const sendVoice = async (): Promise<void> => {
        setIsSendingVoice(true);
        setNotice(null);
        try {
            const recorded = await recorder.stop();
            if (recorded === null) return;
            const attachment = await client.uploadAttachment(
                new File([recorded.blob], recorded.fileName, { type: recorded.blob.type }),
                {
                    kind: ChatAttachmentKind.VOICE,
                    durationMs: Math.round(recorded.durationMs),
                    waveform: encodeWaveformField(recorded.levels),
                },
            );
            const replyTo = mode?.type === 'reply' ? toReplyPreview(mode.message) : null;
            onModeChange(null);
            await sender.send({ attachments: [attachment], replyTo });
        } catch (error: unknown) {
            setNotice(describeError(error, translate));
        } finally {
            setIsSendingVoice(false);
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (event.key === 'Escape' && mode !== null) {
            event.preventDefault();
            onModeChange(null);

            return;
        }
        // `isComposing`: Enter that confirms an input method's candidate (Japanese, Chinese) is not a send.
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
        }
    };

    const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
        const files = [...event.clipboardData.files];
        if (files.length === 0 || isEditing) return;
        event.preventDefault();
        addFiles(files);
    };

    const onDrop = (event: DragEvent<HTMLDivElement>): void => {
        if (event.dataTransfer.files.length === 0 || isEditing) return;
        event.preventDefault();
        addFiles(event.dataTransfer.files);
    };

    if (recorder.status === 'recording') {
        return (
            <div className="flex items-center gap-3 border-t border-chat-line bg-chat-surface px-3 py-3 sm:px-4">
                <button
                    type="button"
                    aria-label={t('chat.composer.cancel-recording')}
                    onClick={recorder.cancel}
                    className={cn(ICON_BUTTON, 'h-10 w-10 text-critical hover:bg-critical-soft hover:text-critical')}
                >
                    <TrashIcon />
                </button>
                <div
                    role="status"
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-chat-panel bg-critical-soft px-4 py-2.5"
                >
                    <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full bg-critical motion-safe:animate-pulse"
                    />
                    <span className="truncate text-label font-medium text-critical tabular-nums">
                        {t('chat.composer.recording', { time: formatDuration(recorder.elapsedMs) })}
                    </span>
                </div>
                <button
                    type="button"
                    aria-label={t('chat.composer.send-voice')}
                    disabled={isSendingVoice}
                    onClick={() => {
                        void sendVoice();
                    }}
                    className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chat-accent text-chat-accent-ink shadow-sm hover:bg-chat-accent-hover disabled:opacity-50',
                        FOCUS_RING,
                    )}
                >
                    <SendIcon />
                </button>
            </div>
        );
    }

    return (
        <div
            className="border-t border-chat-line bg-chat-surface px-3 pt-2 pb-3 sm:px-4"
            onDragOver={(event) => {
                if (!isEditing) event.preventDefault();
            }}
            onDrop={onDrop}
        >
            {mode !== null && (
                <div className="mb-2 flex items-center gap-3 rounded-chat-control border-s-[3px] border-chat-accent bg-chat-accent-soft px-3 py-2">
                    <span className="text-chat-accent">{mode.type === 'reply' ? <ReplyIcon /> : <EditIcon />}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-caption font-semibold text-chat-accent">
                            {mode.type === 'reply'
                                ? t('chat.composer.replying-to', {
                                      name: mode.message.sender?.displayName ?? t('chat.common.you'),
                                  })
                                : t('chat.composer.editing')}
                        </span>
                        <span className="truncate text-small text-chat-muted">
                            {replyExcerpt(toReplyPreview(mode.message), translate)}
                        </span>
                    </span>
                    <button
                        type="button"
                        aria-label={t(
                            mode.type === 'reply' ? 'chat.composer.cancel-reply' : 'chat.composer.cancel-edit',
                        )}
                        onClick={() => {
                            onModeChange(null);
                        }}
                        className={cn(ICON_BUTTON, 'h-8 w-8')}
                    >
                        <CloseIcon className="h-4 w-4" />
                    </button>
                </div>
            )}

            {drafts.drafts.length > 0 && (
                <ul className="mb-2 flex gap-2 overflow-x-auto pb-1">
                    {drafts.drafts.map((draft) => (
                        <li
                            key={draft.localId}
                            className={cn(
                                'relative flex h-16 shrink-0 items-center overflow-hidden rounded-chat-card border bg-chat-canvas',
                                draft.previewUrl === null ? 'w-48 gap-2 px-2.5' : 'w-16',
                                draft.status === 'failed' ? 'border-critical/60' : 'border-chat-line',
                            )}
                        >
                            {draft.previewUrl === null ? (
                                <>
                                    <FileIcon className="text-chat-muted" />
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-caption font-medium text-chat-ink">
                                            {draft.name}
                                        </span>
                                        <span className="text-2xs text-chat-muted tabular-nums">
                                            {formatByteSize(draft.sizeBytes, locale)}
                                        </span>
                                    </span>
                                </>
                            ) : (
                                <img src={draft.previewUrl} alt="" className="h-full w-full object-cover" />
                            )}
                            {draft.status === 'uploading' && (
                                <span
                                    role="progressbar"
                                    aria-label={t('chat.composer.uploading', { name: draft.name })}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={Math.round(draft.progress * 100)}
                                    className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-chat-ink/15"
                                >
                                    <span
                                        className="block h-full rounded-full bg-chat-accent transition-[width] duration-fast"
                                        style={{ width: `${Math.max(6, draft.progress * 100)}%` }}
                                    />
                                </span>
                            )}
                            {draft.status === 'failed' && (
                                <span className="sr-only" role="alert">
                                    {t('chat.composer.upload-failed', { name: draft.name })}
                                </span>
                            )}
                            <button
                                type="button"
                                aria-label={t('chat.composer.remove-attachment', { name: draft.name })}
                                onClick={() => {
                                    if (draft.previewUrl !== null) {
                                        URL.revokeObjectURL(draft.previewUrl);
                                        previews.current.delete(draft.previewUrl);
                                    }
                                    drafts.remove(draft.localId);
                                }}
                                className={cn(
                                    'absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-chat-ink/60 text-white hover:bg-chat-ink/80',
                                    FOCUS_RING,
                                )}
                            >
                                <CloseIcon className="h-3 w-3" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex items-end gap-1.5">
                {!isEditing && attachmentKinds.length > 0 && (
                    <ChatMenu
                        label={t('chat.composer.attach')}
                        icon={<AttachIcon />}
                        align="start"
                        placement="above"
                        triggerClassName="h-11 w-11"
                        items={[
                            ...(attachmentKinds.includes(ChatAttachmentKind.PHOTO)
                                ? [
                                      {
                                          key: 'photo',
                                          label: t('chat.composer.attach-photo'),
                                          icon: <PhotoIcon />,
                                          onSelect: (): void => photoInput.current?.click(),
                                      },
                                  ]
                                : []),
                            ...(attachmentKinds.includes(ChatAttachmentKind.FILE)
                                ? [
                                      {
                                          key: 'file',
                                          label: t('chat.composer.attach-file'),
                                          icon: <FileIcon />,
                                          onSelect: (): void => fileInput.current?.click(),
                                      },
                                  ]
                                : []),
                        ]}
                    />
                )}
                <div className="flex min-w-0 flex-1 items-end rounded-chat-panel border border-chat-line bg-chat-canvas transition-colors duration-fast focus-within:border-chat-accent focus-within:bg-chat-surface hover:border-chat-line-strong">
                    <textarea
                        ref={field}
                        rows={1}
                        value={text}
                        // Off unless the embedding page asks: moving focus on arrival is the page's decision.
                        autoFocus={autoFocus}
                        aria-label={t('chat.composer.label')}
                        aria-describedby={hintId}
                        placeholder={t('chat.composer.placeholder')}
                        onChange={(event) => {
                            setText(event.target.value);
                            if (event.target.value.trim().length > 0 && !isEditing) notifyTyping();
                        }}
                        onKeyDown={onKeyDown}
                        onPaste={onPaste}
                        className="block max-h-[200px] min-h-11 w-full resize-none bg-transparent [field-sizing:content] px-4 py-2.5 text-body text-chat-ink outline-hidden placeholder:text-chat-faint"
                    />
                </div>
                {canSubmit || isEditing || hasContent || !allowVoice ? (
                    <button
                        type="button"
                        aria-label={t(isEditing ? 'chat.common.save' : 'chat.composer.send')}
                        disabled={!canSubmit}
                        onClick={() => {
                            void submit();
                        }}
                        className={cn(
                            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chat-accent text-chat-accent-ink shadow-sm transition-colors duration-fast hover:bg-chat-accent-hover disabled:bg-chat-accent/40 disabled:shadow-none',
                            FOCUS_RING,
                        )}
                    >
                        {isEditing ? <CheckIcon /> : <SendIcon />}
                    </button>
                ) : (
                    <button
                        type="button"
                        aria-label={t('chat.composer.record')}
                        onClick={() => {
                            void recorder.start();
                        }}
                        className={cn(ICON_BUTTON, 'h-11 w-11')}
                    >
                        <MicIcon />
                    </button>
                )}
            </div>

            <div className="mt-1 flex min-h-4 items-center gap-3 px-1 text-2xs">
                <span id={hintId} className="sr-only">
                    {t('chat.composer.hint')}
                </span>
                {(notice !== null || recorder.status === 'denied' || recorder.status === 'unsupported') && (
                    <span role="alert" className="text-critical">
                        {notice ??
                            t(
                                recorder.status === 'denied'
                                    ? 'chat.composer.microphone-denied'
                                    : 'chat.composer.recording-unsupported',
                            )}
                    </span>
                )}
                {text.length > CHAT_MESSAGE_MAX_LENGTH * 0.9 && (
                    <span
                        className={cn(
                            'ms-auto tabular-nums',
                            isTooLong ? 'font-semibold text-critical' : 'text-chat-muted',
                        )}
                    >
                        {isTooLong
                            ? t('chat.composer.too-long', { max: CHAT_MESSAGE_MAX_LENGTH })
                            : `${new Intl.NumberFormat(locale).format(text.length)} / ${new Intl.NumberFormat(locale).format(CHAT_MESSAGE_MAX_LENGTH)}`}
                    </span>
                )}
            </div>

            <input
                ref={photoInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                    addFiles(event.target.files, ChatAttachmentKind.PHOTO);
                    event.target.value = '';
                }}
            />
            <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                    addFiles(event.target.files, ChatAttachmentKind.FILE);
                    event.target.value = '';
                }}
            />
        </div>
    );
}
