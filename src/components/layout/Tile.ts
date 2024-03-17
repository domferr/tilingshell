import GObject from "@gi-types/gobject2";

export default class Tile {
    static $gtype = GObject.TYPE_JSOBJECT;
    
    x: number;
    y: number;
    width: number;
    height: number;

    constructor({x, y, width, height}:{ x: number, y: number, width: number, height: number }) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
}