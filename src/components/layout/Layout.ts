import Tile from './Tile';

export default class Layout {
  id: string;
  tiles: Tile[];

  constructor(tiles: Tile[], id: string) {
    this.tiles = tiles;
    this.id = id;
  }
}
