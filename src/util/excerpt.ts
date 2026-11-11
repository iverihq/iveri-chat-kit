import type { Nullable } from '@iveri/contracts';
import { ChatMessageKind } from '@iveri/contracts/chat';
import type { ChatLastMessagePreview, ChatMessage, ChatReplyPreview } from '@iveri/contracts/chat';

import type { ChatTranslate } from '../i18n/index.js';

/**
 * A system notice in words.
 *
 * A notice is a translation key and variables, never free text, because a product's server posts it
 * and a person reads it in their own language. A key this version of the kit does not have (a newer
 * `chat-api`, a product's notice nobody added to `chat-kit` yet) comes back from `translate` as the
 * key itself, which would put a raw key on somebody's screen; it is replaced by a
 * neutral sentence instead, which is less informative and never wrong.
 */
export function systemNoticeText(key: string, variables: Nullable<Record<string, string>>, t: ChatTranslate): string {
    const text = t(key, variables ?? undefined);

    return text === key ? t('chat.system.unknown') : text;
}

/** What a message is, in one word, when it has no text of its own to show. */
function kindLabel(kind: ChatMessageKind, t: ChatTranslate): Nullable<string> {
    if (kind === ChatMessageKind.PHOTO) return t('chat.preview.photo');
    if (kind === ChatMessageKind.FILE) return t('chat.preview.file');
    if (kind === ChatMessageKind.VOICE) return t('chat.preview.voice');

    return null;
}

/** The line under an inbox row's title. */
export function lastMessageExcerpt(
    preview: Nullable<ChatLastMessagePreview>,
    t: ChatTranslate,
    { isGroup }: { isGroup: boolean },
): string {
    if (preview === null) return t('chat.preview.empty');
    if (preview.systemKey !== null) return systemNoticeText(preview.systemKey, null, t);
    if (preview.isDeleted) return t('chat.preview.deleted');

    const text =
        preview.excerpt !== null && preview.excerpt.length > 0 ? preview.excerpt : (kindLabel(preview.kind, t) ?? '');

    if (preview.isOwn) return t('chat.preview.own', { text });
    if (isGroup && preview.senderName !== null) return t('chat.preview.sender', { name: preview.senderName, text });

    return text;
}

/** The text of a reply's quote. */
export function replyExcerpt(reply: ChatReplyPreview, t: ChatTranslate): string {
    if (reply.isDeleted) return t('chat.message.quote-deleted');
    if (reply.excerpt !== null && reply.excerpt.length > 0) return reply.excerpt;

    return kindLabel(reply.kind, t) ?? '';
}

/** A message reduced to what a reply needs to quote it, for the composer's "replying to" strip. */
export function toReplyPreview(message: ChatMessage): ChatReplyPreview {
    return {
        id: message.id,
        seq: message.seq,
        senderName: message.sender?.displayName ?? null,
        kind: message.kind,
        excerpt: message.body,
        isDeleted: message.isDeleted,
    };
}
