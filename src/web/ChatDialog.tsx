import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useChatText } from '../provider/index.js';

import { CloseIcon } from './icons.js';
import { cn, ICON_BUTTON } from './style.js';

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ChatDialogProps {
    title: string;
    onClose: () => void;
    children?: ReactNode;
    /** Buttons along the bottom edge. */
    footer?: ReactNode;
    /** `media` is the lightbox: dark, wide, and no white panel around the photograph. */
    tone?: 'default' | 'media';
    /** Hides the visible title while keeping it as the dialog's accessible name. */
    hideTitle?: boolean;
    className?: string;
}

/**
 * The kit's one modal: a title, Escape to close, focus moved in and handed back, Tab kept inside.
 *
 * **Mounted only while open** (`{isOpen && <ChatDialog …/>}`), which is what lets it record the element
 * that opened it during its first render: a field inside marked `autoFocus` takes focus during commit,
 * before any effect could look, and a dialog that read `document.activeElement` in an effect would
 * remember its own field as its opener and drop focus on `body` when it closed. `conduit-admin-web`
 * shipped exactly that.
 */
export function ChatDialog({
    title,
    onClose,
    children,
    footer,
    tone = 'default',
    hideTitle = false,
    className,
}: Readonly<ChatDialogProps>): React.JSX.Element {
    const t = useChatText();
    const titleId = useId();
    const panel = useRef<HTMLDivElement>(null);
    const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));

    useEffect(() => {
        const node = panel.current;
        if (node !== null && !node.contains(document.activeElement)) node.focus();

        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';

        return (): void => {
            document.body.style.overflow = overflow;
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        };
    }, [opener]);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();

            return;
        }
        if (event.key !== 'Tab' || panel.current === null) return;

        const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (focusable.length === 0) {
            event.preventDefault();

            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const isMedia = tone === 'media';

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
            <div
                aria-hidden="true"
                className={cn('absolute inset-0 animate-fade-in', isMedia ? 'bg-ink/90' : 'bg-ink/40')}
                onClick={onClose}
            />
            <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                className={cn(
                    'relative flex max-h-[92dvh] w-full flex-col outline-hidden',
                    isMedia
                        ? 'h-full max-w-5xl text-white'
                        : 'animate-rise-in rounded-t-panel bg-surface text-ink shadow-xl sm:max-w-lg sm:rounded-panel',
                    className,
                )}
            >
                <div className={cn('flex items-center gap-3 px-5 pt-4', isMedia ? 'pb-2' : 'pb-3')}>
                    <h2
                        id={titleId}
                        className={cn(
                            'min-w-0 flex-1 truncate font-display text-h3 font-semibold',
                            hideTitle && 'sr-only',
                            isMedia && 'text-body font-medium text-white/90',
                        )}
                    >
                        {title}
                    </h2>
                    <button
                        type="button"
                        aria-label={t('chat.common.close')}
                        onClick={onClose}
                        className={cn(
                            ICON_BUTTON,
                            'ms-auto',
                            isMedia && 'text-white/80 hover:bg-white/10 hover:text-white',
                        )}
                    >
                        <CloseIcon />
                    </button>
                </div>
                <div className={cn('min-h-0 flex-1 overflow-y-auto', isMedia ? 'px-2 pb-4' : 'px-5 pb-5')}>
                    {children}
                </div>
                {footer !== undefined && (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-canvas px-5 py-3 sm:rounded-b-panel">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
