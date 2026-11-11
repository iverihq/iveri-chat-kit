import type { Nullable } from '@iveri/contracts';

import type { ChatDaySection } from './message-groups.js';
import type { ChatThreadItem } from './thread-item.js';

export type ChatBubblePosition = 'single' | 'first' | 'middle' | 'last';

/** One row of a flat list, which is what a virtualised list on a phone draws. */
export type ChatThreadRow =
    | { type: 'day'; key: string; sentAt: string }
    | { type: 'new-messages'; key: string }
    | { type: 'notice'; key: string; item: ChatThreadItem }
    | {
          type: 'message';
          key: string;
          item: ChatThreadItem;
          position: ChatBubblePosition;
          /** The first bubble of somebody else's run in a conversation of more than two: their name goes above it. */
          showSender: boolean;
          /** The last bubble of that run: their face goes beside it. */
          showAvatar: boolean;
      };

/**
 * Flattens days and runs into rows, oldest first: a day label, then each run's bubbles, with the "new
 * messages" line before the run that starts at the first unread message. A list that draws newest at the
 * bottom (React Native's `inverted`) reverses this once.
 */
export function threadRows(
    sections: readonly ChatDaySection[],
    { dividerKey, showsSenders }: { dividerKey: Nullable<string>; showsSenders: boolean },
): ChatThreadRow[] {
    const rows: ChatThreadRow[] = [];

    for (const section of sections) {
        rows.push({ type: 'day', key: `day:${section.day}`, sentAt: section.firstSentAt });
        for (const run of section.runs) {
            if (run.key === dividerKey) rows.push({ type: 'new-messages', key: 'new-messages' });
            if (run.isSystem) {
                rows.push({ type: 'notice', key: run.items[0].key, item: run.items[0] });
                continue;
            }
            run.items.forEach((item, index) => {
                const position: ChatBubblePosition =
                    run.items.length === 1
                        ? 'single'
                        : index === 0
                          ? 'first'
                          : index === run.items.length - 1
                            ? 'last'
                            : 'middle';
                const isOther = showsSenders && !run.isOwn;
                rows.push({
                    type: 'message',
                    key: item.key,
                    item,
                    position,
                    showSender: isOther && index === 0,
                    showAvatar: isOther && index === run.items.length - 1,
                });
            });
        }
    }

    return rows;
}
