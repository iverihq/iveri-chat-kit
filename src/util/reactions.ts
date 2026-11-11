import type { Nullable } from '@iveri/contracts';
import type { ChatReactionSummary } from '@iveri/contracts/chat';

/**
 * The reactions under a message after I react with `emoji`, or take mine away with `null`.
 *
 * One reaction per person per message, as `chat-api` keeps them: a new emoji **replaces** mine rather
 * than adding a second. Used for the optimistic update, so the chip moves under the person's finger
 * and the server's answer then confirms it.
 */
export function applyMyReaction(
    reactions: readonly ChatReactionSummary[],
    emoji: Nullable<string>,
): ChatReactionSummary[] {
    const withoutMine = reactions
        .map((reaction) => (reaction.isMine ? { ...reaction, count: reaction.count - 1, isMine: false } : reaction))
        .filter((reaction) => reaction.count > 0);

    if (emoji === null) return withoutMine;

    const existing = withoutMine.find((reaction) => reaction.emoji === emoji);
    if (existing) {
        return withoutMine.map((reaction) =>
            reaction.emoji === emoji ? { ...reaction, count: reaction.count + 1, isMine: true } : reaction,
        );
    }

    return [...withoutMine, { emoji, count: 1, isMine: true }];
}

/** The emoji I reacted with, if any. */
export function myReaction(reactions: readonly ChatReactionSummary[]): Nullable<string> {
    return reactions.find((reaction) => reaction.isMine)?.emoji ?? null;
}
