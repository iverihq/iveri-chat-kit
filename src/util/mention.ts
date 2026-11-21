import type { Nullable } from '@iveri/contracts';
import { ChatParticipantStatus, type ChatMention, type ChatParticipant } from '@iveri/contracts/chat';

import { linkify, type ChatTextPart } from './linkify.js';

/** The `@` being typed: where it starts, and what follows it up to the caret. */
export interface ChatMentionQuery {
    start: number;
    query: string;
}

/** A name is at most this long, so an `@` typed long ago does not keep the picker open for a paragraph. */
const MAX_QUERY_LENGTH = 40;

/**
 * The mention being typed at the caret, or null. An `@` counts only at the start of the text or after a space or a
 * line break, so an email address never opens the picker, and the query may hold spaces because names do. A line
 * break ends it.
 */
export function mentionQueryAt(text: string, caret: number): Nullable<ChatMentionQuery> {
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');

    if (at === -1) return null;
    if (at > 0 && !/\s/u.test(before.charAt(at - 1))) return null;

    const query = before.slice(at + 1);

    if (query.length > MAX_QUERY_LENGTH || query.includes('\n') || query.startsWith(' ')) return null;

    return { start: at, query };
}

/**
 * The people `@query` could name: everybody present but me, whose name has a word starting with the query, in the
 * order the conversation lists them. Case and letter forms are folded, so `@ნინო` and `@nino` both work.
 */
export function mentionCandidates(
    participants: readonly ChatParticipant[],
    query: string,
    limit = 6,
): ChatParticipant[] {
    const wanted = fold(query.trim());

    return participants
        .filter((participant) => !participant.isMe && participant.status === ChatParticipantStatus.ACTIVE)
        .filter((participant) => {
            if (wanted.length === 0) return true;
            const name = fold(participant.displayName);

            return name.startsWith(wanted) || name.split(/\s+/u).some((word) => word.startsWith(wanted));
        })
        .slice(0, limit);
}

/** Puts `@Name ` in place of the query being typed, and says where the caret goes. */
export function insertMention(
    text: string,
    query: ChatMentionQuery,
    caret: number,
    mention: ChatMention,
): { text: string; caret: number } {
    const inserted = `@${mention.displayName} `;
    const next = text.slice(0, query.start) + inserted + text.slice(caret);

    return { text: next, caret: query.start + inserted.length };
}

/**
 * The mentions a text still carries: each picked person whose `@Name` is still in it, once. Deleting the name from the
 * text takes the mention away with it, so nobody is told about a name that is no longer there.
 */
export function mentionsInText(text: string, picked: readonly ChatMention[]): ChatMention[] {
    const seen = new Set<string>();

    return picked.filter((mention) => {
        if (seen.has(mention.userId) || !text.includes(`@${mention.displayName}`)) return false;
        seen.add(mention.userId);

        return true;
    });
}

/** A run of a message's text: plain, a link, or a person named with `@`. */
export type ChatMessagePart = ChatTextPart | { type: 'mention'; text: string; userId: ChatMention['userId'] };

/**
 * A message's text as plain runs, links and mentions. Each `@Name` the message's mentions list is drawn as a mention,
 * the longest names first so "@Nino Beridze" is not taken as "@Nino" and some text; the rest is linkified as before.
 */
export function messageParts(text: string, mentions: readonly ChatMention[]): ChatMessagePart[] {
    const names = [...mentions]
        .filter((mention) => mention.displayName.length > 0)
        .sort((a, b) => b.displayName.length - a.displayName.length);

    if (names.length === 0) return linkify(text);

    const parts: ChatMessagePart[] = [];
    let plain = '';
    let index = 0;

    while (index < text.length) {
        const found =
            text.charAt(index) === '@' && (index === 0 || /\s|[([{"'«„]/u.test(text.charAt(index - 1)))
                ? names.find((mention) => text.startsWith(`@${mention.displayName}`, index))
                : undefined;

        if (found === undefined) {
            plain += text.charAt(index);
            index += 1;
            continue;
        }

        if (plain.length > 0) parts.push(...linkify(plain));
        plain = '';
        parts.push({ type: 'mention', text: `@${found.displayName}`, userId: found.userId });
        index += found.displayName.length + 1;
    }

    if (plain.length > 0) parts.push(...linkify(plain));

    return parts;
}

function fold(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase();
}
