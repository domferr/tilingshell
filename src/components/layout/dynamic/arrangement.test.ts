import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayoutTree } from './layoutTree.ts';
import type { TileRect } from './layoutTree.ts';
import { assign } from './reflow.ts';
import {
    arrangementKeys as keysOf,
    arrangementRectOf as rectOf,
    buildArrangement as build,
    insertIntoArrangement as insert,
    swapInArrangement as swap,
} from './arrangement.ts';
import type { Arrangement } from './arrangement.ts';

const twoColumns = () =>
    buildLayoutTree([
        { x: 0, y: 0, width: 0.67, height: 1 },
        { x: 0.67, y: 0, width: 0.33, height: 1 },
    ])!;

const layout2 = () =>
    buildLayoutTree([
        { x: 0, y: 0, width: 0.26, height: 0.5 },
        { x: 0.26, y: 0, width: 0.37, height: 1 },
        { x: 0.63, y: 0, width: 0.37, height: 1 },
        { x: 0, y: 0.5, width: 0.26, height: 0.5 },
    ])!;

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const rectClose = (a: TileRect | null, b: TileRect) =>
    a !== null &&
    close(a.x, b.x) &&
    close(a.y, b.y) &&
    close(a.width, b.width) &&
    close(a.height, b.height);
const assertRect = (tree: Arrangement<string>, key: string, r: TileRect) =>
    assert.ok(
        rectClose(rectOf(tree, key), r),
        `${key}: ${JSON.stringify(rectOf(tree, key))} != ${JSON.stringify(r)}`,
    );
const overlap = (a: TileRect, b: TileRect) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

function assertPartition(tree: Arrangement<string>, keys: string[]) {
    assert.deepEqual([...keysOf(tree)].sort(), [...keys].sort());
    const rects = keys.map((k) => rectOf(tree, k)!);
    const covered = rects.reduce((s, r) => s + r.width * r.height, 0);
    assert.ok(close(covered, 1), `covers ${covered}`);
    for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++)
            assert.ok(
                overlap(rects[i], rects[j]) < 1e-9,
                `${keys[i]} and ${keys[j]} overlap`,
            );
}

test('build maps keys onto the layout in slot order', () => {
    const t = build(twoColumns(), ['a', 'b'])!;
    assertRect(t, 'a', { x: 0, y: 0, width: 0.67, height: 1 });
    assertRect(t, 'b', { x: 0.67, y: 0, width: 0.33, height: 1 });
});

test('insert cuts the nominated leaf and gives the newcomer the second half', () => {
    const t = insert(build(twoColumns(), ['a', 'b'])!, 'a', 'c');
    assertRect(t, 'a', { x: 0, y: 0, width: 0.67, height: 0.5 });
    assertRect(t, 'c', { x: 0, y: 0.5, width: 0.67, height: 0.5 });
    assertRect(t, 'b', { x: 0.67, y: 0, width: 0.33, height: 1 });
});

test('insert leaves every other leaf alone, even a roomier one', () => {
    const t = insert(build(twoColumns(), ['a', 'b'])!, 'b', 'c');
    assertRect(t, 'a', { x: 0, y: 0, width: 0.67, height: 1 });
    assertRect(t, 'b', { x: 0.67, y: 0, width: 0.33, height: 0.5 });
    assertRect(t, 'c', { x: 0.67, y: 0.5, width: 0.33, height: 0.5 });
});

test('insert without a nominee cuts the roomiest leaf', () => {
    const t = insert(build(twoColumns(), ['a', 'b'])!, undefined, 'c');
    assertRect(t, 'a', { x: 0, y: 0, width: 0.67, height: 0.5 });
    assertRect(t, 'c', { x: 0, y: 0.5, width: 0.67, height: 0.5 });
});

test('insert with an unknown nominee behaves like no nominee', () => {
    const t = insert(build(twoColumns(), ['a', 'b'])!, 'zzz', 'c');
    assertRect(t, 'c', { x: 0, y: 0.5, width: 0.67, height: 0.5 });
});

test('insert cuts a wide leaf vertically', () => {
    let t = build(twoColumns(), ['a', 'b'])!;
    t = insert(t, 'a', 'c');
    t = insert(t, 'c', 'd');
    assertRect(t, 'c', { x: 0, y: 0.5, width: 0.335, height: 0.5 });
    assertRect(t, 'd', { x: 0.335, y: 0.5, width: 0.335, height: 0.5 });
    assertRect(t, 'a', { x: 0, y: 0, width: 0.67, height: 0.5 });
});

test('insert keeps history: an earlier focused cut survives a later one', () => {
    // the plan's step 2: w5 split R (not the roomiest), then w6 splits L-T;
    // w5 must stay in R's bottom half
    let t = build(layout2(), ['w1', 'w2', 'w3', 'w4'])!;
    t = insert(t, 'w2', 'w5');
    t = insert(t, 'w3', 'w6');
    assertRect(t, 'w1', { x: 0.26, y: 0, width: 0.37, height: 1 });
    assertRect(t, 'w2', { x: 0.63, y: 0, width: 0.37, height: 0.5 });
    assertRect(t, 'w5', { x: 0.63, y: 0.5, width: 0.37, height: 0.5 });
    assertRect(t, 'w3', { x: 0, y: 0, width: 0.26, height: 0.25 });
    assertRect(t, 'w6', { x: 0, y: 0.25, width: 0.26, height: 0.25 });
    assertRect(t, 'w4', { x: 0, y: 0.5, width: 0.26, height: 0.5 });
});

test('swap exchanges the two keys and nothing else', () => {
    const before = build(twoColumns(), ['a', 'b'])!;
    const t = swap(before, 'a', 'b');
    assertRect(t, 'b', rectOf(before, 'a')!);
    assertRect(t, 'a', rectOf(before, 'b')!);
    assert.deepEqual(keysOf(t).sort(), ['a', 'b']);
});

test('rectOf is null for an unknown key', () => {
    assert.equal(rectOf(build(twoColumns(), ['a', 'b'])!, 'x'), null);
});

test('build with a focused key reproduces assign with that slot nominated', () => {
    const keys = ['a', 'b', 'c', 'd'];
    const t = build(twoColumns(), keys, 'b')!;
    const rects = assign(twoColumns(), 4, 1);
    keys.forEach((k, i) => assertRect(t, k, rects[i]));
});

test('build with a focused key in an overflow half matches assign', () => {
    const keys = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];
    const t = build(layout2(), keys, 'w5')!;
    const rects = assign(layout2(), 6, 4);
    keys.forEach((k, i) => assertRect(t, k, rects[i]));
});

test('random inserts and swaps always keep a partition of the screen', () => {
    let seed = 12345;
    const rnd = (n: number) => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % n;
    };
    for (let run = 0; run < 200; run++) {
        const keys = ['w1', 'w2', 'w3', 'w4'];
        let t = build(layout2(), keys)!;
        for (let step = 0; step < 8; step++) {
            if (rnd(3) === 0) {
                const a = keys[rnd(keys.length)];
                const b = keys[rnd(keys.length)];
                t = swap(t, a, b);
            } else {
                const at = rnd(4) === 0 ? undefined : keys[rnd(keys.length)];
                const k = `n${run}-${step}`;
                keys.push(k);
                t = insert(t, at, k);
            }
            assertPartition(t, keys);
        }
    }
});
