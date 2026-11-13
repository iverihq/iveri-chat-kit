import { IntlMessageFormat } from 'intl-messageformat';

import type { ChatCatalogue, ChatMessages } from './catalogue.type.js';
import { CHAT_KIT_DEFAULT_CATALOGUE } from './default-catalogue.js';
import type { ChatTranslate, ChatTranslationValues } from './translate.type.js';

export interface CreateChatTranslatorOptions {
    /** The reader's locale. `ka-GE` reads `ka`'s words when there is no `ka-GE`. */
    locale: string;
    /**
     * The app's own words, by locale and key, read before the bundled ones: a different wording for any of
     * the kit's keys, a language the kit does not ship, and the keys of the app's own notices
     * (`acme.order.shipped`), which the kit cannot know.
     */
    messages?: ChatMessages;
    /** The kit's words. For specs; an app leaves it out. */
    catalogue?: ChatCatalogue;
}

/**
 * Compiled patterns by locale and pattern. Unbounded on purpose, like `@iveri/react-kit`'s: the patterns come
 * from a catalogue in the package and the app's own, so the build bounds it.
 */
const compiled = new Map<string, IntlMessageFormat>();

/**
 * Formats one pattern in **the locale it was written in**, which differs from the reader's whenever a
 * translation is missing: English shown to a Georgian reader is still English, and Georgian plural rules
 * would take branches its author never wrote. A pattern that will not format comes back as written, the
 * same as react-kit's `t`, and `systemNoticeText` then notices the unresolved variable.
 */
function format(locale: string, pattern: string, values?: ChatTranslationValues): string {
    if (values === undefined && !pattern.includes('{')) return pattern;

    try {
        const cacheKey = `${locale} ${pattern}`;
        let message = compiled.get(cacheKey);
        if (message === undefined) {
            message = new IntlMessageFormat(pattern, locale);
            compiled.set(cacheKey, message);
        }
        const formatted = message.format(values);

        return typeof formatted === 'string' ? formatted : String(formatted);
    } catch {
        return pattern;
    }
}

/** The locales to look in, in order: the reader's, its language, then the catalogue's source. */
function lookupOrder(locale: string, sourceLocale: string): string[] {
    const language = locale.split(/[-_]/u)[0];

    return [...new Set([locale, language, sourceLocale])];
}

/**
 * A `translate` for an app with no catalogue of its own: the kit's bundled words, with the app's `messages`
 * read first.
 *
 * **What `ChatProvider` uses when it is given no `translate`.** Iveri's products pull the `chat-kit` namespace
 * and pass their own `t`; a customer's app has no access to Iveri's localization service, so the words come
 * in the package. Like any `ChatTranslate`, an unknown key comes back as the key itself, which is how the kit
 * notices a notice it has no words for.
 */
export function createChatTranslator({
    locale,
    messages = {},
    catalogue = CHAT_KIT_DEFAULT_CATALOGUE,
}: CreateChatTranslatorOptions): ChatTranslate {
    const order = lookupOrder(locale, catalogue.sourceLocale);

    return (key, values) => {
        for (const candidate of order) {
            const pattern = messages[candidate]?.[key] ?? catalogue.messages[candidate]?.[key];
            if (pattern !== undefined) return format(candidate, pattern, values);
        }

        return key;
    };
}
