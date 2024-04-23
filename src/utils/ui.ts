import St from 'gi://St';
import Meta from 'gi://Meta';
import Clutter from "gi://Clutter";
import Mtk from "gi://Mtk";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Monitor } from 'resource:///org/gnome/shell/ui/layout.js';

export const getMonitors = (): Monitor[] => Main.layoutManager.monitors;

export const addToStatusArea = (button: any, uuid: string) => {
    Main.panel.addToStatusArea(uuid, button, 1, 'right');
};

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

export const getGlobalPosition = (actor: Clutter.Actor) : {x: number, y: number} => {
    if (!actor) return {x:0, y:0};

    const parent = actor.get_parent();
    const parentPos = parent === null ? {x:0, y:0}:getGlobalPosition(parent);

    return {
        x: actor.x + parentPos.x,
        y: actor.y + parentPos.y,
    }
}

export const buildTileMargin = (tilePos: Mtk.Rectangle, innerMargin: Clutter.Margin, outerMargin: Clutter.Margin, containerRect: Mtk.Rectangle): Clutter.Margin => {
    const isLeft = tilePos.x === containerRect.x;
    const isTop = tilePos.y === containerRect.y;
    const isRight = tilePos.x + tilePos.width === containerRect.x + containerRect.width;
    const isBottom = tilePos.y + tilePos.height === containerRect.y + containerRect.height;
    const margin = new Clutter.Margin();
    margin.top = isTop ? outerMargin.top:innerMargin.top/2;
    margin.bottom = isBottom ? outerMargin.bottom:innerMargin.bottom/2;
    margin.left = isLeft ? outerMargin.left:innerMargin.left/2;
    margin.right = isRight ? outerMargin.right:innerMargin.right/2;
    return margin;
}

export const getScalingFactor = (monitorIndex: number) => {
    const scalingFactor = St.ThemeContext.get_for_stage(global.get_stage()).get_scale_factor();
    if (scalingFactor === 1) return global.display.get_monitor_scale(monitorIndex);
    return scalingFactor;
}

export const getStyleScalingFactor = (monitorIndex: number) => {
    if (Main.layoutManager.monitors.length == 1) return 1;

    return getScalingFactor(monitorIndex);
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