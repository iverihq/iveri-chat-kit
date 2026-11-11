import type { Maybe, UUID } from '@iveri/contracts';
import { ChatRealtimeEvent } from '@iveri/contracts/chat';
import type { ChatConversation, ChatRealtimeFrame } from '@iveri/contracts/chat';
import type { QueryClient } from '@tanstack/react-query';

import { chatQueryKeys } from '../query/query-keys.js';

import type { ChatTypingStore } from './typing-store.js';

export interface FrameHandlerContext {
    queryClient: QueryClient;
    typing: ChatTypingStore;
}

/** Refetches everything that shows one conversation: its messages, its detail, a by-context lookup of it. */
async function invalidateConversation(queryClient: QueryClient, conversationId: UUID): Promise<void> {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(conversationId) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(conversationId) }),
        queryClient.invalidateQueries({
            queryKey: [chatQueryKeys.all[0], 'conversation-by-context'],
            predicate: (query) => (query.state.data as Maybe<ChatConversation>)?.id === conversationId,
        }),
    ]);
}

/**
 * Applies one socket frame to the cache by invalidating **exactly what it names**.
 *
 * A frame carries identifiers and never content (the messenger plan, "Realtime"): `chat-api` is the
 * only thing that knows what this reader may see after a block, a deletion or a moderator's decision,
 * so a frame only says where to look again. That is also why a dropped or duplicated frame is harmless.
 *
 * - `conversation.updated` → that conversation's messages (the window fetches what is after the newest
 *   `seq` it holds and re-reads its tail, which is where an edit or a reaction lands), its detail
 *   (another participant's read state moves the ticks), and every inbox.
 * - `inbox.updated` → every inbox, and the conversation's detail when one is named (my read state,
 *   moved by another of my devices).
 * - `conversation.typing` → the typing line. My own devices' frames are stored too and filtered where
 *   the line is read (`useTypingPeople`), which is the one place that knows who "me" is right now.
 */
export async function applyRealtimeFrame(frame: ChatRealtimeFrame, context: FrameHandlerContext): Promise<void> {
    const { queryClient } = context;

    switch (frame.event) {
        case ChatRealtimeEvent.CONVERSATION_UPDATED: {
            const work: Promise<void>[] = [queryClient.invalidateQueries({ queryKey: chatQueryKeys.inboxes() })];
            if (frame.conversationId !== null) work.push(invalidateConversation(queryClient, frame.conversationId));
            await Promise.all(work);

            return;
        }
        case ChatRealtimeEvent.INBOX_UPDATED: {
            const work: Promise<void>[] = [queryClient.invalidateQueries({ queryKey: chatQueryKeys.inboxes() })];
            if (frame.conversationId !== null) {
                work.push(
                    queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(frame.conversationId) }),
                );
            }
            await Promise.all(work);

            return;
        }
        case ChatRealtimeEvent.CONVERSATION_TYPING: {
            if (frame.conversationId === null || frame.userId === null) return;
            context.typing.add(frame.conversationId, frame.userId);

            return;
        }
    }
}

/** After a (re)connect: everything a missed frame could have changed is looked at again. */
export async function recoverAfterConnect(queryClient: QueryClient): Promise<void> {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.inboxes() }),
        queryClient.invalidateQueries({ queryKey: [chatQueryKeys.all[0], 'messages'] }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() }),
    ]);
}
