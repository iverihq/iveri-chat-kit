import type { Nullable, UUID } from '@iveri/contracts';

import { calendarDay } from './calendar.js';
import { itemIsOwn, itemIsSystem, itemSenderId, itemSentAt, type ChatThreadItem } from './thread-item.js';

/** Two messages from one person this close together read as one run, under one name and one avatar. */
export const RUN_GAP_MS = 5 * 60 * 1000;

/** Consecutive messages from one sender. A system notice is always a run of its own. */
export interface ChatMessageRun {
    key: string;
    senderId: Nullable<UUID>;
    isOwn: boolean;
    isSystem: boolean;
    items: ChatThreadItem[];
}

/** One calendar day of a thread, under its separator. */
export interface ChatDaySection {
    /** `YYYY-MM-DD` in the reader's time zone. */
    day: string;
    /** The first item's moment, for the separator's label. */
    firstSentAt: string;
    runs: ChatMessageRun[];
}

export interface GroupMessagesOptions {
    myUserId: Nullable<UUID>;
    /** The reader's time zone; the device's when absent. Specs pass one so a day boundary is fixed. */
    timeZone?: string;
    /** An item that must start a run of its own: the first unread one, which the "new messages" line sits above. */
    breakBefore?: string | null;
}

/**
 * Lays a thread out as days, and each day as runs by sender.
 *
 * A run ends when the sender changes, when five minutes pass between two of their messages, at a day
 * boundary, and at any system notice, because a notice is the conversation speaking rather than a
 * person and must never be drawn as the next line of whoever spoke before it. The items must already
 * be in order; nothing here sorts, because the window and the pending list each keep their own order.
 */
export function groupMessages(items: readonly ChatThreadItem[], options: GroupMessagesOptions): ChatDaySection[] {
    const sections: ChatDaySection[] = [];
    let previousSentAt = 0;

    for (const item of items) {
        const sentAt = itemSentAt(item);
        const moment = new Date(sentAt);
        const day = calendarDay(moment, options.timeZone);
        let section = sections.at(-1);

        if (section?.day !== day) {
            section = { day, firstSentAt: sentAt, runs: [] };
            sections.push(section);
        }

        const isSystem = itemIsSystem(item);
        const senderId = isSystem ? null : itemSenderId(item, options.myUserId);
        const run = section.runs.at(-1);
        const continues =
            run !== undefined &&
            !run.isSystem &&
            !isSystem &&
            run.senderId === senderId &&
            run.isOwn === itemIsOwn(item) &&
            item.key !== options.breakBefore &&
            moment.getTime() - previousSentAt <= RUN_GAP_MS;

        if (continues) {
            run.items.push(item);
        } else {
            section.runs.push({ key: item.key, senderId, isOwn: itemIsOwn(item), isSystem, items: [item] });
        }

        previousSentAt = moment.getTime();
    }

    return sections;
}
