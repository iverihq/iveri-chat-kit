import { readFileSync } from 'node:fs';
import path from 'node:path';

import { color, radius } from '@iveri/tokens';
import { describe, expect, it } from 'vitest';

import { chatThemeVariables, defaultChatTheme, type ChatTheme } from './index.js';

const BRAND: ChatTheme = {
    colorAccent: '#c2410c',
    colorAccentText: '#ffffff',
    colorSurface: '#fffaf5',
    colorText: '#1c1917',
    colorMuted: '#78716c',
    colorBubbleOwn: '#ffedd5',
    colorBubbleOther: '#ffffff',
    radius: 18,
    fontFamily: 'Georgia, serif',
};

describe('chatThemeVariables', () => {
    it('writes nothing for no theme, so the web components keep the app’s own tokens', () => {
        expect(chatThemeVariables({})).toEqual({});
    });

    it('writes only what a theme names, and the shades that follow from it', () => {
        const variables = chatThemeVariables({ colorAccent: '#c2410c' });

        expect(variables['--baasi-color-accent']).toBe('#c2410c');
        expect(variables['--baasi-color-link']).toBe('#c2410c');
        expect(variables['--baasi-color-accent-soft']).toBe('color-mix(in oklab, #c2410c 10%, var(--color-surface))');
        // Nothing the theme left out is touched: the app's surface, text and bubbles stand.
        expect(
            Object.keys(variables).every(
                (name) => name.startsWith('--baasi-color-accent') || name === '--baasi-color-link',
            ),
        ).toBe(true);
    });

    it('reads as today’s look for the default theme: the fleet’s own colours, never mixed ones', () => {
        const variables = chatThemeVariables(defaultChatTheme);

        expect(variables).toMatchObject({
            '--baasi-color-accent': color.accent,
            '--baasi-color-accent-hover': color.accentHover,
            '--baasi-color-accent-soft': color.accentSoft,
            '--baasi-color-accent-line': color.accentLine,
            '--baasi-color-link': color.link,
            '--baasi-color-surface': color.surface,
            '--baasi-color-canvas': color.canvas,
            '--baasi-color-line': color.line,
            '--baasi-color-text-soft': color.inkSoft,
            '--baasi-color-faint': color.faint,
            '--baasi-color-bubble-own': color.accentSoft,
            '--baasi-color-bubble-own-line': color.accentLine,
            '--baasi-color-bubble-other': color.surface,
            '--baasi-color-bubble-other-line': color.line,
            '--baasi-radius': `${radius.card}px`,
            '--baasi-radius-control': `${radius.control}px`,
            '--baasi-radius-panel': `${radius.panel}px`,
        });
        // The app's typeface, as today: no theme ever chose one.
        expect(variables).not.toHaveProperty('--baasi-font-family');
    });

    it('names only properties the stylesheet reads, each with the app’s token behind it', () => {
        const stylesheet = readFileSync(path.resolve(process.cwd(), 'styles/web.css'), 'utf8');

        for (const name of Object.keys(chatThemeVariables(BRAND))) {
            expect(stylesheet, name).toMatch(new RegExp(`var\\(\\s*${name},\\s*var\\(`));
        }
    });
});
