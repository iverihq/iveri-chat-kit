/** Values substituted into an ICU message. The same shape `@iveri/react-kit`'s `t` takes. */
export type ChatTranslationValues = Record<string, string | number | Date | boolean>;

/**
 * Looks a key up in the app's committed catalogue and formats it.
 *
 * **Supplied by the app, never built here.** The kit's strings are the `chat-kit` namespace, which each
 * app pulls with its own at build time; the app already has a `t` bound to its locale (react-kit's
 * `useTranslation().t` on the web), and handing it in is what makes a ride's chat read in Georgian
 * inside Taxi without the kit holding a catalogue of its own. It returns the key itself when the key is
 * unknown, which is how the kit notices a system notice it has no words for.
 */
export type ChatTranslate = (key: string, values?: ChatTranslationValues) => string;
