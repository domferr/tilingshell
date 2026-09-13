/**
 * Characterisation of the bug: the placement code at HEAD (and the Aug-14
 * working tree) freezes the window actor through GNOME Shell's private
 * _prepareAnimationInfo and relies on a `size-changed` that Wayland never
 * sends when the request is a no-op for mutter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SimClock } from './clock.ts';
import { SimCompositor, SimWindow } from './mutter.ts';
import { ShellWindowManager } from './shellWindowManager.ts';
import { easeWindowRectHead, easeWindowRectWorkingTree } from './legacyPlacers.ts';

const WORK_AREA = { x: 0, y: 32, width: 1920, height: 1048 };
const TILE_S = { x: 8, y: 40, width: 600, height: 500 };

function fixture() {
    const clock = new SimClock();
    const compositor = new SimCompositor(clock, WORK_AREA);
    const wm = new ShellWindowManager(compositor, clock);
    // Brave/WhatsApp-like client: refuses widths below 700 and heights below 600
    const brave = compositor.createWindow('brave', { x: 8, y: 40, width: 800, height: 600 }, {
        kind: 'clampMin',
        minWidth: 700,
        minHeight: 600,
    });
    return { clock, compositor, wm, brave };
}

test('HEAD placer: an identical re-request after the client clamped leaves the actor frozen forever', () => {
    const { clock, compositor, wm, brave } = fixture();
    const actor = brave.get_compositor_private()!;

    // 1st request: configure is sent, actor frozen while waiting for the ack
    easeWindowRectHead(wm, brave, TILE_S);
    assert.equal(brave.sentConfigurations.length, 1);
    assert.equal(actor.freezeCount, 1);
    assert.equal(actor.__animationInfo?.frozen, true);

    // client acks with its clamped size -> mutter emits size-changed -> shell thaws + animates
    clock.tick(20);
    assert.deepEqual(brave.get_frame_rect(), { x: 8, y: 40, width: 700, height: 600 });
    assert.equal(actor.freezeCount, 0);
    clock.tick(300);
    assert.equal(actor.__animationInfo, undefined);
    assert.equal(compositor.warnings.length, 1, 'one unpaired completed_size_change per placement');

    // 2nd identical request: frame (700x600) != dest (600x500) so the placer does not early-return
    easeWindowRectHead(wm, brave, TILE_S);
    assert.equal(brave.sentConfigurations.length, 1, 'mutter dedupes the equivalent configuration');
    assert.equal(actor.freezeCount, 1);
    clock.tick(10_000);
    assert.equal(actor.__animationInfo?.frozen, true, 'no size-changed ever arrives');
    assert.equal(actor.freezeCount, 1, 'still frozen after 10s');

    // the app keeps painting but nothing reaches the screen
    const shownBefore = actor.visibleFrame;
    brave.clientCommitFrame();
    brave.clientCommitFrame();
    assert.equal(actor.visibleFrame, shownBefore, 'frozen actor shows stale content');

    // a request for a different rect heals it (double prepare thaws + re-freezes, then the ack thaws)
    easeWindowRectHead(wm, brave, { ...TILE_S, x: 300 });
    assert.ok(compositor.events.includes('Old animationInfo removed'));
    clock.tick(20);
    assert.equal(actor.freezeCount, 0);
    assert.equal(compositor.warnings.length, 2, 'double prepare paid one completion');
    clock.tick(300);
    assert.equal(compositor.warnings.length, 3, 'and the animation end paid another');
});

test('working-tree placer: the alreadyAnimating guard never re-prepares, so the freeze is permanent', () => {
    const { clock, compositor, wm, brave } = fixture();
    const actor = brave.get_compositor_private()!;

    easeWindowRectWorkingTree(wm, brave, TILE_S);
    clock.tick(320);
    easeWindowRectWorkingTree(wm, brave, TILE_S); // deduped -> frozen
    clock.tick(10_000);
    assert.equal(actor.freezeCount, 1);

    // 3rd identical request: guard skips the prepare, so not even the accidental thaw happens
    easeWindowRectWorkingTree(wm, brave, TILE_S);
    assert.ok(!compositor.events.includes('Old animationInfo removed'));
    clock.tick(10_000);
    assert.equal(actor.freezeCount, 1);
    assert.equal(actor.__animationInfo?.frozen, true);
    // mutter never moved the window either: it sits at the clamped rect, not in the tile,
    // and no repaint reaches the screen
    assert.deepEqual(brave.get_frame_rect(), { x: 8, y: 40, width: 700, height: 600 });
    const shown = actor.visibleFrame;
    brave.clientCommitFrame();
    assert.equal(actor.visibleFrame, shown);

    // a different-position request still heals via MOVED -> size-changed (model honesty check)
    easeWindowRectWorkingTree(wm, brave, { ...TILE_S, x: 300 });
    clock.tick(20);
    assert.equal(actor.freezeCount, 0);
});
