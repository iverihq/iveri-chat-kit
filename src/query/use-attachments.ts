import type { Nullable } from '@iveri/contracts';
import { CHAT_ATTACHMENT_MAX_BYTES, CHAT_ATTACHMENTS_PER_MESSAGE, ChatAttachmentKind } from '@iveri/contracts/chat';
import type { ChatAttachment, UploadChatAttachmentFields } from '@iveri/contracts/chat';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatApiError, type ChatUploadFile } from '../client/index.js';
import { useChatContext } from '../provider/index.js';

export interface ChatUploadState {
    upload: (file: ChatUploadFile, fields: UploadChatAttachmentFields) => Promise<ChatAttachment>;
    /** The fraction of the latest upload sent, 0 to 1. */
    progress: number;
    isUploading: boolean;
    error: Nullable<ChatApiError>;
}

/** One upload with its progress. An upload is unattached until a message names it, and swept after a day if none does. */
export function useUploadAttachment(): ChatUploadState {
    const { client } = useChatContext();
    const [progress, setProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<Nullable<ChatApiError>>(null);

    const upload = useCallback(
        async (file: ChatUploadFile, fields: UploadChatAttachmentFields): Promise<ChatAttachment> => {
            setProgress(0);
            setError(null);
            setIsUploading(true);
            try {
                const attachment = await client.uploadAttachment(file, fields, { onProgress: setProgress });
                setProgress(1);

                return attachment;
            } catch (caught: unknown) {
                const failure = caught instanceof ChatApiError ? caught : ChatApiError.network(caught);
                setError(failure);
                throw failure;
            } finally {
                setIsUploading(false);
            }
        },
        [client],
    );

    return { upload, progress, isUploading, error };
}

export type ChatDraftStatus = 'uploading' | 'ready' | 'failed';

/** One attachment the composer holds before the message is sent. */
export interface ChatDraftAttachment {
    localId: string;
    name: string;
    kind: ChatAttachmentKind;
    sizeBytes: number;
    progress: number;
    status: ChatDraftStatus;
    attachment: Nullable<ChatAttachment>;
    error: Nullable<ChatApiError>;
    /** A local address to show a photo before the server's arrives (`URL.createObjectURL`, or a native `file://`). */
    previewUrl: Nullable<string>;
}

export interface AddDraftInput {
    file: ChatUploadFile;
    name: string;
    sizeBytes: number;
    kind: ChatAttachmentKind;
    previewUrl?: Nullable<string>;
}

export type ChatDraftRefusal = { reason: 'too-large'; name: string } | { reason: 'too-many' };

export interface ChatComposerAttachments {
    drafts: ChatDraftAttachment[];
    /** Starts uploading at once, so the message can go the moment it is written. Refuses, rather than starts, what cannot succeed. */
    add: (input: AddDraftInput) => Nullable<ChatDraftRefusal>;
    remove: (localId: string) => void;
    clear: () => void;
    /** Uploaded and ready to be named by a message. */
    ready: ChatAttachment[];
    isUploading: boolean;
    hasFailed: boolean;
}

let draftCounter = 0;

/**
 * The attachments a composer is holding, uploaded as soon as they are chosen.
 *
 * Shared by the web and native composers so the rules are written once: at most
 * `CHAT_ATTACHMENTS_PER_MESSAGE`, none over `CHAT_ATTACHMENT_MAX_BYTES` (refused before a byte is sent,
 * because the server would refuse it after all of them were), and a removed draft's upload cancelled.
 */
export function useComposerAttachments(): ChatComposerAttachments {
    const { client } = useChatContext();
    const [drafts, setDrafts] = useState<ChatDraftAttachment[]>([]);
    const controllers = useRef(new Map<string, AbortController>());

    useEffect(() => {
        const live = controllers.current;

        return (): void => {
            for (const controller of live.values()) controller.abort();
            live.clear();
        };
    }, []);

    const patch = useCallback((localId: string, change: Partial<ChatDraftAttachment>): void => {
        setDrafts((current) => current.map((draft) => (draft.localId === localId ? { ...draft, ...change } : draft)));
    }, []);

    const add = useCallback(
        (input: AddDraftInput): Nullable<ChatDraftRefusal> => {
            if (input.sizeBytes > CHAT_ATTACHMENT_MAX_BYTES) return { reason: 'too-large', name: input.name };
            if (drafts.length >= CHAT_ATTACHMENTS_PER_MESSAGE) return { reason: 'too-many' };

            draftCounter += 1;
            const localId = `draft-${draftCounter}`;
            const controller = new AbortController();
            controllers.current.set(localId, controller);
            setDrafts((current) => [
                ...current,
                {
                    localId,
                    name: input.name,
                    kind: input.kind,
                    sizeBytes: input.sizeBytes,
                    progress: 0,
                    status: 'uploading',
                    attachment: null,
                    error: null,
                    previewUrl: input.previewUrl ?? null,
                },
            ]);

            client
                .uploadAttachment(
                    input.file,
                    { kind: input.kind },
                    {
                        signal: controller.signal,
                        onProgress: (progress) => {
                            patch(localId, { progress });
                        },
                    },
                )
                .then((attachment) => {
                    patch(localId, { status: 'ready', progress: 1, attachment });
                })
                .catch((error: unknown) => {
                    if (controller.signal.aborted) return;
                    patch(localId, {
                        status: 'failed',
                        error: error instanceof ChatApiError ? error : ChatApiError.network(error),
                    });
                })
                .finally(() => {
                    controllers.current.delete(localId);
                });

            return null;
        },
        [client, drafts.length, patch],
    );

    const remove = useCallback((localId: string): void => {
        controllers.current.get(localId)?.abort();
        controllers.current.delete(localId);
        setDrafts((current) => current.filter((draft) => draft.localId !== localId));
    }, []);

    const clear = useCallback((): void => {
        setDrafts([]);
    }, []);

    return {
        drafts,
        add,
        remove,
        clear,
        ready: drafts.flatMap((draft) =>
            draft.status === 'ready' && draft.attachment !== null ? [draft.attachment] : [],
        ),
        isUploading: drafts.some((draft) => draft.status === 'uploading'),
        hasFailed: drafts.some((draft) => draft.status === 'failed'),
    };
}

/** Whether a picked file should be sent as a photo (re-encoded, shown inline) or as a file. */
export function attachmentKindFor(contentType: string): ChatAttachmentKind {
    return contentType.startsWith('image/') ? ChatAttachmentKind.PHOTO : ChatAttachmentKind.FILE;
}
