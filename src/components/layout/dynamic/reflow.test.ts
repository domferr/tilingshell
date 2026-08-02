import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayoutTree } from './layoutTree.ts';
import type { TileRect } from './layoutTree.ts';
import { reflow, slotOrder, neighbourIndex } from './reflow.ts';

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

test('overflow splits the focused tile rather than the largest', () => {
    // slot 1 is the narrow right tile; focusing it should split it even though
    // the left tile is roomier
    assert.deepEqual(reflow(twoColumns(), 3, 1), [
        { x: 0, y: 0, width: 0.67, height: 1 },
        { x: 0.67, y: 0, width: 0.33, height: 0.5 },
        { x: 0.67, y: 0.5, width: 0.33, height: 0.5 },
    ]);
});

test('overflow falls back to the largest tile when nothing is focused', () => {
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

test('slots are ordered by area so the first window gets the biggest region', () => {
    // 67/33 drawn big-first: order is unchanged
    assert.deepEqual(
        slotOrder([
            { x: 0, y: 0, width: 0.67, height: 1 },
            { x: 0.67, y: 0, width: 0.33, height: 1 },
        ]),
        [0, 1],
    );

    // 33/67 drawn small-first: the big one is promoted
    assert.deepEqual(
        slotOrder([
            { x: 0, y: 0, width: 0.33, height: 1 },
            { x: 0.33, y: 0, width: 0.67, height: 1 },
        ]),
        [1, 0],
    );
});

test('equal areas keep a stable top-then-left order', () => {
    assert.deepEqual(
        slotOrder([
            { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
            { x: 0, y: 0, width: 0.5, height: 0.5 },
            { x: 0.5, y: 0, width: 0.5, height: 0.5 },
            { x: 0, y: 0.5, width: 0.5, height: 0.5 },
        ]),
        [1, 2, 3, 0],
    );
});

test("Layout 2 at four windows gives the oldest window a widest column", () => {
    const rects = reflow(
        buildLayoutTree([
            { x: 0, y: 0, width: 0.26, height: 0.5 },
            { x: 0.26, y: 0, width: 0.37, height: 1 },
            { x: 0.63, y: 0, width: 0.37, height: 1 },
            { x: 0, y: 0.5, width: 0.26, height: 0.5 },
        ])!,
        4,
    );
    const first = rects[slotOrder(rects)[0]];
    assert.equal(first.width, 0.37);
    assert.equal(first.height, 1);
});

test('the neighbour in a direction is the nearest region that overlaps across it', () => {
    // 67/33 side by side
    const cols = reflow(twoColumns(), 2);
    assert.equal(neighbourIndex(cols, 0, 'right'), 1);
    assert.equal(neighbourIndex(cols, 1, 'left'), 0);
    assert.equal(neighbourIndex(cols, 0, 'up'), -1, 'nothing above');
    assert.equal(neighbourIndex(cols, 0, 'down'), -1, 'nothing below');
});

test('a neighbour must actually share the crossing edge', () => {
    // left column split in two, one tall column on the right:
    //   0: top-left    1: bottom-left    2: right
    const rects = reflow(
        buildLayoutTree([
            { x: 0, y: 0, width: 0.5, height: 0.5 },
            { x: 0, y: 0.5, width: 0.5, height: 0.5 },
            { x: 0.5, y: 0, width: 0.5, height: 1 },
        ])!,
        3,
    );
    const top = rects.findIndex((r) => r.y === 0 && r.x === 0);
    const bottom = rects.findIndex((r) => r.y === 0.5);
    const right = rects.findIndex((r) => r.x === 0.5);

    assert.equal(neighbourIndex(rects, top, 'down'), bottom);
    assert.equal(neighbourIndex(rects, bottom, 'up'), top);
    assert.equal(neighbourIndex(rects, top, 'right'), right);
    assert.equal(neighbourIndex(rects, right, 'left'), top, 'ties go to the topmost');
});

test('the nearest neighbour wins when several lie in the same direction', () => {
    const three = reflow(
        buildLayoutTree([
            { x: 0, y: 0, width: 0.25, height: 1 },
            { x: 0.25, y: 0, width: 0.5, height: 1 },
            { x: 0.75, y: 0, width: 0.25, height: 1 },
        ])!,
        3,
    );
    const left = three.findIndex((r) => r.x === 0);
    const mid = three.findIndex((r) => r.x === 0.25);
    assert.equal(neighbourIndex(three, left, 'right'), mid, 'not the far right one');
});
