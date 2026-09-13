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

test('applyPins meets a pin that needs the divider above it to move, without over-allocating', () => {
    // three columns 0.5 | 0.25 | 0.25; the middle one must reach 0.49 —
    // more than its own split can give, so the root divider has to move
    const rects = [
        { x: 0, y: 0, width: 0.5, height: 1 },
        { x: 0.5, y: 0, width: 0.25, height: 1 },
        { x: 0.75, y: 0, width: 0.25, height: 1 },
    ];
    const out = applyPins(rects, [{ slot: 1, minWidth: 0.49 }]);
    assert.ok(out[1].width >= 0.49 - 1e-6, `middle got ${out[1].width}`);
    assert.ok(
        out[1].width <= 0.49 + 0.03,
        `middle over-allocated: ${out[1].width}`,
    );
    assert.ok(
        out[0].width >= 0.4,
        `left column needlessly crushed: ${out[0].width}`,
    );
    assertPartition(out);
});

test('applyPins keeps an already satisfied pin satisfied when a later pin moves its divider', () => {
    const rects = [
        { x: 0, y: 0, width: 0.5, height: 1 },
        { x: 0.5, y: 0, width: 0.25, height: 1 },
        { x: 0.75, y: 0, width: 0.25, height: 1 },
    ];
    const out = applyPins(rects, [
        { slot: 0, minWidth: 0.45 },
        { slot: 1, minWidth: 0.49 },
    ]);
    assert.ok(out[0].width >= 0.45 - 1e-6, `slot 0: ${out[0].width}`);
    assert.ok(out[1].width >= 0.49 - 1e-6, `slot 1: ${out[1].width}`);
    assertPartition(out);
});

test('applyPins grows the parent when two pinned siblings cannot both fit in their split', () => {
    // 0.5 | 0.25 | 0.25 with both right-hand columns pinned to 0.3: the
    // divider between them cannot satisfy both, so the root divider has to
    // move instead of the pins fighting over the same cut line
    const rects = [
        { x: 0, y: 0, width: 0.5, height: 1 },
        { x: 0.5, y: 0, width: 0.25, height: 1 },
        { x: 0.75, y: 0, width: 0.25, height: 1 },
    ];
    const out = applyPins(rects, [
        { slot: 1, minWidth: 0.3 },
        { slot: 2, minWidth: 0.3 },
    ]);
    assert.ok(out[1].width >= 0.3 - 1e-6, `slot 1: ${out[1].width}`);
    assert.ok(out[2].width >= 0.3 - 1e-6, `slot 2: ${out[2].width}`);
    assert.ok(close(out[0].width, 0.4), `slot 0: ${out[0].width}`);
    assertPartition(out);
});

test('applyPins grows the parent for pinned siblings nested under a cross-axis split', () => {
    // the live layout: left column = row of two cells over a wide cell,
    // right column = one tall cell; both cells of the row pinned to 0.26
    const rects = [
        { x: 0, y: 0, width: 0.26, height: 0.5 },
        { x: 0.26, y: 0, width: 0.26, height: 0.5 },
        { x: 0, y: 0.5, width: 0.52, height: 0.5 },
        { x: 0.52, y: 0, width: 0.48, height: 1 },
    ];
    const out = applyPins(rects, [
        { slot: 0, minWidth: 0.27 },
        { slot: 1, minWidth: 0.27 },
    ]);
    assert.ok(out[0].width >= 0.27 - 1e-6, `slot 0: ${out[0].width}`);
    assert.ok(out[1].width >= 0.27 - 1e-6, `slot 1: ${out[1].width}`);
    assert.ok(close(out[3].x, 0.54), `right column at ${out[3].x}`);
    assertPartition(out);
});

test('applyPins does not escalate a pin smaller than the sibling floor', () => {
    // the 0.02 column asks for 0.024, less than the 5 % floor its split
    // grants anyway; the root divider must not move
    const rects = [
        { x: 0, y: 0, width: 0.5, height: 1 },
        { x: 0.5, y: 0, width: 0.02, height: 1 },
        { x: 0.52, y: 0, width: 0.48, height: 1 },
    ];
    const out = applyPins(rects, [{ slot: 1, minWidth: 0.024 }]);
    assert.ok(out[1].width >= 0.024 - 1e-6, `slot 1: ${out[1].width}`);
    assert.ok(close(out[0].width, 0.5), `slot 0 moved: ${out[0].width}`);
    assert.ok(out[2].width > 0.4, `slot 2 crushed: ${out[2].width}`);
    assertPartition(out);
});

test('applyPins ignores a pin whose slot does not exist', () => {
    const rects = [
        { x: 0, y: 0, width: 0.5, height: 1 },
        { x: 0.5, y: 0, width: 0.5, height: 1 },
    ];
    const out = applyPins(rects, [
        { slot: 0, minWidth: 0.6 },
        { slot: 7, minWidth: 0.6 },
    ]);
    assert.ok(close(out[0].width, 0.6));
    assertPartition(out);
});
