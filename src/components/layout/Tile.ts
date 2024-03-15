import { Rectangle } from "@gi-types/meta10";
import GObject from "@gi-types/gobject2";

export class Tile {
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

    public apply_props(container: Rectangle): Rectangle {
        return new Rectangle({
            x: (container.width * this.x) + container.x,
            y: (container.height * this.y) + container.y,
            width: container.width * this.width,
            height: container.height * this.height,
        })
    }
}