type ClassValue = string | false | null | undefined;

/** Joins class names, keeping the kit free of a styling runtime. */
export function cn(...values: ClassValue[]): string {
    return values.filter(Boolean).join(' ');
}

/**
 * The keyboard focus indicator, character for character `@iveri/react-kit`'s `FOCUS_RING`, so a chat
 * dropped into any panel focuses exactly like the panel around it. A ring, not a colour change, because
 * colour never carries meaning alone; `focus-visible`, so a mouse click draws nothing.
 */
export const FOCUS_RING =
    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

/** A round icon button: 36px to sight, the whole circle to the pointer. */
export const ICON_BUTTON = cn(
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted',
    'transition-colors duration-fast hover:bg-raised hover:text-ink disabled:pointer-events-none disabled:opacity-40',
    FOCUS_RING,
);

/** The two button styles the kit needs. A primary is navy; a quiet one is text on the surface. */
export const PRIMARY_BUTTON = cn(
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-control bg-accent px-4 text-label font-semibold text-accent-ink',
    'shadow-sm transition-colors duration-fast hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50',
    FOCUS_RING,
);

export const QUIET_BUTTON = cn(
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 text-label font-medium text-ink',
    'transition-colors duration-fast hover:border-line-strong hover:bg-raised disabled:pointer-events-none disabled:opacity-50',
    FOCUS_RING,
);

export const DANGER_BUTTON = cn(
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-control bg-critical px-4 text-label font-semibold text-white',
    'shadow-sm transition duration-fast hover:brightness-95 disabled:pointer-events-none disabled:opacity-50',
    FOCUS_RING,
);

export const TEXT_INPUT = cn(
    'block w-full rounded-control border border-line bg-surface px-3 py-2 text-body text-ink placeholder:text-faint',
    'transition-colors duration-fast hover:border-line-strong focus:border-accent',
    FOCUS_RING,
);
