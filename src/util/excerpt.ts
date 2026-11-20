import type { Nullable } from '@iveri/contracts';
import { ChatMessageKind } from '@iveri/contracts/chat';
import type { ChatLastMessagePreview, ChatMessage, ChatReplyPreview } from '@iveri/contracts/chat';

import type { ChatTranslate } from '../i18n/index.js';

import { calendarDateWords } from './time-label.js';

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
    const text = t(key, readableVariables(variables, t));

    // An unresolved `{actor}` means the variables were not sent (an inbox preview carries none): the words
    // would be a pattern with holes in it, so the neutral notice is shown instead.
    return text === key || /\{[A-Za-z]/u.test(text) ? t('chat.system.unknown') : text;
}

/**
 * A notice's variables as the reader reads them. A `date` is a calendar date (`YYYY-MM-DD`) the product sends
 * rather than words, because its server does not know the reader's language: Gym's personal-session notices
 * carry the session's day this way. It is written out here ("Thursday, 26 November"); every other variable is
 * the product's text and shown as written.
 */
function readableVariables(
    variables: Nullable<Record<string, string>>,
    t: ChatTranslate,
): Record<string, string> | undefined {
    if (variables === null) return undefined;
    if (typeof variables.date !== 'string') return variables;

    return { ...variables, date: calendarDateWords(variables.date, t) };
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
    // `systemVariables` arrived with contracts 0.76; a chat-api from before it sends none, and the notice then
    // reads as the neutral sentence rather than a pattern with holes.
    if (preview.systemKey !== null) return systemNoticeText(preview.systemKey, preview.systemVariables ?? null, t);
    if (preview.isDeleted) return t('chat.preview.deleted');

    const text =
        preview.excerpt !== null && preview.excerpt.length > 0 ? preview.excerpt : (kindLabel(preview.kind, t) ?? '');

    if (preview.isOwn) return t('chat.preview.own', { text });
    if (isGroup && preview.senderName !== null) return t('chat.preview.sender', { name: preview.senderName, text });

    return text;
}

/** A message in one line, for a label a screen reader reads: its text, what it carries, or that it was deleted. */
export function messageExcerpt(
    message: { body: Nullable<string>; isDeleted: boolean; kind: ChatMessageKind },
    t: ChatTranslate,
    maxLength = 140,
): string {
    if (message.isDeleted) return t('chat.message.deleted');
    if (message.body !== null && message.body.length > 0) {
        return message.body.length > maxLength ? `${message.body.slice(0, maxLength - 1)}…` : message.body;
    }

    return kindLabel(message.kind, t) ?? '';
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
