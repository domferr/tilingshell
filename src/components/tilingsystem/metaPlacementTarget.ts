import { Clutter, GLib, Meta, Mtk } from '../../gi/ext';
import type { PlacementTarget, PlacerClock, Rect } from './windowPlacer';
import { adaptWindow } from './placementAdapter';

/**
 * PlacementTarget over a Meta.Window: one cached adapter per window, so the
 * placer's per-window history has a stable key. The adapter itself is shared
 * with the mutter simulation (placementAdapter.ts).
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

export function placementTargetFor(window: Meta.Window): PlacementTarget {
    let target = targets.get(window);
    if (!target) {
        target = adaptWindow(window, Clutter.AnimationMode.EASE_OUT_QUAD);
        targets.set(window, target);
    }
    return target;
}
