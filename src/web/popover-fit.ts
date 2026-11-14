/** Which side of its anchor a popover opens on, and which of its edges it lines up with the anchor's. */
export interface PopoverFit {
    vertical: 'above' | 'below';
    /** `end`: the popover's end edge on the anchor's, growing toward the start. `start`: the other way. */
    align: 'start' | 'end';
}

const GAP_PX = 8;

interface Box {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

/**
 * The box a popover must stay inside: the nearest ancestor that clips its content (the thread scrolls, so anything
 * past its edge is cut off), or the window.
 */
export function clippingBox(element: Element): Box {
    let node = element.parentElement;
    while (node !== null) {
        const style = getComputedStyle(node);
        if (/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)) {
            return node.getBoundingClientRect();
        }
        node = node.parentElement;
    }

    return { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
}

/**
 * Picks the side and alignment where a popover of this size fits inside the clipping box, keeping the preferred one
 * when it fits or when nothing fits better. Measured when the popover opens, so it is never cut off by the thread's
 * edge, whichever message it belongs to.
 */
export function fitPopover(
    anchor: Element,
    size: { width: number; height: number },
    preferred: PopoverFit,
): PopoverFit {
    const box = clippingBox(anchor);
    const rect = anchor.getBoundingClientRect();
    const isRtl = getComputedStyle(anchor).direction === 'rtl';

    const roomAbove = rect.top - box.top;
    const roomBelow = box.bottom - rect.bottom;
    const needHeight = size.height + GAP_PX;
    const preferredVertical = preferred.vertical === 'above' ? roomAbove : roomBelow;
    const otherVertical = preferred.vertical === 'above' ? roomBelow : roomAbove;
    const vertical =
        preferredVertical >= needHeight || preferredVertical >= otherVertical
            ? preferred.vertical
            : preferred.vertical === 'above'
              ? 'below'
              : 'above';

    // `end` grows toward the start side: leftwards in a left-to-right page.
    const roomGrowingLeft = rect.right - box.left;
    const roomGrowingRight = box.right - rect.left;
    const roomFor = (align: PopoverFit['align']): number =>
        (align === 'end') !== isRtl ? roomGrowingLeft : roomGrowingRight;
    const other = preferred.align === 'end' ? 'start' : 'end';
    const align =
        roomFor(preferred.align) >= size.width || roomFor(preferred.align) >= roomFor(other) ? preferred.align : other;

    return { vertical, align };
}

/** Whether an element of this width fits beside the anchor on its end side (or start side), inside the clipping box. */
export function roomBeside(anchor: Element, side: 'start' | 'end'): number {
    const box = clippingBox(anchor);
    const rect = anchor.getBoundingClientRect();
    const isRtl = getComputedStyle(anchor).direction === 'rtl';
    const towardsRight = (side === 'end') !== isRtl;

    return towardsRight ? box.right - rect.right : rect.left - box.left;
}
