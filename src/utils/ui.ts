import { Global } from '@gi-types/shell0';
import { getCurrentExtension } from '@/utils/shell';
import Meta from "@gi-types/meta10";
import { Actor, Margin } from "@gi-types/clutter10";
import { ThemeContext } from '@gi-types/st1';

export const global = Global.get();
export const Main = imports.ui.main;

export const getMonitors = (): Monitor[] => imports.ui.main.layoutManager.monitors;

export const addToStatusArea = (button: any) => {
    imports.ui.main.panel.addToStatusArea(getCurrentExtension().metadata.uuid, button, 1, 'right');
};

export const isPointInsideRect = (point: {x: number, y:number }, rect: Meta.Rectangle) => {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
        point.y >= rect.y && point.y <= rect.y + rect.height;
}

export const positionRelativeTo = (actor: Actor, anchestor: Actor) : {x: number, y: number} | undefined => {
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

export const getGlobalPosition = (actor: Actor) : {x: number, y: number} => {
    if (!actor) return {x:0, y:0};

    const parent = actor.get_parent();
    const parentPos = parent === null ? {x:0, y:0}:getGlobalPosition(parent);

    return {
        x: actor.x + parentPos.x,
        y: actor.y + parentPos.y,
    }
}

export const buildTileMargin = (tilePos: Meta.Rectangle, innerMargin: Margin, outerMargin: Margin, containerRect: Meta.Rectangle): Margin => {
    const isLeft = tilePos.x === containerRect.x;
    const isTop = tilePos.y === containerRect.y;
    const isRight = tilePos.x + tilePos.width === containerRect.x + containerRect.width;
    const isBottom = tilePos.y + tilePos.height === containerRect.y + containerRect.height;
    return new Margin({
        top: isTop ? outerMargin.top:innerMargin.top/2,
        bottom: isBottom ? outerMargin.bottom:innerMargin.bottom/2,
        left: isLeft ? outerMargin.left:innerMargin.left/2,
        right: isRight ? outerMargin.right:innerMargin.right/2,
    })
}

export const getScalingFactor = (monitorIndex: number) => {
    const scalingFactor = ThemeContext.get_for_stage(global.get_stage()).get_scale_factor();
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