/** Pure policy table for WindowPlacer.place() decisions, no simulation. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PlacementTarget,
    PlacerClock,
    Rect,
    WindowPlacer,
} from './windowPlacer.ts';

const clock: PlacerClock = { timeout: () => 0, cancel: () => {} };

function fakeTarget(frame: Rect, alive = true) {
    const calls: string[] = [];
    let current = { ...frame };
    const target: PlacementTarget = {
        key: {},
        isAlive: () => alive,
        getFrameRect: () => ({ ...current }),
        moveToMonitor: (i) => calls.push(`monitor:${i}`),
        moveFrame: (_u, x, y) => calls.push(`move:${x},${y}`),
        moveResizeFrame: (_u, r) =>
            calls.push(`moveResize:${r.x},${r.y},${r.width},${r.height}`),
        getActor: () => null,
        onGeometryChanged: () => () => {},
        onGone: () => () => {},
    };
    return {
        target,
        calls,
        setFrame: (r: Rect) => {
            current = { ...r };
        },
    };
}

const DEST: Rect = { x: 10, y: 10, width: 500, height: 400 };

test('dead target -> skipped-dead, nothing called', () => {
    const { target, calls } = fakeTarget(DEST, false);
    assert.equal(new WindowPlacer(clock).place(target, DEST), 'skipped-dead');
    assert.deepEqual(calls, []);
});

test('frame already equals dest -> skipped-identical', () => {
    const { target, calls } = fakeTarget(DEST);
    assert.equal(
        new WindowPlacer(clock).place(target, DEST),
        'skipped-identical',
    );
    assert.deepEqual(calls, []);
});

test('first request -> move_to_monitor + move_resize_frame; forceMove adds move_frame', () => {
    const { target, calls } = fakeTarget({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
    });
    assert.equal(
        new WindowPlacer(clock, { monitorIndex: 2 }).place(target, DEST, {
            forceMove: true,
        }),
        'requested',
    );
    assert.deepEqual(calls, [
        'monitor:2',
        'move:10,10',
        'moveResize:10,10,500,400',
    ]);
});

test('after a settle, the same dest is skipped while the frame is unchanged and re-requested once it moved', () => {
    const { target, calls, setFrame } = fakeTarget({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
    });
    // a synchronous clock: every request settles immediately (as if the client never answered)
    const placer = new WindowPlacer({
        timeout: (_ms, cb) => {
            cb();
            return 0;
        },
        cancel: () => {},
    });
    assert.equal(placer.place(target, DEST), 'requested');
    assert.equal(placer.place(target, DEST), 'skipped-settled');
    setFrame({ x: 10, y: 10, width: 700, height: 400 }); // the client answered late, clamping width
    assert.equal(
        placer.place(target, DEST),
        'requested',
        'the frame changed since the settle',
    );
    assert.equal(calls.filter((c) => c.startsWith('moveResize')).length, 2);
});
