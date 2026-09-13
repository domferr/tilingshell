/**
 * The new placement policy against the mutter simulation. Every scenario
 * asserts the invariants the legacy placer violates: the actor is never
 * frozen, its geometry always matches the window, and mutter's size-change
 * accounting is never touched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SimClock } from './clock.ts';
import {
    AckPolicy,
    Rect,
    SimCompositor,
    SimWindow,
    SimWindowActor,
    actorRect,
} from './mutter.ts';
import { ShellWindowManager } from './shellWindowManager.ts';
import { simClock, simTargetFor } from './simTarget.ts';
import { WindowPlacer } from '../../src/components/tilingsystem/windowPlacer.ts';

const WORK_AREA: Rect = { x: 0, y: 32, width: 1920, height: 1048 };
const TILE_S: Rect = { x: 8, y: 40, width: 600, height: 500 };

function fixture(
    policy: AckPolicy = { kind: 'comply' },
    frame: Rect = { x: 8, y: 40, width: 800, height: 600 },
) {
    const clock = new SimClock();
    const compositor = new SimCompositor(clock, WORK_AREA);
    const wm = new ShellWindowManager(compositor, clock);
    const window = compositor.createWindow('w', frame, policy);
    const placer = new WindowPlacer(simClock(clock), { monitorIndex: 0 });
    return { clock, compositor, wm, window, placer };
}

function assertHealthy(
    actor: SimWindowActor,
    window: SimWindow,
    compositor: SimCompositor,
    wm: ShellWindowManager,
) {
    assert.equal(actor.freezeCount, 0, 'never frozen');
    assert.equal(actor.__animationInfo, undefined, 'no shell animation info');
    assert.equal(wm._resizePending.size, 0);
    assert.equal(
        compositor.warnings.length,
        0,
        `no warnings: ${compositor.warnings.join(', ')}`,
    );
    assert.deepEqual(
        actorRect(actor),
        window.get_buffer_rect(),
        'actor tracks the window',
    );
}

test('(iii) clamping client: repeated identical requests never freeze and never re-request', () => {
    const { clock, compositor, wm, window, placer } = fixture({
        kind: 'clampMin',
        minWidth: 700,
        minHeight: 600,
    });
    const actor = window.get_compositor_private()!;
    const target = simTargetFor(window);

    assert.equal(placer.place(target, TILE_S, { animate: true }), 'requested');
    assert.equal(window.sentConfigurations.length, 1);
    clock.tick(20); // client acks with 700x600
    assert.deepEqual(window.get_frame_rect(), {
        x: 8,
        y: 40,
        width: 700,
        height: 600,
    });
    clock.tick(300); // our animation settles
    assertHealthy(actor, window, compositor, wm);
    assert.equal(actor.scale_x, 1);

    // identical request twice: the client already gave its answer to exactly this rect
    assert.equal(
        placer.place(target, TILE_S, { animate: true }),
        'skipped-settled',
    );
    assert.equal(
        placer.place(target, TILE_S, { animate: true }),
        'skipped-settled',
    );
    assert.equal(window.sentConfigurations.length, 1, 'nothing re-sent');
    clock.tick(10_000);
    assertHealthy(actor, window, compositor, wm);

    // the user drags it away, then the tile is asked for again: only the position is off,
    // so request a move at the size the client accepted (a new configuration, not deduped)
    window.move_frame(true, 300, 300);
    assert.deepEqual(window.get_frame_rect(), {
        x: 300,
        y: 300,
        width: 700,
        height: 600,
    });
    assert.equal(
        placer.place(target, TILE_S, { animate: true }),
        'requested-move-only',
    );
    clock.tick(20);
    assert.deepEqual(window.get_frame_rect(), {
        x: 8,
        y: 40,
        width: 700,
        height: 600,
    });
    clock.tick(300);
    assertHealthy(actor, window, compositor, wm);
    assert.equal(clock.pendingTimeouts, 0, 'no leaked timeouts');
});

test('(iv) rapid successive requests before any ack: one animation, from the first rect to the last', () => {
    const { clock, compositor, wm, window, placer } = fixture({
        kind: 'delayed',
        ms: 50,
        then: { kind: 'comply' },
    });
    const actor = window.get_compositor_private()!;
    const target = simTargetFor(window);
    const r1 = { x: 8, y: 40, width: 600, height: 500 };
    const r2 = { x: 8, y: 40, width: 900, height: 500 };
    const r3 = { x: 700, y: 40, width: 900, height: 1000 };

    assert.equal(placer.place(target, r1, { animate: true }), 'requested');
    assert.equal(placer.place(target, r2, { animate: true }), 'requested');
    assert.equal(placer.place(target, r3, { animate: true }), 'requested');
    assert.equal(actor.freezeCount, 0);

    clock.tick(200); // all acks in
    assert.deepEqual(window.get_frame_rect(), r3);
    // the animation starts from the pre-r1 rect (800x600) toward r3
    assert.ok(
        actor.scale_x !== 1 || actor.translation_x !== 0,
        'animation in flight',
    );
    assert.deepEqual(
        actorRect(actor),
        window.get_buffer_rect(),
        'geometry already synced, only a transform',
    );
    clock.tick(300);
    assertHealthy(actor, window, compositor, wm);
    assert.equal(actor.scale_x, 1);
    assert.equal(actor.translation_x, 0);
    assert.equal(clock.pendingTimeouts, 0);
});

test('(v) a window whose actor is gone is skipped, not thrown on', () => {
    const { clock, compositor, placer } = fixture();
    const a = compositor.createWindow(
        'a',
        { x: 0, y: 32, width: 300, height: 300 },
        { kind: 'comply' },
    );
    const b = compositor.createWindow(
        'b',
        { x: 0, y: 32, width: 300, height: 300 },
        { kind: 'comply' },
    );
    const c = compositor.createWindow(
        'c',
        { x: 0, y: 32, width: 300, height: 300 },
        { kind: 'comply' },
    );
    b.unmanage();
    const results = [a, b, c].map((w, i) =>
        placer.place(simTargetFor(w), {
            x: i * 640,
            y: 40,
            width: 600,
            height: 1000,
        }),
    );
    assert.deepEqual(results, ['requested', 'skipped-dead', 'requested']);
    clock.tick(400);
    assert.deepEqual(a.get_frame_rect(), {
        x: 0,
        y: 40,
        width: 600,
        height: 1000,
    });
    assert.deepEqual(c.get_frame_rect(), {
        x: 1280,
        y: 40,
        width: 600,
        height: 1000,
    });
});

test('(vi) maximized window: mutter animates the unmaximize, we only place afterwards', () => {
    const { clock, compositor, wm, window, placer } = fixture(
        { kind: 'comply' },
        { x: 0, y: 32, width: 1920, height: 1048 },
    );
    window.maximized = true;
    const actor = window.get_compositor_private()!;
    const target = simTargetFor(window);

    // what _easeWindowRectFromTile will do for a maximized window
    wm.skipNextEffect(actor);
    window.unmaximize();
    assert.equal(
        actor.sizeChangeInProgress,
        0,
        'skipNextEffect completed the effect immediately',
    );
    assert.equal(placer.place(target, TILE_S, { animate: true }), 'requested');
    clock.tick(400);
    assert.deepEqual(window.get_frame_rect(), TILE_S);
    assertHealthy(actor, window, compositor, wm);
});

test('(viii) a client that never acks: the request settles by timeout and is not repeated', () => {
    const { clock, compositor, wm, window, placer } = fixture({
        kind: 'ignore',
    });
    const actor = window.get_compositor_private()!;
    const target = simTargetFor(window);

    assert.equal(placer.place(target, TILE_S, { animate: true }), 'requested');
    assert.equal(placer.place(target, TILE_S, { animate: true }), 'coalesced');
    clock.tick(400);
    assert.equal(
        actor.scale_x,
        1,
        'no animation for a rect that never changed',
    );
    assertHealthy(actor, window, compositor, wm);
    assert.equal(clock.pendingTimeouts, 0);
    assert.equal(
        placer.place(target, TILE_S, { animate: true }),
        'skipped-settled',
    );
    assert.equal(window.sentConfigurations.length, 1);
});

test('(ix) a window that is unmanaged mid-request cleans up without animating', () => {
    const { clock, window, placer } = fixture({
        kind: 'delayed',
        ms: 100,
        then: { kind: 'comply' },
    });
    const target = simTargetFor(window);
    assert.equal(placer.place(target, TILE_S, { animate: true }), 'requested');
    window.unmanage();
    clock.tick(1000);
    assert.equal(clock.pendingTimeouts, 0);
    assert.equal(placer.place(target, TILE_S), 'skipped-dead');
});

test('(x) placer.destroy() cancels everything in flight', () => {
    const { clock, window, placer } = fixture({
        kind: 'delayed',
        ms: 100,
        then: { kind: 'comply' },
    });
    placer.place(simTargetFor(window), TILE_S, { animate: true });
    placer.destroy();
    assert.equal(
        clock.pendingTimeouts,
        1,
        'only the client ack remains scheduled',
    );
    clock.tick(1000);
    assert.equal(window.get_compositor_private()!.scale_x, 1);
});
