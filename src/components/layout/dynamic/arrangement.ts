/**
 * The arrangement dynamic tiling keeps between reflows once there are more
 * windows than the selected layout has tiles: a split tree whose leaves are
 * the windows themselves. Pure: no GNOME imports, keys are opaque.
 *
 * Opening a window cuts the focused window's leaf and nothing else moves;
 * everything that is not a fresh open (a close, a layout change, …) is a
 * `build` from the layout, in creation order, so the oldest windows get the
 * roomiest tiles again.
 */

import { buildLayoutTree } from './layoutTree';
import type { SplitTree, TileRect } from './layoutTree';
import { assign, slotOrder } from './reflow';

export type Arrangement<K> =
    | { kind: 'leaf'; key: K; tile: TileRect }
    | {
          kind: 'split';
          axis: 'x' | 'y';
          at: number;
          first: Arrangement<K>;
          second: Arrangement<K>;
      };

const EPSILON = 1e-6;

const sameRect = (a: TileRect, b: TileRect) =>
    Math.abs(a.x - b.x) < EPSILON &&
    Math.abs(a.y - b.y) < EPSILON &&
    Math.abs(a.width - b.width) < EPSILON &&
    Math.abs(a.height - b.height) < EPSILON;

function label<K>(
    tree: SplitTree,
    rects: TileRect[],
    keys: K[],
): Arrangement<K> | null {
    if (tree.kind === 'leaf') {
        const index = rects.findIndex((r) => sameRect(r, tree.tile));
        if (index < 0) return null;
        return { kind: 'leaf', key: keys[index], tile: tree.tile };
    }
    const first = label(tree.first, rects, keys);
    const second = label(tree.second, rects, keys);
    if (!first || !second) return null;
    return { kind: 'split', axis: tree.axis, at: tree.at, first, second };
}

/**
 * The arrangement `assign()` would give `keys` (in creation order) on
 * `base`, with the leaf of `focused` — if any — the one halved last.
 * Null only if the geometry cannot be re-read as a split tree.
 */
export function buildArrangement<K>(
    base: SplitTree,
    keys: K[],
    focused?: K,
): Arrangement<K> | null {
    if (keys.length === 0) return null;
    const splitSlot = focused === undefined ? -1 : keys.indexOf(focused);
    const rects = assign(
        base,
        keys.length,
        splitSlot >= 0 ? splitSlot : undefined,
    );
    const tree = buildLayoutTree(rects);
    return tree ? label(tree, rects, keys) : null;
}

function leaves<K>(tree: Arrangement<K>): { key: K; tile: TileRect }[] {
    if (tree.kind === 'leaf') return [tree];
    return [...leaves(tree.first), ...leaves(tree.second)];
}

/** Every key in the tree, left-to-right then top-to-bottom. */
export function arrangementKeys<K>(tree: Arrangement<K>): K[] {
    return leaves(tree).map((leaf) => leaf.key);
}

/** The normalised rect of `key`'s leaf, or null when it is not in the tree. */
export function arrangementRectOf<K>(
    tree: Arrangement<K>,
    key: K,
): TileRect | null {
    return leaves(tree).find((leaf) => leaf.key === key)?.tile ?? null;
}

/**
 * Cuts the leaf of `at` — or the roomiest leaf when `at` is missing — along
 * its longer side, exactly as `assign()` halves a slot: `at` keeps the first
 * half and `key` takes the second. No other leaf changes.
 */
export function insertIntoArrangement<K>(
    tree: Arrangement<K>,
    at: K | undefined,
    key: K,
): Arrangement<K> {
    let target = at;
    if (target === undefined || arrangementRectOf(tree, target) === null) {
        const all = leaves(tree);
        target = all[slotOrder(all.map((leaf) => leaf.tile))[0]].key;
    }

    const cut = (node: Arrangement<K>): Arrangement<K> => {
        if (node.kind === 'leaf') {
            if (node.key !== target) return node;
            const r = node.tile;
            if (r.height >= r.width) {
                const mid = r.y + r.height / 2;
                return {
                    kind: 'split',
                    axis: 'y',
                    at: mid,
                    first: { ...node, tile: { ...r, height: r.height / 2 } },
                    second: {
                        kind: 'leaf',
                        key,
                        tile: { ...r, y: mid, height: r.height / 2 },
                    },
                };
            }
            const mid = r.x + r.width / 2;
            return {
                kind: 'split',
                axis: 'x',
                at: mid,
                first: { ...node, tile: { ...r, width: r.width / 2 } },
                second: {
                    kind: 'leaf',
                    key,
                    tile: { ...r, x: mid, width: r.width / 2 },
                },
            };
        }
        return { ...node, first: cut(node.first), second: cut(node.second) };
    };
    return cut(tree);
}

/** The same tree with the leaves of `a` and `b` trading keys. */
export function swapInArrangement<K>(
    tree: Arrangement<K>,
    a: K,
    b: K,
): Arrangement<K> {
    const walk = (node: Arrangement<K>): Arrangement<K> => {
        if (node.kind === 'leaf') {
            if (node.key === a) return { ...node, key: b };
            if (node.key === b) return { ...node, key: a };
            return node;
        }
        return { ...node, first: walk(node.first), second: walk(node.second) };
    };
    return walk(tree);
}
