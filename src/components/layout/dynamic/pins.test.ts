import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPins } from './pins.ts';
import type { TileRect } from './layoutTree.ts';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const overlap = (a: TileRect, b: TileRect) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

function assertPartition(rects: TileRect[]) {
    const covered = rects.reduce((s, r) => s + r.width * r.height, 0);
    assert.ok(close(covered, 1), `covers ${covered}`);
    for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++)
            assert.ok(
                overlap(rects[i], rects[j]) < 1e-9,
                `${i} and ${j} overlap`,
            );
}

test('applyPins widens a slot to its minimum width and shrinks the neighbour', () => {
    const rects = [
        { x: 0, y: 0, width: 0.5, height: 1 },
        { x: 0.5, y: 0, width: 0.5, height: 1 },
    ];
    const out = applyPins(rects, [{ slot: 0, minWidth: 0.6 }]);
    assert.ok(close(out[0].width, 0.6));
    assert.ok(close(out[1].x, 0.6) && close(out[1].width, 0.4));
    assertPartition(out);
});

test('applyPins keeps slot order and leaves satisfied pins alone', () => {
    const rects = [
        { x: 0, y: 0, width: 0.5, height: 1 },
        { x: 0.5, y: 0, width: 0.5, height: 1 },
    ];
    assert.deepEqual(applyPins(rects, [{ slot: 1, minWidth: 0.4 }]), rects);
    assert.deepEqual(applyPins(rects, []), rects);
});

test('applyPins on a 2x2 grid moves the whole column divider', () => {
    // assign()'s slot order for a 2x2 grid: equal areas, top row first
    const rects = [
        { x: 0, y: 0, width: 0.5, height: 0.5 },
        { x: 0.5, y: 0, width: 0.5, height: 0.5 },
        { x: 0, y: 0.5, width: 0.5, height: 0.5 },
        { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ];
    const out = applyPins(rects, [{ slot: 0, minWidth: 0.6 }]);
    assert.ok(close(out[0].width, 0.6));
    assert.ok(close(out[2].width, 0.6), 'the cell below shares the divider');
    assert.ok(close(out[1].x, 0.6) && close(out[3].x, 0.6));
    assert.ok(close(out[0].height, 0.5), 'rows untouched');
    assertPartition(out);
});

test('applyPins handles height and two pins at once', () => {
    const rects = [
        { x: 0, y: 0, width: 0.5, height: 0.5 },
        { x: 0.5, y: 0, width: 0.5, height: 1 },
        { x: 0, y: 0.5, width: 0.5, height: 0.5 },
    ];
    const out = applyPins(rects, [
        { slot: 2, minHeight: 0.7 },
        { slot: 1, minWidth: 0.55 },
    ]);
    assert.ok(out[2].height >= 0.7 - 1e-9);
    assert.ok(out[1].width >= 0.55 - 1e-9);
    assertPartition(out);
});

test('applyPins never produces a rect outside the unit square, even for absurd pins', () => {
    const rects = [
        { x: 0, y: 0, width: 0.5, height: 1 },
        { x: 0.5, y: 0, width: 0.5, height: 1 },
    ];
    const out = applyPins(rects, [{ slot: 0, minWidth: 5 }]);
    assertPartition(out);
    assert.ok(out[1].width > 0);
});
