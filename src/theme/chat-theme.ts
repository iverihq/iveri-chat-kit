import { color, radius } from '@iveri/tokens';

/**
 * A brand the kit draws in, so a customer's chat looks like the customer's product rather than Iveri's.
 *
 * Every colour is a CSS colour both platforms accept (`#c2410c`, `rgb(194 65 12)`); a name only the web
 * understands (`var(--x)`, `oklch(…)`) would reach React Native as an invalid colour.
 */
export interface ChatTheme {
    /** Primary buttons, links in a quote, the read mark, the selected row, the focus ring. */
    colorAccent: string;
    /** Text and icons drawn on the accent. */
    colorAccentText: string;
    /** The panels, the composer, a dialog. The quieter backgrounds are derived from it and `colorText`. */
    colorSurface: string;
    colorText: string;
    /** Secondary text: times, hints, a preview line. The faintest level is derived from it. */
    colorMuted: string;
    /** The background of the reader's own messages. */
    colorBubbleOwn: string;
    /** The background of everybody else's messages. */
    colorBubbleOther: string;
    /** A message bubble's and a card's corner radius, in pixels. A control's and a sheet's follow from it. */
    radius: number;
    /**
     * The typeface. On the web a font stack; on React Native **one** loaded face, used only where the app's
     * own `resolveFontFamily` picks none, because a single face has no fallback for a script it lacks.
     * Empty means the app's own typeface.
     */
    fontFamily: string;
}

/**
 * Today's look, which is the fleet's palette. An app that passes no theme draws exactly this, and on the
 * web it keeps its own Tailwind tokens: only the keys a theme names are applied.
 */
export const defaultChatTheme: Readonly<ChatTheme> = Object.freeze({
    colorAccent: color.accent,
    colorAccentText: color.accentInk,
    colorSurface: color.surface,
    colorText: color.ink,
    colorMuted: color.muted,
    colorBubbleOwn: color.accentSoft,
    colorBubbleOther: color.surface,
    radius: radius.card,
    // The app's own: today the kit never chose a typeface, and a stack would be no face at all on a phone.
    fontFamily: '',
});
