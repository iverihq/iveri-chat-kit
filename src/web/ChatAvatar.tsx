import type { Nullable } from '@iveri/contracts';
import type { ChatImage } from '@iveri/contracts/chat';

import { initialsOf } from '../util/index.js';

import { cn } from './style.js';

const SIZE_CLASS = {
    xs: 'h-6 w-6 text-2xs',
    sm: 'h-8 w-8 text-caption',
    md: 'h-11 w-11 text-label',
    lg: 'h-16 w-16 text-h3',
} as const;

export interface ChatAvatarProps {
    /** Whose face. Also the accessible name. */
    name: string;
    image?: Nullable<ChatImage>;
    size?: keyof typeof SIZE_CLASS;
    className?: string;
}

/**
 * A person or a conversation, in one circle: their photograph's small size when there is one, their
 * initials otherwise.
 *
 * **One colour for everybody**, as `@iveri/react-kit`'s `Avatar`: tinting by a hash of the name spends
 * the product's accent on decoration. Recognition comes from the initials and a real photograph.
 */
export function ChatAvatar({ name, image, size = 'md', className }: Readonly<ChatAvatarProps>): React.JSX.Element {
    const shell = cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
        'ring-1 ring-inset ring-accent-line',
        SIZE_CLASS[size],
        className,
    );

    if (image !== null && image !== undefined) {
        return (
            <img
                src={image.thumbnailUrl}
                alt={name}
                loading="lazy"
                decoding="async"
                className={cn(shell, 'bg-raised object-cover')}
            />
        );
    }

    return (
        <span
            role="img"
            aria-label={name}
            title={name}
            className={cn(shell, 'bg-accent-soft font-semibold text-accent')}
        >
            {initialsOf(name)}
        </span>
    );
}
