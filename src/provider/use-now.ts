import { useSyncExternalStore } from 'react';

const TICK_MS = 30_000;

let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (timer === null) {
        now = Date.now();
        timer = setInterval(() => {
            now = Date.now();
            for (const notify of listeners) notify();
        }, TICK_MS);
    }

    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
            clearInterval(timer);
            timer = null;
        }
    };
}

const snapshot = (): number => now;

/**
 * "Now", to the half minute, shared by every label that says "Today" or "5 minutes ago".
 *
 * A component reading the clock during render is impure (the same props would draw a different screen),
 * and one timer per row of an inbox would be fifty timers. This is one, running only while something
 * shows a relative time, which is also what moves "Today" to "Yesterday" at midnight on an open screen.
 */
export function useNow(): Date {
    return new Date(useSyncExternalStore(subscribe, snapshot, snapshot));
}
