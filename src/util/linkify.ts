/** A run of a message's text: plain, or an address to draw as a link. */
export type ChatTextPart = { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+/giu;
/** Punctuation that ends a sentence rather than an address: "see https://iveri.ge." */
const TRAILING = /[.,!?;:'")\]}]+$/u;

/**
 * Splits a message's text into plain runs and web addresses.
 *
 * Only `http` and `https`, and only addresses written out in full: a bare `example.ge` stays text,
 * because guessing which words are domains turns every "e.g." into a link. Never `javascript:` or
 * anything else a scheme could smuggle, since the pattern names the two schemes it accepts.
 */
export function linkify(text: string): ChatTextPart[] {
    const parts: ChatTextPart[] = [];
    let cursor = 0;

    for (const match of text.matchAll(URL_PATTERN)) {
        const start = match.index;
        const raw = match[0];
        const trailing = TRAILING.exec(raw)?.[0] ?? '';
        const href = raw.slice(0, raw.length - trailing.length);
        if (href.length === 0) continue;

        if (start > cursor) parts.push({ type: 'text', text: text.slice(cursor, start) });
        parts.push({ type: 'link', text: href, href });
        cursor = start + href.length;
    }

    if (cursor < text.length) parts.push({ type: 'text', text: text.slice(cursor) });

    return parts;
}
