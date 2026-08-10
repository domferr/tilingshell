import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayoutTree } from './layoutTree.ts';

const leaf = (x: number, y: number, width: number, height: number) => ({
    kind: 'leaf',
    tile: { x, y, width, height },
});

test('a single tile covering the whole area becomes a leaf', () => {
    const tree = buildLayoutTree([{ x: 0, y: 0, width: 1, height: 1 }]);

    assert.deepEqual(tree, leaf(0, 0, 1, 1));
});

test('two columns split on x at their shared edge', () => {
    const tree = buildLayoutTree([
        { x: 0, y: 0, width: 0.67, height: 1 },
        { x: 0.67, y: 0, width: 0.33, height: 1 },
    ]);

    assert.deepEqual(tree, {
        kind: 'split',
        axis: 'x',
        at: 0.67,
        first: leaf(0, 0, 0.67, 1),
        second: leaf(0.67, 0, 0.33, 1),
    });
});

test('two rows split on y', () => {
    const tree = buildLayoutTree([
        { x: 0, y: 0, width: 1, height: 0.4 },
        { x: 0, y: 0.4, width: 1, height: 0.6 },
    ]);

    assert.deepEqual(tree, {
        kind: 'split',
        axis: 'y',
        at: 0.4,
        first: leaf(0, 0, 1, 0.4),
        second: leaf(0, 0.4, 1, 0.6),
    });
});

test('a stacked side column recurses into a nested split', () => {
    // left column split in two, then two full-height columns
    const tree = buildLayoutTree([
        { x: 0, y: 0, width: 0.25, height: 0.5 },
        { x: 0.25, y: 0, width: 0.375, height: 1 },
        { x: 0.625, y: 0, width: 0.375, height: 1 },
        { x: 0, y: 0.5, width: 0.25, height: 0.5 },
    ]);

    assert.deepEqual(tree, {
        kind: 'split',
        axis: 'x',
        at: 0.25,
        first: {
            kind: 'split',
            axis: 'y',
            at: 0.5,
            first: leaf(0, 0, 0.25, 0.5),
            second: leaf(0, 0.5, 0.25, 0.5),
        },
        second: {
            kind: 'split',
            axis: 'x',
            at: 0.625,
            first: leaf(0.25, 0, 0.375, 1),
            second: leaf(0.625, 0, 0.375, 1),
        },
    });
});

test('an ambiguous 2x2 grid is cut on x first', () => {
    // Both x=0.5 and y=0.5 are valid root cuts here and the tile geometry
    // alone cannot say which divider the user drew. We pick x deterministically.
    // The layout's `groups` field records the real answer; using it as a
    // tie-breaker is a later refinement.
    const tree = buildLayoutTree([
        { x: 0, y: 0, width: 0.5, height: 0.5 },
        { x: 0.5, y: 0, width: 0.5, height: 0.5 },
        { x: 0, y: 0.5, width: 0.5, height: 0.5 },
        { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ]);

    assert.equal(tree?.kind, 'split');
    assert.equal((tree as { axis: string }).axis, 'x');
    assert.equal((tree as { at: number }).at, 0.5);
});

test('a pinwheel layout cannot be decomposed and returns null', () => {
    // every candidate cut line is straddled by some tile
    const tree = buildLayoutTree([
        { x: 0, y: 0, width: 0.6, height: 0.4 },
        { x: 0.6, y: 0, width: 0.4, height: 0.6 },
        { x: 0.4, y: 0.6, width: 0.6, height: 0.4 },
        { x: 0, y: 0.4, width: 0.4, height: 0.6 },
    ]);

    assert.equal(tree, null);
});
