import type { UUID } from '@iveri/contracts';
import type { ChatMessage, ChatMessagePage } from '@iveri/contracts/chat';

/**
 * The messages of one conversation the client holds, oldest first.
 *
 * A single ordered list rather than TanStack's infinite pages, because the two ways it grows pull in
 * opposite directions: older pages are prepended on scroll, and a frame appends whatever is after the
 * newest `seq` held. Infinite pages refetch from the newest page down on every invalidation; this
 * refetches only the tail and keeps everything the person scrolled back through.
 */
export interface ChatMessageWindow {
    messages: ChatMessage[];
    hasOlder: boolean;
    /** The conversation's newest `seq` when the window was last refreshed. */
    lastSeq: number;
}

export const EMPTY_WINDOW: ChatMessageWindow = { messages: [], hasOlder: false, lastSeq: 0 };

function bySeq(a: ChatMessage, b: ChatMessage): number {
    return a.seq - b.seq;
}

export function windowFromPage(page: ChatMessagePage): ChatMessageWindow {
    return { messages: [...page.messages].sort(bySeq), hasOlder: page.hasOlder, lastSeq: page.lastSeq };
}

export function newestSeq(window: ChatMessageWindow): number {
    return window.messages.at(-1)?.seq ?? 0;
}

export function oldestSeq(window: ChatMessageWindow): number | null {
    return window.messages[0]?.seq ?? null;
}

/** Adds an older page in front, dropping anything already held. */
export function prependOlder(window: ChatMessageWindow, page: ChatMessagePage): ChatMessageWindow {
    const held = new Set(window.messages.map((message) => message.id));
    const older = page.messages.filter((message) => !held.has(message.id));

    return { ...window, messages: [...older, ...window.messages].sort(bySeq), hasOlder: page.hasOlder };
}

/**
 * Replaces everything held after `afterSeq` (and up to `throughSeq`) with what the server now says.
 *
 * **Replace, not merge**, inside the range that was re-read: a message deleted for me, or hidden by a
 * block since, is simply absent from the response and must disappear from the screen too; a merge
 * would keep it for ever. Outside the range nothing is touched, which is what keeps older pages the
 * person scrolled back through.
 */
export function replaceRange(
    window: ChatMessageWindow,
    incoming: readonly ChatMessage[],
    range: { afterSeq: number; throughSeq: number },
    lastSeq: number,
): ChatMessageWindow {
    const kept = window.messages.filter((message) => message.seq <= range.afterSeq || message.seq > range.throughSeq);
    const incomingIds = new Set(incoming.map((message) => message.id));
    const merged = [...kept.filter((message) => !incomingIds.has(message.id)), ...incoming].sort(bySeq);

    return { messages: merged, hasOlder: window.hasOlder, lastSeq: Math.max(window.lastSeq, lastSeq) };
}

/** Puts one message the server returned (a send, an edit, a reaction) in its place. */
export function upsertMessage(window: ChatMessageWindow, message: ChatMessage): ChatMessageWindow {
    const messages = window.messages.filter((held) => held.id !== message.id);
    messages.push(message);
    messages.sort(bySeq);

    return { ...window, messages, lastSeq: Math.max(window.lastSeq, message.seq) };
}

export function updateMessage(
    window: ChatMessageWindow,
    messageId: UUID,
    change: (message: ChatMessage) => ChatMessage,
): ChatMessageWindow {
    return {
        ...window,
        messages: window.messages.map((message) => (message.id === messageId ? change(message) : message)),
    };
}

export function removeMessage(window: ChatMessageWindow, messageId: UUID): ChatMessageWindow {
    return { ...window, messages: window.messages.filter((message) => message.id !== messageId) };
}

/** A message deleted for everyone keeps its place, so replies to it still read "deleted". */
export function markDeleted(message: ChatMessage): ChatMessage {
    return { ...message, body: null, attachments: [], reactions: [], isDeleted: true };
}
