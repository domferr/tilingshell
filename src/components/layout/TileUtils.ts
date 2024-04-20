import Meta from "@gi-types/meta10";
import Tile from "./Tile";

export default class TileUtils {
    static apply_props(tile: Tile, container: Meta.Rectangle): Meta.Rectangle {
        return new Meta.Rectangle({
            x: Math.round((container.width * tile.x) + container.x),
            y: Math.round((container.height * tile.y) + container.y),
            width: Math.round(container.width * tile.width),
            height: Math.round(container.height * tile.height),
        });
    }

    static build_tile(rect: Meta.Rectangle, container: Meta.Rectangle): Tile {
        return new Tile({
            x: (rect.x - container.x) / container.width,
            y: (rect.y - container.y) / container.height,
            width: rect.width / container.width,
            height: rect.height / container.height,
            groups: []
        });
    }
}