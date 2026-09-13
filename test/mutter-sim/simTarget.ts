/** PlacementTarget adapter over the simulated MetaWindow, mirroring metaPlacementTarget.ts. */
import type {
    PlacementActor,
    PlacementTarget,
    PlacerClock,
    Rect,
} from '../../src/components/tilingsystem/windowPlacer.ts';
import { SimClock } from './clock.ts';
import { SimWindow, SimWindowActor } from './mutter.ts';

const targets = new WeakMap<SimWindow, PlacementTarget>();

export function simClock(clock: SimClock): PlacerClock {
    return {
        timeout: (ms, cb) => clock.timeout(ms, cb),
        cancel: (h) => {
            clock.cancel(h as number);
        },
    };
}

function actorFor(actor: SimWindowActor): PlacementActor {
    return {
        setTransform(scaleX, scaleY, tx, ty) {
            actor.scale_x = scaleX;
            actor.scale_y = scaleY;
            actor.translation_x = tx;
            actor.translation_y = ty;
        },
        easeToIdentity(durationMs, onStopped) {
            actor.ease({
                scale_x: 1,
                scale_y: 1,
                translation_x: 0,
                translation_y: 0,
                duration: durationMs,
                onStopped,
            });
        },
        cancelTransitions() {
            actor.remove_all_transitions();
        },
    };
}

export function simTargetFor(window: SimWindow): PlacementTarget {
    let t = targets.get(window);
    if (t) return t;
    t = {
        key: window,
        isAlive: () => window.get_compositor_private() !== null,
        getFrameRect: () => window.get_frame_rect(),
        moveToMonitor: (i) => window.move_to_monitor(i),
        moveFrame: (userOp, x, y) => window.move_frame(userOp, x, y),
        moveResizeFrame: (userOp, r) =>
            window.move_resize_frame(userOp, r.x, r.y, r.width, r.height),
        getActor: () => {
            const a = window.get_compositor_private();
            return a ? actorFor(a) : null;
        },
        onGeometryChanged: (cb) => {
            const a = window.connect('size-changed', cb);
            const b = window.connect('position-changed', cb);
            return () => {
                window.disconnect(a);
                window.disconnect(b);
            };
        },
        onGone: (cb) => {
            const id = window.connect('unmanaging', cb);
            return () => window.disconnect(id);
        },
    };
    targets.set(window, t);
    return t;
}
