import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLayoutIndex } from './pickLayout.ts';

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

test('a single window uses the leftmost layout, which reflow makes fullscreen', () => {
    assert.equal(pickLayoutIndex(layouts, 1), 0);
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
