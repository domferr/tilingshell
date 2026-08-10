import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLayoutIndex, pickLayoutIndexAt } from './pickLayout.ts';

// Jacob's layouts in their current order: a 4-tile layout, then three 2-tile ones
const layouts = [4, 2, 2, 2];

test('a layout with exactly as many tiles as windows wins', () => {
    assert.equal(pickLayoutIndex(layouts, 2), 1);
    assert.equal(pickLayoutIndex(layouts, 4), 0);
});

test('the leftmost exact match wins, so order is preference', () => {
    assert.equal(pickLayoutIndex([2, 4, 2], 2), 0);
    assert.equal(pickLayoutIndex([4, 2, 2], 2), 1);
});

test('with no exact match the leftmost roomier layout is collapsed', () => {
    // three windows, nothing has three tiles: the 4-tile layout collapses
    assert.equal(pickLayoutIndex(layouts, 3), 0);
});

test('the least roomier layout is preferred, to collapse as little as possible', () => {
    // two windows, no 2-tile layout: 3 collapses less than 8, whatever the
    // order the layouts happen to sit in
    assert.equal(pickLayoutIndex([8, 3, 5], 2), 1);
    assert.equal(pickLayoutIndex([5, 8, 3], 2), 2);
});

test('within the chosen tile count the leftmost still wins', () => {
    assert.equal(pickLayoutIndex([8, 3, 3], 2), 1);
});

test('a single window picks the least roomy layout, and reflow makes it fullscreen', () => {
    // any layout collapses to fullscreen for one window, so this only decides
    // which one does the collapsing: the 2-tile group, not the 4-tile one
    assert.equal(pickLayoutIndex(layouts, 1), 1);
});

test('when nothing is big enough the roomiest layout is subdivided', () => {
    assert.equal(pickLayoutIndex(layouts, 5), 0);
    assert.equal(pickLayoutIndex([2, 3, 2], 9), 1);
});

test('ties on tile count keep the leftmost', () => {
    assert.equal(pickLayoutIndex([3, 3], 7), 0);
});

test('an empty list has nothing to pick', () => {
    assert.equal(pickLayoutIndex([], 3), -1);
});

test('the group at an offset is every layout sharing the picked tile count, offset wraps', () => {
    // 4, 2, 2, 2 — 2 windows picks index 1, whose group is every 2-tile layout
    assert.equal(pickLayoutIndexAt(layouts, 2, 0), 1);
    assert.equal(pickLayoutIndexAt(layouts, 2, 1), 2);
    assert.equal(pickLayoutIndexAt(layouts, 2, 2), 3);
    assert.equal(pickLayoutIndexAt(layouts, 2, 3), 1, 'wraps back to the first');
    assert.equal(pickLayoutIndexAt(layouts, 2, -1), 3, 'negative wraps backward');
});

test('offset 0 always agrees with pickLayoutIndex', () => {
    for (const [layouts_, n] of [
        [[4, 2, 2, 2], 2],
        [[4, 2, 2, 2], 3],
        [[4, 2, 2, 2], 4],
        [[4, 2, 2, 2], 1],
        [[8, 3, 5], 2],
        [[], 3],
    ] as [number[], number][]) {
        assert.equal(pickLayoutIndexAt(layouts_, n, 0), pickLayoutIndex(layouts_, n));
    }
});

test('a group of one does not move regardless of offset', () => {
    assert.equal(pickLayoutIndexAt([4, 2, 2, 2], 4, 1), 0);
    assert.equal(pickLayoutIndexAt([4, 2, 2, 2], 4, 5), 0);
});

test('an empty list has nothing to cycle either', () => {
    assert.equal(pickLayoutIndexAt([], 3, 1), -1);
});
