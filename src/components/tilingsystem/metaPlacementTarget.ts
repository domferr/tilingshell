import { Clutter, GLib, Meta, Mtk } from '../../gi/ext';
import type {
    PlacementActor,
    PlacementTarget,
    PlacerClock,
    Rect,
} from './windowPlacer';

/**
 * Adapts a Meta.Window to the WindowPlacer's PlacementTarget. One adapter per
 * window, cached, so the placer's per-window history keys stay stable.
 */
const targets = new WeakMap<Meta.Window, PlacementTarget>();

export const gjsPlacerClock: PlacerClock = {
    timeout: (ms, cb) =>
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            cb();
            return GLib.SOURCE_REMOVE;
        }),
    cancel: (handle) => {
        GLib.Source.remove(handle as number);
    },
};

export function toRect(r: Mtk.Rectangle): Rect {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function actorFor(actor: Meta.WindowActor): PlacementActor {
    return {
        setTransform(scaleX, scaleY, tx, ty) {
            actor.scale_x = scaleX;
            actor.scale_y = scaleY;
            actor.translation_x = tx;
            actor.translation_y = ty;
        },
        easeToIdentity(durationMs, onStopped) {
            actor.ease({
                scaleX: 1,
                scaleY: 1,
                translationX: 0,
                translationY: 0,
                duration: durationMs,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped,
            });
        },
        cancelTransitions() {
            actor.remove_all_transitions();
        },
    };
}

export function placementTargetFor(window: Meta.Window): PlacementTarget {
    let target = targets.get(window);
    if (target) return target;

    target = {
        key: window,
        isAlive: () => window.get_compositor_private() !== null,
        getFrameRect: () => toRect(window.get_frame_rect()),
        moveToMonitor: (index) => window.move_to_monitor(index),
        moveFrame: (userOp, x, y) => window.move_frame(userOp, x, y),
        moveResizeFrame: (userOp, r) =>
            window.move_resize_frame(userOp, r.x, r.y, r.width, r.height),
        getActor: () => {
            const actor =
                window.get_compositor_private() as Meta.WindowActor | null;
            return actor ? actorFor(actor) : null;
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
    targets.set(window, target);
    return target;
}
