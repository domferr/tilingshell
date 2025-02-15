import { Clutter } from '@gi.ext';
import { registerGObjectClass } from '@/utils/gjs';
import { buildRectangle } from '@utils/ui';
import Tile from '@components/layout/Tile';
import TilePreview, {
    TilePreviewConstructorProperties,
} from '@components/tilepreview/tilePreview';

@registerGObjectClass
export default class TilePreviewWithWindow extends TilePreview {
    constructor(params: Partial<TilePreviewConstructorProperties>) {
        super(params);
        if (params.parent) params.parent.add_child(this);

        this._showing = false;
        this._rect = params.rect || buildRectangle({});
        this._gaps = new Clutter.Margin();
        this.gaps = params.gaps || new Clutter.Margin();
        this._tile =
            params.tile ||
            new Tile({ x: 0, y: 0, width: 0, height: 0, groups: [] });
    }

    public override set gaps(gaps: Clutter.Margin) {
        this._gaps = gaps.copy();

        if (
            this._gaps.top === 0 &&
            this._gaps.bottom === 0 &&
            this._gaps.right === 0 &&
            this._gaps.left === 0
        )
            this.remove_style_class_name('custom-tile-preview');
        else this.add_style_class_name('custom-tile-preview');
    }

    public override _init() {
        super._init();
        this.remove_style_class_name('tile-preview');
    }
}
