/**
 * Grows slots that a window cannot fit into. Pure: no GNOME imports.
 *
 * `assign()` hands out slot rectangles that always form a guillotine
 * partition of the unit square, so they can be turned back into a split
 * tree; growing a slot then means moving one of that tree's dividers, which
 * shrinks the neighbours on the other side of it and keeps everything
 * covering the screen without overlaps.
 */

import { buildLayoutTree, pathOf, pinLeaf, rectAtPath } from './layoutTree';
import type { TileRect } from './layoutTree';

export interface SlotPin {
    /** index into the rects `assign()` returned */
    slot: number;
    /** normalised (0..1) extents the slot must have at least */
    minWidth?: number;
    minHeight?: number;
}

const EPSILON = 1e-9;

/**
 * Returns the rects with every pinned slot at least as large as its pin,
 * in the same order. Rects are returned untouched when no pin needs work.
 */
export function applyPins(rects: TileRect[], pins: SlotPin[]): TileRect[] {
    const needed = pins.filter((pin) => {
        const r = rects[pin.slot];
        if (!r) return false;
        return (
            (pin.minWidth !== undefined && r.width < pin.minWidth - EPSILON) ||
            (pin.minHeight !== undefined && r.height < pin.minHeight - EPSILON)
        );
    });
    if (needed.length === 0) return rects;

    let tree = buildLayoutTree(rects);
    if (!tree) return rects;
    const paths = rects.map((r) => pathOf(tree!, r));
    if (paths.some((p) => p === null)) return rects;

    for (const pin of needed) {
        const path = paths[pin.slot]!;
        const current = rectAtPath(tree, path);
        if (!current) continue;
        if (
            pin.minWidth !== undefined &&
            current.width < pin.minWidth - EPSILON
        )
            tree = pinLeaf(tree, path, Math.min(pin.minWidth, 1), 'x');
        const grown = rectAtPath(tree, path);
        if (
            grown &&
            pin.minHeight !== undefined &&
            grown.height < pin.minHeight - EPSILON
        )
            tree = pinLeaf(tree, path, Math.min(pin.minHeight, 1), 'y');
    }

    return rects.map((r, i) => rectAtPath(tree!, paths[i]!) ?? r);
}
