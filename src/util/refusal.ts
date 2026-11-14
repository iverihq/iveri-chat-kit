import type { Nullable } from '@iveri/contracts';
import { CHAT_PIN_LIMIT, ChatRefusal } from '@iveri/contracts/chat';

import { isChatApiError } from '../client/index.js';
import type { ChatKitMessageKey, ChatTranslate, ChatTranslationValues } from '../i18n/index.js';

/** A translation key and the values it needs, so a component can render a refusal in one call. */
export interface ChatMessageText {
    key: ChatKitMessageKey;
    values?: ChatTranslationValues;
}

/**
 * The key for one refusal, with the numbers its sentence names filled from the contract's own limits.
 *
 * `usage-limit-reached` comes with the app's `metric` and `limit` in `details`, and neither is passed on:
 * those are the customer's plan, which is between Baasi and the customer, and a person chatting in their
 * app is told only that the chat is not taking messages now.
 */
export function refusalText(refusal: ChatRefusal): ChatMessageText {
    const key = `chat.refusal.${refusal}` as const;

    return refusal === ChatRefusal.PIN_LIMIT ? { key, values: { max: CHAT_PIN_LIMIT } } : { key };
}

/**
 * What to tell a person about anything a hook caught.
 *
 * A refusal says what they can do about it and wins over the status; then the statuses a person can
 * understand; and everything else is one honest sentence. The API's own `message` is English for a
 * developer and is never shown.
 */
export function errorText(error: unknown): ChatMessageText {
    if (!isChatApiError(error)) return { key: 'chat.error.generic' };
    if (error.refusal !== null) return refusalText(error.refusal);
    if (error.isNetworkError) return { key: 'chat.error.network' };
    if (error.status === 401) return { key: 'chat.error.unauthenticated' };
    if (error.status === 404) return { key: 'chat.error.not-found' };
    if (error.status === 413) return { key: 'chat.error.too-large' };
    if (error.status === 429) return { key: 'chat.error.rate-limited' };

    return { key: 'chat.error.generic' };
}

/** `errorText`, translated. */
export function describeError(error: unknown, t: ChatTranslate): string {
    const text = errorText(error);

    return t(text.key, text.values);
}

/** Why the composer is closed: the conversation's own refusal, or a plain read-only sentence without one. */
export function cannotSendText(refusal: Nullable<ChatRefusal>): ChatMessageText {
    return refusal === null ? { key: 'chat.thread.read-only' } : refusalText(refusal);
}

/**
 * Whether the closed composer offers Accept. Only for a request that accepting would open: a conversation a
 * product has closed, or made read-only, stays shut whatever is accepted, so offering the button beside
 * "This conversation has closed" promises something it cannot do.
 */
export function canAcceptRequest(conversation: {
    isRequest: boolean;
    refusal: Nullable<ChatRefusal>;
    closedAt?: Nullable<string>;
}): boolean {
    if (conversation.closedAt !== null && conversation.closedAt !== undefined) return false;
    if (conversation.refusal === ChatRefusal.CLOSED || conversation.refusal === ChatRefusal.NOT_WRITABLE) return false;

    return conversation.isRequest || conversation.refusal === ChatRefusal.REQUEST_PENDING;
}
