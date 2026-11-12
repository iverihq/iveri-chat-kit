import { chatFontFamily, chatRadii, chatShades, type ChatShadeName } from './chat-shades.js';
import type { ChatTheme } from './chat-theme.js';

/** A CSS custom property the web components read, always under the `--baasi-` prefix. */
export type ChatThemeVariable = `--baasi-${string}`;

/** Each shade's property. `styles/web.css` reads these names, each falling back to the app's own token. */
const VARIABLE: Readonly<Record<ChatShadeName, ChatThemeVariable>> = {
    accent: '--baasi-color-accent',
    accentHover: '--baasi-color-accent-hover',
    accentSoft: '--baasi-color-accent-soft',
    accentLine: '--baasi-color-accent-line',
    accentInk: '--baasi-color-accent-text',
    link: '--baasi-color-link',
    surface: '--baasi-color-surface',
    canvas: '--baasi-color-canvas',
    raised: '--baasi-color-raised',
    sunken: '--baasi-color-sunken',
    line: '--baasi-color-line',
    lineStrong: '--baasi-color-line-strong',
    ink: '--baasi-color-text',
    inkSoft: '--baasi-color-text-soft',
    muted: '--baasi-color-muted',
    faint: '--baasi-color-faint',
    bubbleOwn: '--baasi-color-bubble-own',
    bubbleOwnLine: '--baasi-color-bubble-own-line',
    bubbleOther: '--baasi-color-bubble-other',
    bubbleOtherLine: '--baasi-color-bubble-other-line',
};

function cssMix(colour: string, percent: number, other: string): string {
    return `color-mix(in oklab, ${colour} ${percent}%, ${other})`;
}

/**
 * The `--baasi-*` custom properties a theme writes on the web, **only for the keys it names**.
 *
 * Every web component reads a property with the app's own token as its fallback, so a key left out keeps
 * the app's look and an empty theme writes nothing at all. Pure and exported, so an app can put them on an
 * element of its own as well.
 */
export function chatThemeVariables(theme: Partial<ChatTheme>): Record<ChatThemeVariable, string> {
    const variables: Record<ChatThemeVariable, string> = {};
    const shades = chatShades(theme, cssMix, { text: 'var(--color-ink)', surface: 'var(--color-surface)' });
    for (const [name, value] of Object.entries(shades) as [ChatShadeName, string][]) {
        variables[VARIABLE[name]] = value;
    }

    const radii = chatRadii(theme);
    if (radii !== null) {
        variables['--baasi-radius'] = `${radii.card}px`;
        variables['--baasi-radius-control'] = `${radii.control}px`;
        variables['--baasi-radius-panel'] = `${radii.panel}px`;
    }
    const fontFamily = chatFontFamily(theme);
    if (fontFamily !== null) variables['--baasi-font-family'] = fontFamily;

    return variables;
}
