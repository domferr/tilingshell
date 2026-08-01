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
