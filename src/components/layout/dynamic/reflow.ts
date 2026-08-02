/**
 * Distributes N windows across a layout's split tree.
 *
 * Pure: no GNOME imports, no side effects. Rectangles are normalised (0..1)
 * exactly as the tree's tiles are.
 */

import type { SplitTree, TileRect } from './layoutTree';

/** The area a subtree covers: the union of its leaves. */
export function boundsOf(tree: SplitTree): TileRect {
    if (tree.kind === 'leaf') return tree.tile;

    const first = boundsOf(tree.first);
    const second = boundsOf(tree.second);
    const x = Math.min(first.x, second.x);
    const y = Math.min(first.y, second.y);

    return {
        x,
        y,
        width: Math.max(first.x + first.width, second.x + second.width) - x,
        height: Math.max(first.y + first.height, second.y + second.height) - y,
    };
}

/**
 * Returns one rectangle per window. With a single window the whole area is
 * used; the layout is only followed once there are enough windows to fill it.
 */
export function reflow(
    tree: SplitTree,
    windowCount: number,
    focusedIndex?: number,
): TileRect[] {
    if (windowCount <= 1) return [boundsOf(tree)];

    const leaves = leavesOf(tree);
    if (windowCount === leaves.length) return leaves;
    if (windowCount > leaves.length)
        return subdivide(leaves, windowCount, focusedIndex);

    // Fewer windows than tiles: share them between the two subtrees in
    // proportion to how many tiles each holds, giving each at least one. A
    // subtree that ends up with fewer windows than tiles recurses and
    // eventually collapses into its own bounds.
    const split = tree as Exclude<SplitTree, { kind: 'leaf' }>;
    const firstTiles = leavesOf(split.first).length;

    let toFirst = Math.round((windowCount * firstTiles) / leaves.length);
    toFirst = Math.max(1, Math.min(windowCount - 1, toFirst));

    return [
        ...reflow(split.first, toFirst),
        ...reflow(split.second, windowCount - toFirst),
    ];
}

/**
 * Past the last tile there is nowhere left to put a window, so the roomiest
 * rectangle is halved, repeatedly, until every window has one. A rectangle is
 * always cut across its longer side, which keeps the pieces from growing into
 * slivers.
 */
function subdivide(
    leaves: TileRect[],
    windowCount: number,
    focusedIndex?: number,
): TileRect[] {
    const rects = [...leaves];
    // the first new window takes half of the focused window's space, the way
    // a tiling WM splits whatever you are looking at
    let target =
        focusedIndex !== undefined &&
        focusedIndex >= 0 &&
        focusedIndex < rects.length
            ? focusedIndex
            : undefined;

    while (rects.length < windowCount) {
        let widest = 0;
        for (let i = 1; i < rects.length; i++) {
            if (areaOf(rects[i]) > areaOf(rects[widest])) widest = i;
        }
        if (target !== undefined) {
            widest = target;
            target = undefined;
        }

        const r = rects[widest];
        const halves: TileRect[] =
            r.height >= r.width
                ? [
                      { ...r, height: r.height / 2 },
                      { ...r, y: r.y + r.height / 2, height: r.height / 2 },
                  ]
                : [
                      { ...r, width: r.width / 2 },
                      { ...r, x: r.x + r.width / 2, width: r.width / 2 },
                  ];

        rects.splice(widest, 1, ...halves);
    }

    return rects;
}

const areaOf = (r: TileRect) => r.width * r.height;

export type Direction = 'left' | 'right' | 'up' | 'down';

/**
 * The region adjacent to `from` in a direction, or -1 if the edge of the screen
 * lies that way.
 *
 * A candidate must lie wholly on the far side of the starting region and must
 * overlap it across the perpendicular axis, so that the two genuinely share the
 * edge being crossed rather than merely sitting somewhere off to that side. The
 * nearest such region wins; ties go to the one nearest the top-left, matching
 * how slots are ordered elsewhere.
 */
export function neighbourIndex(
    rects: TileRect[],
    from: number,
    direction: Direction,
): number {
    const start = rects[from];
    if (!start) return -1;

    const horizontal = direction === 'left' || direction === 'right';

    // near/far edges along the axis being crossed
    const startNear = horizontal ? start.x : start.y;
    const startFar = startNear + (horizontal ? start.width : start.height);

    let best = -1;
    let bestGap = Number.MAX_VALUE;

    rects.forEach((rect, index) => {
        if (index === from) return;

        const near = horizontal ? rect.x : rect.y;
        const far = near + (horizontal ? rect.width : rect.height);

        const gap =
            direction === 'right' || direction === 'down'
                ? near - startFar
                : startNear - far;
        if (gap < -1e-9) return; // overlaps or lies behind us

        // must share the edge we are crossing
        const aNear = horizontal ? start.y : start.x;
        const aFar = aNear + (horizontal ? start.height : start.width);
        const bNear = horizontal ? rect.y : rect.x;
        const bFar = bNear + (horizontal ? rect.height : rect.width);
        if (Math.min(aFar, bFar) - Math.max(aNear, bNear) <= 1e-9) return;

        if (gap < bestGap - 1e-9) {
            best = index;
            bestGap = gap;
        } else if (Math.abs(gap - bestGap) <= 1e-9 && best >= 0) {
            const current = rects[best];
            if (
                rect.y < current.y - 1e-9 ||
                (Math.abs(rect.y - current.y) <= 1e-9 && rect.x < current.x)
            )
                best = index;
        }
    });

    return best;
}

/**
 * The order in which windows should claim rectangles: roomiest first, so the
 * window opened first — the one the user came for — gets the most space, on
 * whichever side of the layout it happens to be drawn. Equal areas keep a
 * stable top-then-left order.
 *
 * Returns indices into `rects`, not rectangles.
 */
export function slotOrder(rects: TileRect[]): number[] {
    return rects
        .map((_, index) => index)
        .sort((a, b) => {
            const byArea = areaOf(rects[b]) - areaOf(rects[a]);
            if (Math.abs(byArea) > 1e-9) return byArea;
            if (Math.abs(rects[a].y - rects[b].y) > 1e-9)
                return rects[a].y - rects[b].y;
            return rects[a].x - rects[b].x;
        });
}

/** The tiles of a subtree, left-to-right then top-to-bottom. */
export function leavesOf(tree: SplitTree): TileRect[] {
    if (tree.kind === 'leaf') return [tree.tile];
    return [...leavesOf(tree.first), ...leavesOf(tree.second)];
}
