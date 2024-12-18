import { St, Meta, Mtk, Clutter, Shell } from '@gi.ext';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Monitor } from 'resource:///org/gnome/shell/ui/layout.js';

export const getMonitors = (): Monitor[] => Main.layoutManager.monitors;

export const isPointInsideRect = (
    point: { x: number; y: number },
    rect: Mtk.Rectangle,
): boolean => {
    return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
    );
};

export const clampPointInsideRect = (
    point: { x: number; y: number },
    rect: Mtk.Rectangle,
): { x: number; y: number } => {
    const clamp = (n: number, min: number, max: number) =>
        Math.min(Math.max(n, min), max);
    return {
        x: clamp(point.x, rect.x, rect.x + rect.width),
        y: clamp(point.y, rect.y, rect.y + rect.height),
    };
};

export const buildTileGaps = (
    tilePos: Mtk.Rectangle,
    innerGaps: Clutter.Margin,
    outerGaps: Clutter.Margin,
    container: Mtk.Rectangle,
    scalingFactor: number = 1,
): Clutter.Margin => {
    // compare two values and return true if their are equal with a max error of 2
    const almostEqual = (first: number, second: number) =>
        Math.abs(first - second) <= 1;
    const isLeft = almostEqual(tilePos.x, container.x);
    const isTop = almostEqual(tilePos.y, container.y);
    const isRight = almostEqual(
        tilePos.x + tilePos.width,
        container.x + container.width,
    );
    const isBottom = almostEqual(
        tilePos.y + tilePos.height,
        container.y + container.height,
    );
    const margin = new Clutter.Margin();
    margin.top = (isTop ? outerGaps.top : innerGaps.top / 2) * scalingFactor;
    margin.bottom =
        (isBottom ? outerGaps.bottom : innerGaps.bottom / 2) * scalingFactor;
    margin.left =
        (isLeft ? outerGaps.left : innerGaps.left / 2) * scalingFactor;
    margin.right =
        (isRight ? outerGaps.right : innerGaps.right / 2) * scalingFactor;
    return margin;
};

export const getMonitorScalingFactor = (monitorIndex: number) => {
    const scalingFactor = St.ThemeContext.get_for_stage(
        global.get_stage(),
    ).get_scale_factor();
    if (scalingFactor === 1)
        return global.display.get_monitor_scale(monitorIndex);
    return scalingFactor;
};

export const getScalingFactorOf = (widget: St.Widget): [boolean, number] => {
    const [hasReference, scalingReference] = widget
        .get_theme_node()
        .lookup_length('scaling-reference', true);
    // if the reference is missing, then the parent opted out of scaling the child
    if (!hasReference) return [true, 1];
    // if the scalingReference is not 1, then the scaling factor is already applied on styles (but not on width and height)

    const [hasValue, monitorScalingFactor] = widget
        .get_theme_node()
        .lookup_length('monitor-scaling-factor', true);
    if (!hasValue) return [true, 1];

    return [scalingReference !== 1, monitorScalingFactor / scalingReference];
};

export const enableScalingFactorSupport = (
    widget: St.Widget,
    monitorScalingFactor?: number,
) => {
    if (!monitorScalingFactor) return;
    widget.set_style(`${getScalingFactorSupportString(monitorScalingFactor)};`);
};

export const getScalingFactorSupportString = (monitorScalingFactor: number) => {
    return `scaling-reference: 1px; monitor-scaling-factor: ${monitorScalingFactor}px`;
};

export function getWindowsOfMonitor(monitor: Monitor): Meta.Window[] {
    return global.workspaceManager
        .get_active_workspace()
        .list_windows()
        .filter(
            (win) =>
                win.get_window_type() === Meta.WindowType.NORMAL &&
                Main.layoutManager.monitors[win.get_monitor()] === monitor,
        );
}

export function buildMarginOf(value: number): Clutter.Margin {
    const margin = new Clutter.Margin();
    margin.top = value;
    margin.bottom = value;
    margin.left = value;
    margin.right = value;
    return margin;
}

export function buildMargin(params: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
}): Clutter.Margin {
    const margin = new Clutter.Margin();
    if (params.top) margin.top = params.top;
    if (params.bottom) margin.bottom = params.bottom;
    if (params.left) margin.left = params.left;
    if (params.right) margin.right = params.right;
    return margin;
}

export function buildRectangle(
    params: { x?: number; y?: number; width?: number; height?: number } = {},
): Mtk.Rectangle {
    return new Mtk.Rectangle({
        x: params.x || 0,
        y: params.y || 0,
        width: params.width || 0,
        height: params.height || 0,
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEventCoords(event: any): number[] {
    return event.get_coords ? event.get_coords() : [event.x, event.y]; // GNOME 40-44
}

export function buildBlurEffect(sigma: number): Shell.BlurEffect {
    // changes in GNOME 46+
    // The sigma in Shell.BlurEffect should be replaced by radius. Since the sigma value
    // is radius / 2.0, the radius value will be sigma * 2.0.

    const effect = new Shell.BlurEffect();
    effect.set_mode(Shell.BlurMode.BACKGROUND); // blur what is behind the widget
    effect.set_brightness(1);
    if (effect.set_radius) {
        effect.set_radius(sigma * 2);
    } else {
        // @ts-expect-error "set_sigma is available in old shell versions (<= 45)"
        effect.set_sigma(sigma);
    }
    return effect;
}

function getTransientOrParent(window: Meta.Window): Meta.Window {
    const transient = window.get_transient_for();
    return window.is_attached_dialog() && transient !== null
        ? transient
        : window;
}

export function filterUnfocusableWindows(
    windows: Meta.Window[],
): Meta.Window[] {
    // we want to filter out
    // - top-level windows which are precluded by dialogs
    // - anything tagged skip-taskbar
    // - duplicates
    return windows
        .map(getTransientOrParent)
        .filter((win: Meta.Window, idx: number, arr: Meta.Window[]) => {
            // typings indicate win will not be null, but this check is found
            // in the source, so...
            return win !== null && !win.skipTaskbar && arr.indexOf(win) === idx;
        });
}

/** From Gnome Shell: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/altTab.js#L53 */
export function getWindows(workspace?: Meta.Workspace): Meta.Window[] {
    if (!workspace) workspace = global.workspaceManager.get_active_workspace();
    // We ignore skip-taskbar windows in switchers, but if they are attached
    // to their parent, their position in the MRU list may be more appropriate
    // than the parent; so start with the complete list ...
    // ... map windows to their parent where appropriate ...
    return filterUnfocusableWindows(
        global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace),
    );
}

export function squaredEuclideanDistance(
    pointA: { x: number; y: number },
    pointB: { x: number; y: number },
) {
    return (
        (pointA.x - pointB.x) * (pointA.x - pointB.x) +
        (pointA.y - pointB.y) * (pointA.y - pointB.y)
    );
}
