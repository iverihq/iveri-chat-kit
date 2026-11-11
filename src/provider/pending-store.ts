import type { UUID } from '@iveri/contracts';

import type { ChatPendingMessage } from '../util/index.js';

type Listener = () => void;

const NONE: readonly ChatPendingMessage[] = Object.freeze([]);

/**
 * Messages the person sent that `chat-api` has not confirmed, per conversation.
 *
 * Kept outside the query cache so no refetch, invalidation or garbage collection can lose one: a
 * message that failed to send stays on screen with its retry until the person retries or removes it,
 * for as long as the provider lives.
 */
export class ChatPendingStore {
    private readonly byConversation = new Map<UUID, readonly ChatPendingMessage[]>();
    private readonly listeners = new Set<Listener>();

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    list(conversationId: UUID): readonly ChatPendingMessage[] {
        return this.byConversation.get(conversationId) ?? NONE;
    }

    find(conversationId: UUID, clientMessageId: UUID): ChatPendingMessage | undefined {
        return this.list(conversationId).find((pending) => pending.clientMessageId === clientMessageId);
    }

    add(pending: ChatPendingMessage): void {
        this.set(pending.conversationId, [...this.list(pending.conversationId), pending]);
    }

    update(conversationId: UUID, clientMessageId: UUID, change: Partial<ChatPendingMessage>): void {
        this.set(
            conversationId,
            this.list(conversationId).map((pending) =>
                pending.clientMessageId === clientMessageId ? { ...pending, ...change } : pending,
            ),
        );
    }

    remove(conversationId: UUID, clientMessageId: UUID): void {
        const remaining = this.list(conversationId).filter((pending) => pending.clientMessageId !== clientMessageId);
        if (remaining.length === this.list(conversationId).length) return;
        this.set(conversationId, remaining);
    }

    private set(conversationId: UUID, pending: readonly ChatPendingMessage[]): void {
        if (pending.length === 0) this.byConversation.delete(conversationId);
        else this.byConversation.set(conversationId, Object.freeze([...pending]));
        for (const listener of this.listeners) listener();
    }
}
