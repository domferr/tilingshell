import { registerGObjectClass } from "@/utils/gjs";
import TilePreview from "../tilepreview/tilePreview";
import Tile from "../layout/Tile";
import Clutter from "@gi-types/clutter10";
import Meta from "@gi-types/meta10";

@registerGObjectClass
export default class SnapAssistTile extends TilePreview {
    protected _tile: Tile;

    constructor(params: {
        parent?: Clutter.Actor,
        rect?: Meta.Rectangle,
        gaps?: Clutter.Margin,
        tile: Tile
    }) {
        super({ parent: params.parent, rect: params.rect, gaps: params.gaps})
        this._tile = params.tile;
    }
    
    _init() {
        super._init();
        this.set_style_class_name('snap-assist-tile');
    }

    public get tile() {
        return this._tile;
    }
}