/** Values substituted into an ICU message. The same shape `@iveri/react-kit`'s `t` takes. */
export type ChatTranslationValues = Record<string, string | number | Date | boolean>;

/**
 * Looks a key up in a catalogue and formats it.
 *
 * **Iveri's products supply their own**: they pull the `chat-kit` namespace beside their own at build time and
 * already hold a `t` bound to the reader's locale (react-kit's `useTranslation().t` on the web), so a ride's chat
 * reads in Georgian inside Taxi from the same catalogue as the rest of Taxi. **An app that supplies none gets
 * `createChatTranslator`**, over the words the package carries. Either way it returns the key itself when the
 * key is unknown, which is how the kit notices a system notice it has no words for.
 */
export type ChatTranslate = (key: string, values?: ChatTranslationValues) => string;
