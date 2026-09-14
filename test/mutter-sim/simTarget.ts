/** PlacementTarget over the simulated MetaWindow, through the same adapter the extension uses. */
import type {
    PlacementTarget,
    PlacerClock,
} from '../../src/components/tilingsystem/windowPlacer.ts';
import { adaptWindow } from '../../src/components/tilingsystem/placementAdapter.ts';
import { SimClock } from './clock.ts';
import { SimWindow } from './mutter.ts';

const targets = new WeakMap<SimWindow, PlacementTarget>();

export function simClock(clock: SimClock): PlacerClock {
    return {
        timeout: (ms, cb) => clock.timeout(ms, cb),
        cancel: (h) => {
            clock.cancel(h as number);
        },
    };
}

export function simTargetFor(window: SimWindow): PlacementTarget {
    let t = targets.get(window);
    if (!t) {
        t = adaptWindow(window);
        targets.set(window, t);
    }
    return t;
}
