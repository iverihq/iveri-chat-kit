import { chatFontFamily, chatRadii, chatShades, type ChatTheme } from '../theme/index.js';

import type { ChatNativeTheme } from './native-context.js';

type Rgb = readonly [number, number, number];

function parseHex(value: string): Rgb | null {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (match === null) return null;
    const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join('') : match[1];

    return [
        Number.parseInt(digits.slice(0, 2), 16),
        Number.parseInt(digits.slice(2, 4), 16),
        Number.parseInt(digits.slice(4, 6), 16),
    ];
}

/**
 * `percent` of `colour` over `other`, as hex. React Native has no `color-mix()`, so the shades a theme
 * implies are mixed here. A colour that is not hex cannot be mixed, and then the given colour itself stands
 * in, which is never invisible and never a crash.
 */
export function mixHex(colour: string, percent: number, other: string): string {
    const a = parseHex(colour);
    const b = parseHex(other);
    if (a === null || b === null) return colour;
    const weight = Math.min(Math.max(percent, 0), 100) / 100;

    return `#${a
        .map((channel, index) => Math.round(channel * weight + b[index] * (1 - weight)))
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`;
}

/**
 * The native palette with a `ChatProvider` theme laid over it: the same keys and the same derived shades
 * the web turns into `--baasi-*` properties, so one brand looks alike on both.
 */
export function applyChatTheme(base: ChatNativeTheme, theme: Partial<ChatTheme>): ChatNativeTheme {
    const shades = chatShades(theme, mixHex, { text: base.color.ink, surface: base.color.surface });
    const color = {
        ...base.color,
        ...Object.fromEntries(Object.entries(shades).filter(([name]) => name in base.color)),
    };
    const radii = chatRadii(theme);

    return {
        color,
        radius: radii === null ? base.radius : { ...base.radius, ...radii },
        bubble: {
            own: shades.bubbleOwn ?? shades.accentSoft ?? base.bubble.own,
            ownLine: shades.bubbleOwnLine ?? shades.accentLine ?? base.bubble.ownLine,
            other: shades.bubbleOther ?? shades.surface ?? base.bubble.other,
            otherLine: shades.bubbleOtherLine ?? shades.line ?? base.bubble.otherLine,
        },
        fontFamily: chatFontFamily(theme) ?? base.fontFamily,
    };
}
