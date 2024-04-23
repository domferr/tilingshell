import { registerGObjectClass } from "@/utils/gjs";
import TilePreview from "../tilepreview/tilePreview";
import Tile from "../layout/Tile";
import Clutter from "gi://Clutter";
import Mtk from 'gi://Mtk';
import St from 'gi://St';

@registerGObjectClass
export default class SnapAssistTile extends TilePreview {
    protected _tile: Tile;

    constructor(params: {
        parent?: Clutter.Actor,
        rect?: Mtk.Rectangle,
        gaps?: Clutter.Margin,
        tile: Tile
    }) {
        super({ parent: params.parent, rect: params.rect, gaps: params.gaps });
        this._tile = params.tile;

        const isLeft = this._tile.x <= 0.001;
        const isTop = this._tile.y <= 0.001;
        const isRight = this._tile.x + this._tile.width >= 0.99;
        const isBottom = this._tile.y + this._tile.height >= 0.99;
        
        // top-left top-right bottom-right bottom-left
        const radiusValue = this.get_theme_node().get_length('border-radius-value');
        const radius = [0, 0, 0, 0];
        if (isTop && isLeft) radius[St.Corner.TOPLEFT] = radiusValue;
        if (isTop && isRight) radius[St.Corner.TOPRIGHT] = radiusValue;
        if (isBottom && isRight) radius[St.Corner.BOTTOMRIGHT] = radiusValue;
        if (isBottom && isLeft) radius[St.Corner.BOTTOMLEFT] = radiusValue;
        this.set_style(`border-radius: ${radius[St.Corner.TOPLEFT]}px ${radius[St.Corner.TOPRIGHT]}px ${radius[St.Corner.BOTTOMRIGHT]}px ${radius[St.Corner.BOTTOMLEFT]}px;`);
    }
    
    _init() {
        super._init();
        this.set_style_class_name('snap-assist-tile');
    }

    public get tile() {
        return this._tile;
    }
}