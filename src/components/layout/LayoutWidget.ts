import { Widget } from "@gi-types/st1";
import { TilePreview } from "../tilepreview/tilePreview";
import { Actor, Margin } from '@gi-types/clutter10';
import { Rectangle } from "@gi-types/meta10";
import { registerGObjectClass } from "@/utils/gjs";
import { buildTileMargin } from "@/utils/ui";
import { logger } from "@/utils/shell";
import { Layout } from "./Layout";
import { Tile } from "./Tile";

const debug = logger(`LayoutWidget`);

// A widget to draw layouts
@registerGObjectClass
export class LayoutWidget<TileType extends TilePreview> extends Widget {
    protected _previews: TileType[];
    protected _containerRect: Rectangle;
    protected _layout: Layout;
    protected _innerMargin: Margin;
    protected _outerMargin: Margin;

    constructor(parent: Actor | null, layout: Layout, innerMargin: Margin, outerMargin: Margin, containerRect: Rectangle, style_class: string = "") {
        super({ style_class });
        if (parent) parent.add_child(this);
        this._previews = [];
        this._containerRect = new Rectangle();
        this._layout = new Layout([]);
        this._innerMargin = new Margin();
        this._outerMargin = new Margin();
        this.relayout({ containerRect, layout, innerMargin, outerMargin });
    }

    protected draw_layout(): void {
        this._previews = this._layout.tiles.map(tile => {
            const tileRect = tile.apply_props(this._containerRect);
            const tileMargin = buildTileMargin(tileRect, this._innerMargin, this._outerMargin, this._containerRect);
            return this.buildTile(this, tileRect, tileMargin, tile);
        });
    }

    protected buildTile(parent: Actor, rect: Rectangle, margin: Margin, tile: Tile): TileType {
        throw("This class shouldn't be instantiated but be extended instead");
    }

    public relayout(params?: Partial<{
        layout: Layout,
        containerRect: Rectangle, 
        innerMargin: Margin, 
        outerMargin: Margin
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