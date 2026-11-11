import { ChatConversationKind, ChatParticipantStatus } from '@iveri/contracts/chat';
import type { ChatConversation, ChatParticipant } from '@iveri/contracts/chat';

import type { ChatThreadItem } from './thread-item.js';

/**
 * How far one of my messages has got.
 *
 * `read` is for a conversation with one other person; a group says how many have read it, because
 * "read" in a group of forty is a claim about forty people that one tick cannot carry.
 */
export type ChatReadState =
    | { state: 'sending' }
    | { state: 'failed' }
    | { state: 'sent' }
    | { state: 'read' }
    | { state: 'read-by'; count: number };

type ReadContext = Pick<ChatConversation, 'kind' | 'participants'>;

function otherReaders(conversation: ReadContext): ChatParticipant[] {
    return conversation.participants.filter(
        (participant) =>
            !participant.isMe &&
            (participant.status === ChatParticipantStatus.ACTIVE ||
                participant.status === ChatParticipantStatus.REQUEST),
    );
}

/**
 * The read state to draw under a message, or `null` for somebody else's message and for a notice.
 *
 * Read state is a number per participant (`lastReadSeq`), so "read" is a comparison and nothing is
 * stored per message per reader. A participant whose `lastReadSeq` is null has either not accepted a
 * request yet or hides read state, and both read as "sent", which is the honest answer to a question
 * the reader is not allowed to have answered.
 */
export function readStateOf(item: ChatThreadItem, conversation: ReadContext): ChatReadState | null {
    if (item.type === 'pending') return { state: item.pending.status };

    const { message } = item;
    if (!message.isOwn || message.systemKey !== null) return null;

    const others = otherReaders(conversation);
    const readers = others.filter(
        (participant) => participant.lastReadSeq !== null && participant.lastReadSeq >= message.seq,
    ).length;
    const isOneToOne = conversation.kind === ChatConversationKind.DIRECT || others.length === 1;

    if (isOneToOne) return readers > 0 ? { state: 'read' } : { state: 'sent' };

    return readers > 0 ? { state: 'read-by', count: readers } : { state: 'sent' };
}
