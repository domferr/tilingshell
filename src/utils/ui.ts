import St from 'gi://St';
import Meta from 'gi://Meta';
import Clutter from "gi://Clutter";
import Mtk from "gi://Mtk";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Monitor } from 'resource:///org/gnome/shell/ui/layout.js';

export const getMonitors = (): Monitor[] => Main.layoutManager.monitors;

export const isPointInsideRect = (point: {x: number, y:number }, rect: Mtk.Rectangle) => {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
        point.y >= rect.y && point.y <= rect.y + rect.height;
}

export const positionRelativeTo = (actor: Clutter.Actor, anchestor: Clutter.Actor) : {x: number, y: number} | undefined => {
    if (!actor) return undefined;
    if (actor === anchestor) return {x:actor.x, y:actor.y};

    const parent = actor.get_parent();
    if (parent === null) return undefined;

    const parentPos = positionRelativeTo(parent, anchestor);
    if (!parentPos) return undefined;

    return {
        x: actor.x + parentPos.x,
        y: actor.y + parentPos.y,
    }
}

export const buildTileGaps = (tilePos: Mtk.Rectangle, innerGaps: Clutter.Margin, outerGaps: Clutter.Margin, container: Mtk.Rectangle, scalingFactor: number = 1): Clutter.Margin => {
    const isLeft = tilePos.x === container.x;
    const isTop = tilePos.y === container.y;
    const isRight = tilePos.x + tilePos.width === container.x + container.width;
    const isBottom = tilePos.y + tilePos.height === container.y + container.height;
    const margin = new Clutter.Margin();
    margin.top = (isTop ? outerGaps.top:innerGaps.top/2) * scalingFactor;
    margin.bottom = (isBottom ? outerGaps.bottom:innerGaps.bottom/2) * scalingFactor;
    margin.left = (isLeft ? outerGaps.left:innerGaps.left/2) * scalingFactor;
    margin.right = (isRight ? outerGaps.right:innerGaps.right/2) * scalingFactor;
    return margin;
}

export const getScalingFactor = (monitorIndex: number) => {
    const scalingFactor = St.ThemeContext.get_for_stage(global.get_stage()).get_scale_factor();
    if (scalingFactor === 1) return global.display.get_monitor_scale(monitorIndex);
    return scalingFactor;
}

export const getScalingFactorOf = (widget: St.Widget): [boolean, number] => {
    const [hasReference, scalingReference] = widget.get_theme_node().lookup_length('scaling-reference', true);
    // if the reference is missing, then the parent opted out of scaling the child
    if (!hasReference) return [true, 1];
    // if the scalingReference is not 1, then the scaling factor is already applied on styles (but not on width and height)

    const [hasValue, monitorScalingFactor] = widget.get_theme_node().lookup_length('monitor-scaling-factor', true);
    if (!hasValue) return [true, 1];

    return [scalingReference != 1, monitorScalingFactor / scalingReference];
}

export const enableScalingFactorSupport = (widget: St.Widget, monitorScalingFactor?: number) => {
    if (!monitorScalingFactor) return;
    widget.set_style(`scaling-reference: 1px; monitor-scaling-factor: ${monitorScalingFactor}px;`);
}

export function getWindowsOfMonitor(monitor: Monitor): Meta.Window[] {
    let windows = global.workspaceManager
        .get_active_workspace()
        .list_windows()
        .filter(win => win.get_window_type() === Meta.WindowType.NORMAL
                  && Main.layoutManager.monitors[win.get_monitor()] === monitor);
    return windows;
}

export function buildMarginOf(value: number): Clutter.Margin {
    const margin = new Clutter.Margin();
    margin.top = value;
    margin.bottom = value;
    margin.left = value;
    margin.right = value;
    return margin;
}

export function buildMargin(params: { top?: number, bottom?: number, left?: number, right?: number}): Clutter.Margin {
    const margin = new Clutter.Margin();
    if (params.top) margin.top = params.top;
    if (params.bottom) margin.bottom = params.bottom;
    if (params.left) margin.left = params.left;
    if (params.right) margin.right = params.right;
    return margin;
}

export function buildRectangle(params: { x?: number, y?: number, width?: number, height?: number} = {}): Mtk.Rectangle {
    //@ts-ignore todo
    return new Mtk.Rectangle({ x: params.x || 0, y: params.y || 0, width: params.width || 0, height: params.height || 0 });
}

export function getEventCoords(event: any): number[] {
    //@ts-ignore
    return event.get_coords ? event.get_coords():[event.x, event.y]; // GNOME 40-44
}