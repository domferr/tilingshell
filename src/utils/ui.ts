import { Global } from '@gi-types/shell0';
import { getCurrentExtension, logger } from '@/utils/shell';
import { Rectangle } from "@gi-types/meta10";
import { Actor, Margin } from "@gi-types/clutter10";

export const global = Global.get();
export const Main = imports.ui.main;

export const getMonitors = (): Monitor[] => imports.ui.main.layoutManager.monitors;

export const addToStatusArea = (button: any) => {
    imports.ui.main.panel.addToStatusArea(getCurrentExtension().metadata.uuid, button, 1, 'right');
};

export const isPointInsideRect = (point: {x: number, y:number }, rect: Rectangle) => {
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

export const buildTileMargin = (tilePos: Rectangle, innerMargin: Margin, outerMargin: Margin, containerRect: Rectangle): Margin => {
    const isLeft = tilePos.x === containerRect.x;
    const isTop = tilePos.y === containerRect.y;
    const isRight = tilePos.x + tilePos.width === containerRect.x + containerRect.width;
    const isBottom = tilePos.y + tilePos.height === containerRect.y + containerRect.height;
    logger("buildTileMargin")(`isLeft: ${isLeft}, isTop: ${isTop}, isRight: ${isRight}, isBottom: ${isBottom}`);
    logger("buildTileMargin")(`tilePos.x: ${tilePos.x}, tilePos.y: ${tilePos.y}, tilePos.width: ${tilePos.width}, tilePos.height: ${tilePos.height}`);
    logger("buildTileMargin")(`maxWidth: ${containerRect.width}, maxHeight: ${containerRect.height}`);
    return new Margin({
        top: isTop ? outerMargin.top:innerMargin.top/2,
        bottom: isBottom ? outerMargin.bottom:innerMargin.bottom/2,
        left: isLeft ? outerMargin.left:innerMargin.left/2,
        right: isRight ? outerMargin.right:innerMargin.right/2,
    })
}