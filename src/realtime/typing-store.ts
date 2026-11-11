import type { UUID } from '@iveri/contracts';

/** How long one typing frame keeps a person in the typing line. Twice the server's 3-second throttle. */
export const TYPING_EXPIRY_MS = 6_000;

type Listener = () => void;

const NOBODY: readonly UUID[] = Object.freeze([]);

/**
 * Who is typing where, from typing frames, each entry gone six seconds after its last frame.
 *
 * Outside the query cache on purpose: it is ephemeral by design (the server stores nothing either), and
 * a cache entry would be refetched, persisted or garbage-collected by rules written for server state.
 * Snapshots are stable arrays, replaced only on change, which is what `useSyncExternalStore` needs.
 */
export class ChatTypingStore {
    private readonly expiries = new Map<UUID, Map<UUID, number>>();
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly snapshots = new Map<UUID, readonly UUID[]>();
    private readonly listeners = new Set<Listener>();

    constructor(private readonly now: () => number = Date.now) {}

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    /** The people typing in a conversation now, in the order they started. */
    typing(conversationId: UUID): readonly UUID[] {
        return this.snapshots.get(conversationId) ?? NOBODY;
    }

    add(conversationId: UUID, userId: UUID): void {
        const people = this.expiries.get(conversationId) ?? new Map<UUID, number>();
        const isNew = !people.has(userId);
        people.set(userId, this.now() + TYPING_EXPIRY_MS);
        this.expiries.set(conversationId, people);

        const timerKey = `${conversationId} ${userId}`;
        const existing = this.timers.get(timerKey);
        if (existing !== undefined) clearTimeout(existing);
        this.timers.set(
            timerKey,
            setTimeout(() => {
                this.timers.delete(timerKey);
                this.remove(conversationId, userId);
            }, TYPING_EXPIRY_MS),
        );

        if (isNew) this.publish(conversationId);
    }

    /** Drops somebody at once, when a message from them arrives and the line would otherwise lag it. */
    remove(conversationId: UUID, userId: UUID): void {
        const people = this.expiries.get(conversationId);
        if (!people?.delete(userId)) return;
        if (people.size === 0) this.expiries.delete(conversationId);

        const timerKey = `${conversationId} ${userId}`;
        const timer = this.timers.get(timerKey);
        if (timer !== undefined) clearTimeout(timer);
        this.timers.delete(timerKey);
        this.publish(conversationId);
    }

    clear(): void {
        for (const timer of this.timers.values()) clearTimeout(timer);
        const conversations = [...this.expiries.keys()];
        this.timers.clear();
        this.expiries.clear();
        for (const conversationId of conversations) this.publish(conversationId);
    }

    private publish(conversationId: UUID): void {
        const people = this.expiries.get(conversationId);
        this.snapshots.set(conversationId, people === undefined ? NOBODY : Object.freeze([...people.keys()]));
        for (const listener of this.listeners) listener();
    }
}
