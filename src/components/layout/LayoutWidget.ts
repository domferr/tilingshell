import St from "gi://St";
import TilePreview from "../tilepreview/tilePreview";
import Clutter from 'gi://Clutter';
import Mtk from 'gi://Mtk';
import GObject from 'gi://GObject';
import { buildRectangle, buildTileMargin } from "@/utils/ui";
import { logger } from "@/utils/shell";
import Layout from "./Layout";
import Tile from "./Tile";
import TileUtils from "./TileUtils";
import { registerGObjectClass } from "@utils/gjs";

const debug = logger(`LayoutWidget`);

// A widget to draw a layout
@registerGObjectClass
export default class LayoutWidget<TileType extends TilePreview> extends St.Widget {
    protected _previews: TileType[];
    protected _containerRect: Mtk.Rectangle;
    protected _layout: Layout;
    protected _innerMargin: Clutter.Margin;
    protected _outerMargin: Clutter.Margin;

    constructor(parent: Clutter.Actor | null, layout: Layout, innerMargin: Clutter.Margin, outerMargin: Clutter.Margin, containerRect: Mtk.Rectangle, styleClass: string = "") {
        super({ styleClass });
        if (parent) parent.add_child(this);
        this._previews = [];
        this._containerRect = buildRectangle();
        this._layout = new Layout([], "");
        this._innerMargin = new Clutter.Margin();
        this._outerMargin = new Clutter.Margin();
        this.relayout({ containerRect, layout, innerMargin, outerMargin });
    }

    protected draw_layout(): void {
        this._previews = this._layout.tiles.map(tile => {
            const tileRect = TileUtils.apply_props(tile, this._containerRect);
            const tileMargin = buildTileMargin(tileRect, this._innerMargin, this._outerMargin, this._containerRect);
            return this.buildTile(this, tileRect, tileMargin, tile);
        });
    }

    protected buildTile(parent: Clutter.Actor, rect: Mtk.Rectangle, margin: Clutter.Margin, tile: Tile): TileType {
        throw("This class shouldn't be instantiated but it should be extended instead");
    }

    public relayout(params?: Partial<{
        layout: Layout,
        containerRect: Mtk.Rectangle, 
        innerMargin: Clutter.Margin, 
        outerMargin: Clutter.Margin
    }>) {
        var trigger_relayout = false;
        if (params?.innerMargin) {
            this._innerMargin = params.innerMargin.copy();
            trigger_relayout = true;
        }
        if (params?.outerMargin && this._outerMargin !== params.outerMargin) {
            this._outerMargin = params.outerMargin.copy();
            trigger_relayout = true;
        }
        if (params?.layout && this._layout !== params.layout) {
            this._layout = params.layout;
            trigger_relayout = true;
        }
        if (params?.containerRect && this._containerRect !== params.containerRect) {
            this._containerRect = params.containerRect.copy();
            trigger_relayout = true;
        }

        if (!trigger_relayout) {
            debug("relayout not needed");
            return;
        }

        this._previews?.forEach((preview) => preview.destroy());
        this.remove_all_children();
        this._previews = [];
        if (this._containerRect.width === 0 || this._containerRect.height === 0) return;

        this.draw_layout();
        this._previews.forEach((lay) => lay.open());
    }
}