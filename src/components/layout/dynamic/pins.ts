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
import type { SplitPath, SplitTree, TileRect } from './layoutTree';

export interface SlotPin {
    /** index into the rects `assign()` returned */
    slot: number;
    /** normalised (0..1) extents the slot must have at least */
    minWidth?: number;
    minHeight?: number;
}

const EPSILON = 1e-9;

const readBack = (
    tree: SplitTree,
    rects: TileRect[],
    paths: (SplitPath | null)[],
): TileRect[] => rects.map((r, i) => rectAtPath(tree, paths[i]!) ?? r);

const unsatisfied = (rects: TileRect[], pins: SlotPin[]): SlotPin[] =>
    pins.filter((pin) => {
        const r = rects[pin.slot];
        if (!r) return false;
        return (
            (pin.minWidth !== undefined && r.width < pin.minWidth - EPSILON) ||
            (pin.minHeight !== undefined && r.height < pin.minHeight - EPSILON)
        );
    });

/**
 * Returns the rects with every pinned slot at least as large as its pin,
 * in the same order. Rects are returned untouched when no pin needs work.
 *
 * Growing one slot can shrink another pinned one (they may share a
 * divider, or a clamped divider makes an ancestor rescale a whole
 * subtree), so the pins are re-applied until they all hold or the passes
 * run out; pins that cannot all be met leave the last one short.
 */
export function applyPins(rects: TileRect[], pins: SlotPin[]): TileRect[] {
    if (unsatisfied(rects, pins).length === 0) return rects;

    let tree = buildLayoutTree(rects);
    if (!tree) return rects;
    const paths = rects.map((r) => pathOf(tree!, r));
    if (paths.some((p) => p === null)) return rects;

    // what every other pinned leaf must keep when a divider next to it
    // moves, so two pins on the same cut line ask the parent for room
    // instead of taking it from each other
    const floors = new Map<string, SlotPin>();
    for (const pin of pins) {
        const path = paths[pin.slot];
        if (path) floors.set(path.join('/'), pin);
    }
    const widthFloor = (p: SplitPath) =>
        Math.min(floors.get(p.join('/'))?.minWidth ?? 0, 1);
    const heightFloor = (p: SplitPath) =>
        Math.min(floors.get(p.join('/'))?.minHeight ?? 0, 1);

    let current = rects;
    for (let pass = 0; pass < 4; pass++) {
        const needed = unsatisfied(current, pins);
        if (needed.length === 0) break;
        for (const pin of needed) {
            const path = paths[pin.slot]!;
            const leaf = rectAtPath(tree, path);
            if (!leaf) continue;
            if (
                pin.minWidth !== undefined &&
                leaf.width < pin.minWidth - EPSILON
            )
                tree = pinLeaf(
                    tree,
                    path,
                    Math.min(pin.minWidth, 1),
                    'x',
                    widthFloor,
                );
            const grown = rectAtPath(tree, path);
            if (
                grown &&
                pin.minHeight !== undefined &&
                grown.height < pin.minHeight - EPSILON
            )
                tree = pinLeaf(
                    tree,
                    path,
                    Math.min(pin.minHeight, 1),
                    'y',
                    heightFloor,
                );
        }
        current = readBack(tree, rects, paths);
    }
    return current;
}
