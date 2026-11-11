/**
 * Word stems no message in a `chat-*` namespace may contain, in any of the three languages.
 *
 * **Baasi's messages are not end-to-end encrypted** (the messenger plan, "Encryption"), so the product
 * must not call a conversation encrypted, secure or private anywhere. A sentence like that is the one
 * kind of wrong copy that changes what somebody decides to say, which is why it is checked rather than
 * remembered.
 *
 * Stems, matched case-insensitively anywhere in a value, so `encrypted`, `encryption`, `securely` and
 * `private` all hit. Each consuming app's `catalog.spec.ts` imports this list and asserts its pulled
 * catalogue has none of them; the `chat-kit` namespace file in `iveri-infra` carries the same list and
 * refuses to load, so a seed cannot publish one either.
 */
export const CHAT_KIT_FORBIDDEN_WORDS: Readonly<Record<'en' | 'ru' | 'ka', readonly string[]>> = {
    en: ['encrypt', 'secure', 'private'],
    ru: ['шифр', 'защищ', 'приват'],
    ka: ['დაშიფრ', 'დაცულ', 'პირად'],
};

/** The forbidden stems a value contains, so a spec can name what it found rather than only fail. */
export function findForbiddenWords(value: string): string[] {
    const lowered = value.toLocaleLowerCase();

    return Object.values(CHAT_KIT_FORBIDDEN_WORDS)
        .flat()
        .filter((stem) => lowered.includes(stem));
}
