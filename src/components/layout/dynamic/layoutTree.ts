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

export type SplitPath = ('first' | 'second')[];

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
            const before = tiles.filter(
                (t) => t[axis] + t[extent] <= at + EPSILON,
            );
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

/** Returns the path to a target rect, or null if it cannot be found. */
export function pathOf(tree: SplitTree, target: TileRect): SplitPath | null {
    function walk(node: SplitTree, path: SplitPath): SplitPath | null {
        if (node.kind === 'leaf') {
            if (
                target.x >= node.tile.x - EPSILON &&
                target.y >= node.tile.y - EPSILON &&
                target.x + target.width <=
                    node.tile.x + node.tile.width + EPSILON &&
                target.y + target.height <=
                    node.tile.y + node.tile.height + EPSILON
            ) {
                return path;
            }
            return null;
        }
        return (
            walk(node.first, [...path, 'first']) ||
            walk(node.second, [...path, 'second'])
        );
    }
    return walk(tree, []);
}

/** The rect of the leaf reached by walking `path` from `tree`'s root. */
export function rectAtPath(tree: SplitTree, path: SplitPath): TileRect | null {
    let node = tree;
    for (const dir of path) {
        if (node.kind === 'leaf') return null;
        node = node[dir];
    }
    return node.kind === 'leaf' ? node.tile : treeBounds(node);
}

/** Returns the number of leaves in the tree. */
export function leafCount(tree: SplitTree): number {
    if (tree.kind === 'leaf') return 1;
    return leafCount(tree.first) + leafCount(tree.second);
}

/**
 * The area a subtree covers: the union of its leaves (same as reflow.ts's
 * `boundsOf`, kept local so this file has no dependency on reflow.ts).
 */
function treeBounds(tree: SplitTree): TileRect {
    if (tree.kind === 'leaf') return tree.tile;
    const first = treeBounds(tree.first);
    const second = treeBounds(tree.second);
    const x = Math.min(first.x, second.x);
    const y = Math.min(first.y, second.y);
    return {
        x,
        y,
        width: Math.max(first.x + first.width, second.x + second.width) - x,
        height: Math.max(first.y + first.height, second.y + second.height) - y,
    };
}

function applyBounds(tree: SplitTree, bounds: TileRect): SplitTree {
    if (tree.kind === 'leaf') return { kind: 'leaf', tile: bounds };
    const { axis, at, first, second } = tree;
    const oldBounds = treeBounds(tree);
    const extentProp = axis === 'x' ? 'width' : 'height';
    const startProp = axis === 'x' ? 'x' : 'y';

    let ratio = 0.5;
    if (oldBounds[extentProp] > EPSILON) {
        ratio = (at - oldBounds[startProp]) / oldBounds[extentProp];
    }

    const newAt = bounds[startProp] + bounds[extentProp] * ratio;

    const firstBounds = { ...bounds };
    firstBounds[extentProp] = newAt - bounds[startProp];

    const secondBounds = { ...bounds };
    secondBounds[startProp] = newAt;
    secondBounds[extentProp] = bounds[startProp] + bounds[extentProp] - newAt;

    return {
        kind: 'split',
        axis,
        at: newAt,
        first: applyBounds(first, firstBounds),
        second: applyBounds(second, secondBounds),
    };
}

/** Mutates a split tree to allocate `actualExtent` to the leaf at `path`. */
export function pinLeaf(
    tree: SplitTree,
    path: SplitPath,
    actualExtent: number,
    axis: 'x' | 'y',
): SplitTree {
    const MIN_SIBLING_FRACTION = 0.05;
    const extentProp = axis === 'x' ? 'width' : 'height';
    const startProp = axis === 'x' ? 'x' : 'y';

    function walk(
        node: SplitTree,
        pathIndex: number,
    ): { tree: SplitTree; requestedExtent: number } {
        if (node.kind === 'leaf' || pathIndex >= path.length) {
            return { tree: node, requestedExtent: actualExtent };
        }

        const dir = path[pathIndex];
        const child = node[dir];
        const { tree: newChild, requestedExtent } = walk(child, pathIndex + 1);

        if (node.axis === axis) {
            const oldBounds = treeBounds(node);
            const oldExtent = oldBounds[extentProp];
            const minSize = MIN_SIBLING_FRACTION * oldExtent;

            let newAt = node.at;
            let myRequestedExtent = oldExtent;

            if (dir === 'first') {
                newAt = oldBounds[startProp] + requestedExtent;
                let clampedAt = newAt;
                if (clampedAt > oldBounds[startProp] + oldExtent - minSize) {
                    clampedAt = oldBounds[startProp] + oldExtent - minSize;
                }
                if (clampedAt < oldBounds[startProp] + minSize) {
                    clampedAt = oldBounds[startProp] + minSize;
                }

                const achievedExtent = clampedAt - oldBounds[startProp];
                if (Math.abs(achievedExtent - requestedExtent) > EPSILON) {
                    // the sibling is already at its floor: the parent has to
                    // grow this node by exactly what is missing
                    myRequestedExtent = requestedExtent + minSize;
                }

                const firstBounds = { ...oldBounds };
                firstBounds[extentProp] = clampedAt - oldBounds[startProp];

                const secondBounds = { ...oldBounds };
                secondBounds[startProp] = clampedAt;
                secondBounds[extentProp] = oldExtent - firstBounds[extentProp];

                const newNode: Split = {
                    kind: 'split',
                    axis,
                    at: clampedAt,
                    first: applyBounds(newChild, firstBounds),
                    second: applyBounds(node.second, secondBounds),
                };
                return { tree: newNode, requestedExtent: myRequestedExtent };
            } else {
                newAt = oldBounds[startProp] + oldExtent - requestedExtent;
                let clampedAt = newAt;
                if (clampedAt < oldBounds[startProp] + minSize) {
                    clampedAt = oldBounds[startProp] + minSize;
                }
                if (clampedAt > oldBounds[startProp] + oldExtent - minSize) {
                    clampedAt = oldBounds[startProp] + oldExtent - minSize;
                }

                const achievedExtent =
                    oldBounds[startProp] + oldExtent - clampedAt;
                if (Math.abs(achievedExtent - requestedExtent) > EPSILON) {
                    myRequestedExtent = requestedExtent + minSize;
                }

                const firstBounds = { ...oldBounds };
                firstBounds[extentProp] = clampedAt - oldBounds[startProp];

                const secondBounds = { ...oldBounds };
                secondBounds[startProp] = clampedAt;
                secondBounds[extentProp] = oldExtent - firstBounds[extentProp];

                const newNode: Split = {
                    kind: 'split',
                    axis,
                    at: clampedAt,
                    first: applyBounds(node.first, firstBounds),
                    second: applyBounds(newChild, secondBounds),
                };
                return { tree: newNode, requestedExtent: myRequestedExtent };
            }
        } else {
            const newNode: Split = {
                kind: 'split',
                axis: node.axis,
                at: node.at,
                first: dir === 'first' ? newChild : node.first,
                second: dir === 'second' ? newChild : node.second,
            };
            return { tree: newNode, requestedExtent };
        }
    }

    const { tree: newTree } = walk(tree, 0);
    return applyBounds(newTree, treeBounds(tree));
}
