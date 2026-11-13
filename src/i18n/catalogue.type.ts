/**
 * ICU patterns by locale and key: `{ en: { 'chat.common.cancel': 'Cancel' } }`. Partial at both levels, because
 * a lookup in it can always miss.
 */
export type ChatMessages = Readonly<Partial<Record<string, Readonly<Partial<Record<string, string>>>>>>;

/** The kit's own words as published, carried in the package for an app that has no catalogue of its own. */
export interface ChatCatalogue {
    /** Always `chat-kit`. */
    namespace: string;
    /** The release of the namespace it was pulled from. */
    version: number;
    /** The locale every message is written in first, and the one a missing translation falls back to. */
    sourceLocale: string;
    messages: ChatMessages;
}
