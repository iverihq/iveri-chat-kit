import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { MoreIcon } from './icons.js';
import { fitPopover, type PopoverFit } from './popover-fit.js';
import { cn, FOCUS_RING, ICON_BUTTON } from './style.js';

export type ChatMenuItem =
    | {
          type?: 'item';
          key: string;
          label: string;
          icon?: ReactNode;
          tone?: 'default' | 'danger';
          disabled?: boolean;
          onSelect: () => void;
      }
    | { type: 'heading'; key: string; label: string }
    | { type: 'separator'; key: string };

export interface ChatMenuProps {
    /** The trigger's accessible name: "Options for Nino". */
    label: string;
    items: ChatMenuItem[];
    /** The trigger's face; three dots when absent. */
    icon?: ReactNode;
    /** Preferred; the menu takes the other side where this one would be cut off by the thread or the window. */
    align?: 'start' | 'end';
    /** Preferred, as `align` is. */
    placement?: 'below' | 'above';
    triggerClassName?: string;
    /** Opens the menu from outside, for a long press or a right click on the thing it belongs to. */
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A button that opens a list of actions: arrow keys move between them, Escape closes and hands focus
 * back to the button, a click outside closes. The semantics are the WAI-ARIA menu button's, which is
 * what a screen reader announces as "menu, 6 items".
 */
export function ChatMenu({
    label,
    items,
    icon,
    align = 'end',
    placement = 'below',
    triggerClassName,
    isOpen: controlledOpen,
    onOpenChange,
}: Readonly<ChatMenuProps>): React.JSX.Element {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const isOpen = controlledOpen ?? uncontrolledOpen;
    const menuId = useId();
    const wrapper = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const preferred: PopoverFit = { vertical: placement === 'above' ? 'above' : 'below', align };
    const [fit, setFit] = useState<PopoverFit>(preferred);

    // Measured before the first paint of an open menu, so it never shows cut off and then jumps.
    useLayoutEffect(() => {
        if (!isOpen || list.current === null || trigger.current === null) return;
        const next = fitPopover(
            trigger.current,
            { width: list.current.offsetWidth, height: list.current.offsetHeight },
            { vertical: placement === 'above' ? 'above' : 'below', align },
        );
        setFit((current) => (current.vertical === next.vertical && current.align === next.align ? current : next));
    }, [isOpen, placement, align]);

    const setOpen = (next: boolean): void => {
        setUncontrolledOpen(next);
        onOpenChange?.(next);
    };

    useEffect(() => {
        if (!isOpen) return undefined;

        list.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();

        const onPointerDown = (event: PointerEvent): void => {
            if (wrapper.current !== null && !wrapper.current.contains(event.target as Node)) {
                setUncontrolledOpen(false);
                onOpenChange?.(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);

        return (): void => {
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [isOpen, onOpenChange]);

    const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        const entries = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
        const index = entries.indexOf(document.activeElement as HTMLElement);

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            trigger.current?.focus();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            entries[(index + 1) % entries.length]?.focus();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            entries[(index - 1 + entries.length) % entries.length]?.focus();
        } else if (event.key === 'Home') {
            event.preventDefault();
            entries[0]?.focus();
        } else if (event.key === 'End') {
            event.preventDefault();
            entries.at(-1)?.focus();
        } else if (event.key === 'Tab') {
            setOpen(false);
        }
    };

    return (
        <div ref={wrapper} className="relative inline-flex">
            <button
                ref={trigger}
                type="button"
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={isOpen ? menuId : undefined}
                onClick={() => {
                    setOpen(!isOpen);
                }}
                className={cn(ICON_BUTTON, triggerClassName)}
            >
                {icon ?? <MoreIcon />}
            </button>
            {isOpen && (
                <div
                    ref={list}
                    id={menuId}
                    role="menu"
                    aria-label={label}
                    onKeyDown={onListKeyDown}
                    className={cn(
                        'absolute z-40 min-w-56 animate-scale-in rounded-chat-card border border-chat-line bg-chat-surface p-1.5 shadow-lg',
                        fit.align === 'end' ? 'end-0' : 'start-0',
                        fit.vertical === 'below' ? 'top-full mt-1.5 origin-top' : 'bottom-full mb-1.5 origin-bottom',
                    )}
                >
                    {items.map((item) => {
                        if (item.type === 'separator') {
                            return <div key={item.key} role="separator" className="my-1 h-px bg-chat-line" />;
                        }
                        if (item.type === 'heading') {
                            return (
                                <div
                                    key={item.key}
                                    role="presentation"
                                    className="px-2.5 pt-2 pb-1 text-caption font-semibold text-chat-faint"
                                >
                                    {item.label}
                                </div>
                            );
                        }

                        return (
                            <button
                                key={item.key}
                                type="button"
                                role="menuitem"
                                disabled={item.disabled}
                                onClick={() => {
                                    setOpen(false);
                                    trigger.current?.focus();
                                    item.onSelect();
                                }}
                                className={cn(
                                    'flex w-full items-center gap-2.5 rounded-chat-control px-2.5 py-2 text-start text-label',
                                    'transition-colors duration-fast hover:bg-chat-raised focus-visible:bg-chat-raised disabled:opacity-40',
                                    item.tone === 'danger' ? 'text-critical' : 'text-chat-ink',
                                    FOCUS_RING,
                                )}
                            >
                                {item.icon !== undefined && (
                                    <span className={item.tone === 'danger' ? 'text-critical' : 'text-chat-muted'}>
                                        {item.icon}
                                    </span>
                                )}
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
