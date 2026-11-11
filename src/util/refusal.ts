import type { Nullable } from '@iveri/contracts';
import { CHAT_PIN_LIMIT, ChatRefusal } from '@iveri/contracts/chat';

import { isChatApiError } from '../client/index.js';
import type { ChatKitMessageKey, ChatTranslate, ChatTranslationValues } from '../i18n/index.js';

/** A translation key and the values it needs, so a component can render a refusal in one call. */
export interface ChatMessageText {
    key: ChatKitMessageKey;
    values?: ChatTranslationValues;
}

/** The key for one refusal, with the numbers its sentence names filled from the contract's own limits. */
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
