import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayoutTree } from './layoutTree.ts';
import type { TileRect } from './layoutTree.ts';
import { reflow } from './reflow.ts';

const twoColumns = () =>
    buildLayoutTree([
        { x: 0, y: 0, width: 0.67, height: 1 },
        { x: 0.67, y: 0, width: 0.33, height: 1 },
    ])!;

test('a single window fills the whole area', () => {
    assert.deepEqual(reflow(twoColumns(), 1), [
        { x: 0, y: 0, width: 1, height: 1 },
    ]);
});

test('a subtree holding fewer windows than tiles collapses into its bounds', () => {
    // 25 / 50 / 25 columns; the tree is A | (B | C)
    const threeColumns = buildLayoutTree([
        { x: 0, y: 0, width: 0.25, height: 1 },
        { x: 0.25, y: 0, width: 0.5, height: 1 },
        { x: 0.75, y: 0, width: 0.25, height: 1 },
    ])!;

    // two windows: A keeps its tile, B and C collapse into one region
    assert.deepEqual(reflow(threeColumns, 2), [
        { x: 0, y: 0, width: 0.25, height: 1 },
        { x: 0.25, y: 0, width: 0.75, height: 1 },
    ]);
});

test('one window per tile reproduces the layout exactly as drawn', () => {
    assert.deepEqual(reflow(twoColumns(), 2), [
        { x: 0, y: 0, width: 0.67, height: 1 },
        { x: 0.67, y: 0, width: 0.33, height: 1 },
    ]);
});

test('more windows than tiles subdivides the largest tile', () => {
    // the wide left tile is largest; it is taller than it is wide, so it is
    // cut horizontally and its halves stay in its place in the order
    assert.deepEqual(reflow(twoColumns(), 3), [
        { x: 0, y: 0, width: 0.67, height: 0.5 },
        { x: 0, y: 0.5, width: 0.67, height: 0.5 },
        { x: 0.67, y: 0, width: 0.33, height: 1 },
    ]);
});

test('every window always gets exactly one rectangle', () => {
    for (let n = 1; n <= 8; n++)
        assert.equal(reflow(twoColumns(), n).length, n, `for ${n} windows`);
});

const overlap = (a: TileRect, b: TileRect) =>
    Math.max(
        0,
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    ) *
    Math.max(
        0,
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
    );

test('the rectangles always tile the whole area with no gaps or overlaps', () => {
    const layouts: Record<string, TileRect[]> = {
        'two columns': [
            { x: 0, y: 0, width: 0.67, height: 1 },
            { x: 0.67, y: 0, width: 0.33, height: 1 },
        ],
        'three columns': [
            { x: 0, y: 0, width: 0.25, height: 1 },
            { x: 0.25, y: 0, width: 0.5, height: 1 },
            { x: 0.75, y: 0, width: 0.25, height: 1 },
        ],
        'stacked side column': [
            { x: 0, y: 0, width: 0.25, height: 0.5 },
            { x: 0.25, y: 0, width: 0.375, height: 1 },
            { x: 0.625, y: 0, width: 0.375, height: 1 },
            { x: 0, y: 0.5, width: 0.25, height: 0.5 },
        ],
        '2x2 grid': [
            { x: 0, y: 0, width: 0.5, height: 0.5 },
            { x: 0.5, y: 0, width: 0.5, height: 0.5 },
            { x: 0, y: 0.5, width: 0.5, height: 0.5 },
            { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
        ],
    };

    for (const [name, tiles] of Object.entries(layouts)) {
        const tree = buildLayoutTree(tiles)!;
        for (let n = 1; n <= 7; n++) {
            const rects = reflow(tree, n);
            const covered = rects.reduce((sum, r) => sum + r.width * r.height, 0);
            assert.ok(
                Math.abs(covered - 1) < 1e-9,
                `${name} with ${n} windows covers ${covered}, expected 1`,
            );
            for (let i = 0; i < rects.length; i++) {
                for (let j = i + 1; j < rects.length; j++) {
                    assert.ok(
                        overlap(rects[i], rects[j]) < 1e-9,
                        `${name} with ${n} windows: rects ${i} and ${j} overlap`,
                    );
                }
            }
        }
    }
});
