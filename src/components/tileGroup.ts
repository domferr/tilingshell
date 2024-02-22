export class TileGroup {
    public perc: number;
    public horizontal: boolean;
    public tiles: TileGroup[];

    constructor({ tiles = [] as TileGroup[], perc = 1.0, horizontal = true }) {
        this.perc = perc;
        this.horizontal = horizontal;
        this.tiles = tiles;
    }
}