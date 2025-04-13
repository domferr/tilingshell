import { GObject } from '@gi.shared'; // gi.shared because it is imported by Layout which is also imported in prefs.ts

export default class Tile {
    static $gtype = GObject.TYPE_JSOBJECT;

    x: number;
    y: number;
    width: number;
    height: number;
    groups: number[];

    constructor({
        x,
        y,
        width,
        height,
        groups,
    }: {
        x: number;
        y: number;
        width: number;
        height: number;
        groups: number[];
    }) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.groups = groups;
    }
}
