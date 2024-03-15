import { Tile } from "./Tile";

export class Layout {
    tiles: Tile[];

    constructor(tiles: Tile[]) {
        this.tiles = tiles;
    }
}