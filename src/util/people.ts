import type { Nullable } from '@iveri/contracts';

import type { ChatTranslate } from '../i18n/index.js';

import type { ChatThreadItem } from './thread-item.js';

/**
 * The first letter of the first and last words, so "Ana Maria Beridze" reads `AB`.
 *
 * ⚠ Upper-casing Georgian moves a letter from Mkhedruli (`U+10A0–10FF`) to Mtavruli (`U+1C90–1CBF`),
 * so an avatar's initials are the only Georgian outside the usual block. `@iveri/react-kit`'s rule,
 * copied rather than imported so the kit's root needs nothing but React.
 */
export function initialsOf(name: string): string {
    const words = name.split(/\s+/u).filter((part) => part.length > 0);
    const chosen = words.length > 1 ? [words[0], words[words.length - 1]] : words;

    return chosen.map((part) => [...part][0]?.toLocaleUpperCase() ?? '').join('');
}

/** "Nino is typing", "Nino and Giorgi are typing", "3 people are typing". */
export function typingText(names: readonly string[], t: ChatTranslate): Nullable<string> {
    if (names.length === 0) return null;
    if (names.length === 1) return t('chat.typing.one', { name: names[0] });
    if (names.length === 2) return t('chat.typing.two', { first: names[0], second: names[1] });

    return t('chat.typing.many', { count: names.length });
}

/**
 * Where the "new messages" line goes: before the first message somebody else sent after what I had
 * read when I opened the conversation. Read state moves while the conversation is open, so the value
 * passed here is the one captured on opening, or the line would vanish the moment it was seen.
 */
export function firstUnreadKey(items: readonly ChatThreadItem[], lastReadSeq: number): Nullable<string> {
    const first = items.find(
        (item) =>
            item.type === 'message' &&
            !item.message.isOwn &&
            item.message.systemKey === null &&
            item.message.seq > lastReadSeq,
    );

    return first?.key ?? null;
}
