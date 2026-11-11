import type { Nullable } from '@iveri/contracts';

export interface PinToNewestInput {
    /** The key of the newest row before this render. */
    previousNewestKey: Nullable<string>;
    newestKey: Nullable<string>;
    /** Whether the reader was at the newest message before it changed. */
    wasAtNewest: boolean;
    /** Whether the newest row is the reader's own: a message they just sent. */
    newestIsOwn: boolean;
}

/**
 * Whether a thread should move to its newest message after its rows changed.
 *
 * Only when the newest row is a different one, and then only if the reader was already at the bottom or
 * just sent it themselves. Older pages arriving above, an edit, or a reaction never move the view, so
 * somebody reading back through a conversation is not pulled away from what they are reading.
 */
export function shouldPinToNewest({
    previousNewestKey,
    newestKey,
    wasAtNewest,
    newestIsOwn,
}: PinToNewestInput): boolean {
    if (newestKey === null || newestKey === previousNewestKey) return false;

    return wasAtNewest || newestIsOwn || previousNewestKey === null;
}
