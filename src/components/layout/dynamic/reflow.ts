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
export function reflow(tree: SplitTree, windowCount: number): TileRect[] {
    if (windowCount <= 1) return [boundsOf(tree)];

    const leaves = leavesOf(tree);
    if (windowCount === leaves.length) return leaves;
    if (windowCount > leaves.length) return subdivide(leaves, windowCount);

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
function subdivide(leaves: TileRect[], windowCount: number): TileRect[] {
    const rects = [...leaves];

    while (rects.length < windowCount) {
        let widest = 0;
        for (let i = 1; i < rects.length; i++) {
            if (areaOf(rects[i]) > areaOf(rects[widest])) widest = i;
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

/** The tiles of a subtree, left-to-right then top-to-bottom. */
export function leavesOf(tree: SplitTree): TileRect[] {
    if (tree.kind === 'leaf') return [tree.tile];
    return [...leavesOf(tree.first), ...leavesOf(tree.second)];
}
