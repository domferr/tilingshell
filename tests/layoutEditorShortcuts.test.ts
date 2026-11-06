import assert from 'node:assert/strict';
import test from 'node:test';
import {
    LayoutEditorShortcut,
    matchesLayoutEditorShortcut,
    normalizeLayoutEditorShortcut,
} from '../src/utils/layoutEditorShortcuts';

const masks = { ctrl: 1, alt: 2, super: 4 };

test('uses the requested fallback for an invalid stored shortcut', () => {
    assert.equal(
        normalizeLayoutEditorShortcut('invalid', LayoutEditorShortcut.ALT_MIDDLE),
        LayoutEditorShortcut.ALT_MIDDLE,
    );
});

test('matches each shortcut only with its exact relevant modifiers', () => {
    assert.equal(
        matchesLayoutEditorShortcut(LayoutEditorShortcut.MIDDLE, 0, masks),
        true,
    );
    assert.equal(
        matchesLayoutEditorShortcut(LayoutEditorShortcut.MIDDLE, masks.alt, masks),
        false,
    );
    assert.equal(
        matchesLayoutEditorShortcut(
            LayoutEditorShortcut.CTRL_MIDDLE,
            masks.ctrl,
            masks,
        ),
        true,
    );
    assert.equal(
        matchesLayoutEditorShortcut(
            LayoutEditorShortcut.ALT_MIDDLE,
            masks.alt,
            masks,
        ),
        true,
    );
    assert.equal(
        matchesLayoutEditorShortcut(
            LayoutEditorShortcut.SUPER_MIDDLE,
            masks.super,
            masks,
        ),
        true,
    );
    assert.equal(
        matchesLayoutEditorShortcut(
            LayoutEditorShortcut.ALT_MIDDLE,
            masks.alt | masks.ctrl,
            masks,
        ),
        false,
    );
});

test('disabled shortcuts never match', () => {
    assert.equal(
        matchesLayoutEditorShortcut(LayoutEditorShortcut.DISABLED, 0, masks),
        false,
    );
});