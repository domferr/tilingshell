/**
 * Decomposition of a user-drawn layout into a binary split tree.
 *
 * Pure: no GNOME imports, no side effects. Operates on plain normalised
 * rectangles (0..1 on both axes) so it can be unit-tested without a shell.
 */

export interface TileRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Leaf {
    kind: 'leaf';
    tile: TileRect;
}

/**
 * A guillotine cut. `axis: 'x'` is a vertical cut line at a constant x,
 * producing a left child (`first`) and a right child (`second`); `axis: 'y'`
 * cuts horizontally into a top and a bottom child.
 */
export interface Split {
    kind: 'split';
    axis: 'x' | 'y';
    at: number;
    first: SplitTree;
    second: SplitTree;
}

export type SplitTree = Leaf | Split;

// Layout coordinates come from a UI that drags dividers around, so exact
// equality is never safe.
const EPSILON = 1e-6;

/**
 * Builds a split tree from the tiles of a layout, or returns null when the
 * layout cannot be decomposed by guillotine cuts.
 */
export function buildLayoutTree(tiles: TileRect[]): SplitTree | null {
    if (tiles.length === 0) return null;
    if (tiles.length === 1) return { kind: 'leaf', tile: tiles[0] };

    for (const axis of ['x', 'y'] as const) {
        const extent = axis === 'x' ? 'width' : 'height';

        // Every trailing edge is a candidate cut line.
        const candidates = [
            ...new Set(tiles.map((t) => t[axis] + t[extent])),
        ].sort((a, b) => a - b);

        for (const at of candidates) {
            const before = tiles.filter((t) => t[axis] + t[extent] <= at + EPSILON);
            const after = tiles.filter((t) => t[axis] >= at - EPSILON);

            // A tile landing in neither group straddles the line, so this is
            // not a full-span cut.
            if (before.length + after.length !== tiles.length) continue;
            if (before.length === 0 || after.length === 0) continue;

            const first = buildLayoutTree(before);
            if (!first) continue;
            const second = buildLayoutTree(after);
            if (!second) continue;

            return { kind: 'split', axis, at, first, second };
        }
    }

    return null;
}
