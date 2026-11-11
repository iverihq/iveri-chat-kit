import type { ReactNode } from 'react';

import { cn } from './style.js';

interface IconProps {
    className?: string;
}

/**
 * The kit's glyphs: inline SVG on the fleet's grid (`viewBox 0 0 20 20`, `currentColor`, stroke 1.7), so
 * they inherit the colour of whatever they sit in and need no icon library. Drawn for this kit; none is
 * traced from another product. Always `aria-hidden`: every control carrying one has a label of its own.
 */
function Glyph({ className, children }: Readonly<IconProps & { children: ReactNode }>): React.JSX.Element {
    return (
        <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className={cn('h-5 w-5 shrink-0', className)}
        >
            {children}
        </svg>
    );
}

export function BackIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M12.5 4.5 7 10l5.5 5.5" />
        </Glyph>
    );
}

export function ForwardIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M7.5 4.5 13 10l-5.5 5.5" />
        </Glyph>
    );
}

export function MoreIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <circle cx="5" cy="10" r="0.9" fill="currentColor" />
            <circle cx="10" cy="10" r="0.9" fill="currentColor" />
            <circle cx="15" cy="10" r="0.9" fill="currentColor" />
        </Glyph>
    );
}

export function SearchIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <circle cx="9" cy="9" r="5" />
            <path d="m13 13 3.5 3.5" />
        </Glyph>
    );
}

export function CloseIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
        </Glyph>
    );
}

export function PlusIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M10 4.5v11M4.5 10h11" />
        </Glyph>
    );
}

/** Send: an arrow leaving a line, rising, rather than any paper aircraft. */
export function SendIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M10 15.5V5" />
            <path d="m5.5 9.5 4.5-4.5 4.5 4.5" />
        </Glyph>
    );
}

export function AttachIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M13.5 9.5 9 14a3 3 0 0 1-4.2-4.2l5.4-5.4a2 2 0 0 1 2.8 2.8l-5.3 5.3a1 1 0 0 1-1.4-1.4L10.8 6.6" />
        </Glyph>
    );
}

export function PhotoIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <rect x="3" y="4" width="14" height="12" rx="2" />
            <circle cx="7.5" cy="8.5" r="1.3" />
            <path d="m3.5 14.5 4-3.5 3 2.5 2.5-2 3.5 3" />
        </Glyph>
    );
}

export function FileIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M11.5 3H6.5A1.5 1.5 0 0 0 5 4.5v11A1.5 1.5 0 0 0 6.5 17h7a1.5 1.5 0 0 0 1.5-1.5V6.5Z" />
            <path d="M11.5 3v3.5H15M7.5 10.5h5M7.5 13.5h3.5" />
        </Glyph>
    );
}

export function MicIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <rect x="7.5" y="3" width="5" height="9" rx="2.5" />
            <path d="M4.8 9.5a5.2 5.2 0 0 0 10.4 0M10 14.7V17" />
        </Glyph>
    );
}

export function PlayIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M7 5.2v9.6a.6.6 0 0 0 .9.5l7.5-4.8a.6.6 0 0 0 0-1L7.9 4.7a.6.6 0 0 0-.9.5Z" fill="currentColor" />
        </Glyph>
    );
}

export function PauseIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M7 5v10M13 5v10" strokeWidth="2.4" />
        </Glyph>
    );
}

export function ReplyIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M8 5 3.5 9.5 8 14" />
            <path d="M3.5 9.5h7.5a5 5 0 0 1 5 5V16" />
        </Glyph>
    );
}

export function ReactIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <circle cx="9.5" cy="10.5" r="6" />
            <path d="M7 12.2a3.2 3.2 0 0 0 5 0" />
            <circle cx="7.6" cy="8.8" r="0.5" fill="currentColor" />
            <circle cx="11.4" cy="8.8" r="0.5" fill="currentColor" />
            <path d="M15.5 2.5v4M13.5 4.5h4" />
        </Glyph>
    );
}

export function CopyIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <rect x="7" y="7" width="9" height="9" rx="1.6" />
            <path d="M13 7V5.6A1.6 1.6 0 0 0 11.4 4H5.6A1.6 1.6 0 0 0 4 5.6v5.8A1.6 1.6 0 0 0 5.6 13H7" />
        </Glyph>
    );
}

export function EditIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M12.5 4.5 15.5 7.5 7.5 15.5H4.5v-3Z" />
            <path d="m10.5 6.5 3 3" />
        </Glyph>
    );
}

export function TrashIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M4 6h12M8 6V4.5h4V6M5.5 6l.7 9.2A1.5 1.5 0 0 0 7.7 16.5h4.6a1.5 1.5 0 0 0 1.5-1.3l.7-9.2" />
        </Glyph>
    );
}

export function FlagIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M5 17V3.5M5 4h9l-2 3.5 2 3.5H5" />
        </Glyph>
    );
}

export function PinIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M7.5 3.5h5l-.8 4.5 2.8 2.5v1.5h-9V10.5L8.3 8Z" />
            <path d="M10 12v4.5" />
        </Glyph>
    );
}

export function MuteIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M6 7.5a4 4 0 0 1 7.6-1.7M14 9.5v2.3l1.5 2.2H7.5M5 14h-.5L6 11.8V9.5" />
            <path d="M8.5 16a1.7 1.7 0 0 0 3 0M3.5 3.5l13 13" />
        </Glyph>
    );
}

export function BellIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M6 9.5a4 4 0 0 1 8 0v2.3l1.5 2.2h-11L6 11.8Z" />
            <path d="M8.5 16a1.7 1.7 0 0 0 3 0" />
        </Glyph>
    );
}

export function ArchiveIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <rect x="3" y="4" width="14" height="3.5" rx="1" />
            <path d="M4.5 7.5v7A1.5 1.5 0 0 0 6 16h8a1.5 1.5 0 0 0 1.5-1.5v-7M8.5 10.5h3" />
        </Glyph>
    );
}

export function InfoIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <circle cx="10" cy="10" r="6.5" />
            <path d="M10 9v4.5" />
            <circle cx="10" cy="6.6" r="0.5" fill="currentColor" />
        </Glyph>
    );
}

export function LeaveIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
            <path d="M12.5 13.5 16 10l-3.5-3.5M16 10H8" />
        </Glyph>
    );
}

export function BlockIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <circle cx="10" cy="10" r="6.5" />
            <path d="m5.4 14.6 9.2-9.2" />
        </Glyph>
    );
}

export function PersonAddIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <circle cx="8" cy="7" r="3" />
            <path d="M2.5 16a5.5 5.5 0 0 1 9.5-3.8M15 11v5M12.5 13.5h5" />
        </Glyph>
    );
}

export function DownloadIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M10 3.5v9M6 8.5l4 4 4-4M4 16h12" />
        </Glyph>
    );
}

export function LinkIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.8.8" />
            <path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.8-.8" />
        </Glyph>
    );
}

export function CheckIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="m4.5 10.5 3.5 3.5 7.5-8" />
        </Glyph>
    );
}

export function AlertIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <circle cx="10" cy="10" r="6.5" />
            <path d="M10 6.5v4" />
            <circle cx="10" cy="13.4" r="0.5" fill="currentColor" />
        </Glyph>
    );
}

export function ArrowDownIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M10 4.5v11M5.5 11 10 15.5l4.5-4.5" />
        </Glyph>
    );
}

export function ChatBubblesIcon(props: IconProps): React.JSX.Element {
    return (
        <Glyph {...props}>
            <path d="M3.5 5.5A2 2 0 0 1 5.5 3.5h6a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2H8l-3 2.5v-2.5h0a1.5 1.5 0 0 1-1.5-1.5Z" />
            <path d="M13.5 7.5H15a1.5 1.5 0 0 1 1.5 1.5v3.5A1.5 1.5 0 0 1 15 14h0v2l-2.5-2H10a1.5 1.5 0 0 1-1.5-1.5v-.5" />
        </Glyph>
    );
}
