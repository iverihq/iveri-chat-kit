import { useEffect, useState } from 'react';

/** The value, once it has stopped changing for `delayMs`. A search box asks once per pause, not per key. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [settled, setSettled] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setSettled(value);
        }, delayMs);

        return (): void => {
            clearTimeout(timer);
        };
    }, [value, delayMs]);

    return settled;
}
