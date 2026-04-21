import Tile from './Tile';

export interface MinimumResolution {
    width: number;
    height: number;
}

export default class Layout {
    id: string;
    tiles: Tile[];
    minimumMonitorResolution?: MinimumResolution;

    constructor(
        tiles: Tile[],
        id: string,
        minimumMonitorResolution?: MinimumResolution,
    ) {
        this.tiles = tiles;
        this.id = id;
        this.minimumMonitorResolution = minimumMonitorResolution;
    }
}
