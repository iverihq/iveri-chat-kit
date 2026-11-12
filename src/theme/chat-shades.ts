import { color } from '@iveri/tokens';

import { defaultChatTheme, type ChatTheme } from './chat-theme.js';

/** Every colour the components draw with that a theme can reach, named as the native palette names them. */
export type ChatShadeName =
    | 'accent'
    | 'accentHover'
    | 'accentSoft'
    | 'accentLine'
    | 'accentInk'
    | 'link'
    | 'surface'
    | 'canvas'
    | 'raised'
    | 'sunken'
    | 'line'
    | 'lineStrong'
    | 'ink'
    | 'inkSoft'
    | 'muted'
    | 'faint'
    | 'bubbleOwn'
    | 'bubbleOwnLine'
    | 'bubbleOther'
    | 'bubbleOtherLine';

/** `percent` of `colour` over `other`: `color-mix()` on the web, arithmetic on a phone. */
export type ChatColourMixer = (colour: string, percent: number, other: string) => string;

function isSet(value: string | undefined): value is string {
    return value !== undefined && value !== '';
}

function same(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * The shades a theme implies, **only for the keys it names**, the same on both platforms.
 *
 * A brand names a handful of colours and a chat needs a dozen, so the rest are mixed from them: a hover,
 * a soft wash, a hairline, the canvas. A colour that is the fleet's own keeps the fleet's own shades
 * rather than mixed ones, which is what makes `defaultChatTheme` draw exactly today's look.
 */
export function chatShades(
    theme: Partial<ChatTheme>,
    mix: ChatColourMixer,
    fallback: { text: string; surface: string },
): Partial<Record<ChatShadeName, string>> {
    const shades: Partial<Record<ChatShadeName, string>> = {};
    const text = isSet(theme.colorText) ? theme.colorText : fallback.text;
    const surface = isSet(theme.colorSurface) ? theme.colorSurface : fallback.surface;

    if (isSet(theme.colorAccent)) {
        const isFleet = same(theme.colorAccent, defaultChatTheme.colorAccent);
        shades.accent = theme.colorAccent;
        shades.accentHover = isFleet ? color.accentHover : mix(theme.colorAccent, 86, '#000000');
        shades.accentSoft = isFleet ? color.accentSoft : mix(theme.colorAccent, 10, surface);
        shades.accentLine = isFleet ? color.accentLine : mix(theme.colorAccent, 28, surface);
        // A link in a message reads in the brand's colour; the fleet keeps its own, bluer link.
        shades.link = isFleet ? color.link : theme.colorAccent;
    }
    if (isSet(theme.colorAccentText)) shades.accentInk = theme.colorAccentText;
    if (isSet(theme.colorSurface)) {
        const isFleet =
            same(theme.colorSurface, defaultChatTheme.colorSurface) &&
            (!isSet(theme.colorText) || same(theme.colorText, defaultChatTheme.colorText));
        shades.surface = theme.colorSurface;
        shades.canvas = isFleet ? color.canvas : mix(text, 3, surface);
        shades.raised = isFleet ? color.raised : mix(text, 5, surface);
        shades.sunken = isFleet ? color.sunken : mix(text, 7, surface);
        shades.line = isFleet ? color.line : mix(text, 13, surface);
        shades.lineStrong = isFleet ? color.lineStrong : mix(text, 24, surface);
    }
    if (isSet(theme.colorText)) {
        shades.ink = theme.colorText;
        shades.inkSoft = same(theme.colorText, defaultChatTheme.colorText)
            ? color.inkSoft
            : mix(theme.colorText, 82, surface);
    }
    if (isSet(theme.colorMuted)) {
        shades.muted = theme.colorMuted;
        shades.faint = same(theme.colorMuted, defaultChatTheme.colorMuted)
            ? color.faint
            : mix(theme.colorMuted, 72, surface);
    }
    if (isSet(theme.colorBubbleOwn)) {
        shades.bubbleOwn = theme.colorBubbleOwn;
        shades.bubbleOwnLine = same(theme.colorBubbleOwn, defaultChatTheme.colorBubbleOwn)
            ? color.accentLine
            : mix(theme.colorBubbleOwn, 82, text);
    }
    if (isSet(theme.colorBubbleOther)) {
        shades.bubbleOther = theme.colorBubbleOther;
        shades.bubbleOtherLine = same(theme.colorBubbleOther, defaultChatTheme.colorBubbleOther)
            ? color.line
            : mix(text, 13, theme.colorBubbleOther);
    }

    return shades;
}

/** A card's radius and the control and sheet radii that follow from it, or null when none was named. */
export function chatRadii(theme: Partial<ChatTheme>): { control: number; card: number; panel: number } | null {
    const radius = theme.radius;
    if (radius === undefined || !Number.isFinite(radius) || radius < 0) return null;

    return { control: Math.round((radius * 2) / 3), card: radius, panel: Math.round((radius * 4) / 3) };
}

/** A typeface the theme names, or null for the app's own. */
export function chatFontFamily(theme: Partial<ChatTheme>): string | null {
    return isSet(theme.fontFamily) ? theme.fontFamily : null;
}
