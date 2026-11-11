/**
 * A calendar day as `YYYY-MM-DD`, in the given time zone or the device's.
 *
 * `en-CA` is used for its numeric year-month-day order only; nothing a person reads comes from it.
 * A day is a calendar fact, not 24 hours: a message at 23:59 and one at 00:01 are on two days, which
 * is what the separator between them has to say.
 */
export function calendarDay(value: Date, timeZone?: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
        value,
    );
}

/** Whole calendar days from `earlier` to `later` in one time zone: 0 is the same day, 1 is yesterday. */
export function calendarDaysBetween(earlier: Date, later: Date, timeZone?: string): number {
    const toUtcNoon = (day: string): number => {
        const [year, month, date] = day.split('-').map(Number);

        return Date.UTC(year, month - 1, date, 12);
    };

    return Math.round(
        (toUtcNoon(calendarDay(later, timeZone)) - toUtcNoon(calendarDay(earlier, timeZone))) / 86_400_000,
    );
}
