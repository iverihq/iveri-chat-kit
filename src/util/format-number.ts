/** The largest unread count a badge spells out; above it the badge reads `99+`. */
export const UNREAD_BADGE_MAX = 99;

/**
 * An unread badge's text: empty for nothing unread, `99+` past the cap, the count otherwise.
 *
 * The cap is the badge's width, not a judgement about the number: a three-digit count stretches a
 * circle into a lozenge on every row it appears on, and nobody acts differently on 140 than on 99+.
 * The digits come from the locale so the badge matches every other number on the screen.
 */
export function formatUnreadBadge(count: number, locale: string): string {
    if (!Number.isFinite(count) || count <= 0) return '';

    const format = new Intl.NumberFormat(locale);
    if (count > UNREAD_BADGE_MAX) return `${format.format(UNREAD_BADGE_MAX)}+`;

    return format.format(Math.floor(count));
}

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;

/**
 * A file's size in the reader's language: `340 KB`, `1,5 МБ`, `2,1 მბ`.
 *
 * `Intl.NumberFormat`'s unit style rather than a hand-made `KB`, because each language abbreviates
 * the units in its own script and puts its own separator in the decimal. Decimal units (1000), as
 * every operating system's file browser shows a size.
 */
export function formatByteSize(bytes: number, locale: string): string {
    let value = Math.max(0, bytes);
    let unit = 0;

    while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
        value /= 1000;
        unit += 1;
    }

    return new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: BYTE_UNITS[unit],
        unitDisplay: 'short',
        maximumFractionDigits: unit === 0 || value >= 100 ? 0 : 1,
    }).format(value);
}
