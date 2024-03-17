import { Rectangle } from "@gi-types/meta10";
import Tile from "./Tile";

export default class TileUtils {
    static apply_props(tile: Tile, container: Rectangle): Rectangle {
        return new Rectangle({
            x: (container.width * tile.x) + container.x,
            y: (container.height * tile.y) + container.y,
            width: container.width * tile.width,
            height: container.height * tile.height,
        })
    }
}