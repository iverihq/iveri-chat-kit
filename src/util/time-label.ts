import type { ChatTranslate } from '../i18n/index.js';

import { calendarDay, calendarDaysBetween } from './calendar.js';

/**
 * Every date and time the kit shows, formatted with `Intl` in **the locale the app passed in** and
 * never the browser's. A panel set to Georgian on an English machine would otherwise render half of
 * every sentence in each language, which is exactly the defect `unibox-web` once shipped.
 */
export interface TimeLabelOptions {
    locale: string;
    /** The reader's time zone; the device's when absent. */
    timeZone?: string;
    /** "Now", passed in so a label is a pure function of its inputs. */
    now?: Date;
}

const WEEK_DAYS = 7;

/** The time a message was sent, in the locale's own clock: `14:05`, or `2:05 PM` in English. */
export function formatMessageTime(iso: string, { locale, timeZone }: TimeLabelOptions): string {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

/** A day separator: "Today", "Yesterday", a weekday this week, and a date before that. */
export function formatDayLabel(iso: string, t: ChatTranslate, options: TimeLabelOptions): string {
    const moment = new Date(iso);
    const now = options.now ?? new Date();
    const days = calendarDaysBetween(moment, now, options.timeZone);

    if (days === 0) return t('chat.day.today');
    if (days === 1) return t('chat.day.yesterday');

    const sameYear =
        calendarDay(moment, options.timeZone).slice(0, 4) === calendarDay(now, options.timeZone).slice(0, 4);
    const format: Intl.DateTimeFormatOptions =
        days > 1 && days < WEEK_DAYS
            ? { weekday: 'long', day: 'numeric', month: 'long' }
            : { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) };

    return new Intl.DateTimeFormat(options.locale, { ...format, timeZone: options.timeZone }).format(moment);
}

/** The time on an inbox row: a clock today, "Yesterday", a short weekday this week, a short date after. */
export function formatInboxTime(iso: string, t: ChatTranslate, options: TimeLabelOptions): string {
    const moment = new Date(iso);
    const now = options.now ?? new Date();
    const days = calendarDaysBetween(moment, now, options.timeZone);

    if (days <= 0) return formatMessageTime(iso, options);
    if (days === 1) return t('chat.day.yesterday');

    const sameYear =
        calendarDay(moment, options.timeZone).slice(0, 4) === calendarDay(now, options.timeZone).slice(0, 4);
    const format: Intl.DateTimeFormatOptions =
        days < WEEK_DAYS
            ? { weekday: 'short' }
            : { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) };

    return new Intl.DateTimeFormat(options.locale, { ...format, timeZone: options.timeZone }).format(moment);
}

/**
 * "Last active 5 minutes ago". A time rather than an online dot, because a dot is wrong whenever a
 * phone is in a pocket and a time is honest (the messenger plan, "Presence").
 *
 * The minutes, hours and days are the namespace's own plurals rather than `Intl.RelativeTimeFormat`: a
 * browser built with reduced ICU has no Georgian relative-time data and answers in English, which would
 * put "4 minutes ago" into a Georgian sentence. Only a date older than a week comes from `Intl`.
 */
export function formatLastActive(iso: string, t: ChatTranslate, options: TimeLabelOptions): string {
    const now = options.now ?? new Date();
    const seconds = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = calendarDaysBetween(new Date(iso), now, options.timeZone);

    if (minutes < 1) return t('chat.presence.just-now');
    if (minutes < 60) return t('chat.presence.minutes', { count: minutes });
    if (hours < 24 && days === 0) return t('chat.presence.hours', { count: hours });
    if (days <= 1) return t('chat.presence.yesterday');
    if (days < WEEK_DAYS) return t('chat.presence.days', { count: days });

    const when = new Intl.DateTimeFormat(options.locale, {
        day: 'numeric',
        month: 'long',
        timeZone: options.timeZone,
    }).format(new Date(iso));

    return t('chat.presence.last-active', { when });
}

/** A voice note's length as `m:ss`. Digits and a colon read the same in all three languages. */
export function formatDuration(milliseconds: number): string {
    const total = Math.max(0, Math.round(milliseconds / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
