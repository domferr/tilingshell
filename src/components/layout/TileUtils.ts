import { Mtk } from '@gi.ext';
import Tile from './Tile';
import { buildRectangle } from '@utils/ui';

export default class TileUtils {
    static apply_props(tile: Tile, container: Mtk.Rectangle): Mtk.Rectangle {
        return buildRectangle({
            x: Math.round(container.width * tile.x + container.x),
            y: Math.round(container.height * tile.y + container.y),
            width: Math.round(container.width * tile.width),
            height: Math.round(container.height * tile.height),
        });
    }

    static build_tile(rect: Mtk.Rectangle, container: Mtk.Rectangle): Tile {
        return new Tile({
            x: (rect.x - container.x) / container.width,
            y: (rect.y - container.y) / container.height,
            width: rect.width / container.width,
            height: rect.height / container.height,
            groups: [],
        });
    }
}
