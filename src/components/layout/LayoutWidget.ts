import { Widget } from "@gi-types/st1";
import { TilePreview } from "../tilepreview/tilePreview";
import { Actor, Margin } from '@gi-types/clutter10';
import { TileGroup } from "../tileGroup";
import { Rectangle } from "@gi-types/meta10";
import { registerGObjectClass } from "@/utils/gjs";
import { buildTileMargin } from "@/utils/ui";
import { logger } from "@/utils/shell";

const debug = logger(`LayoutWidget`);

// A widget to draw layouts
@registerGObjectClass
export class LayoutWidget<TileType extends TilePreview> extends Widget {
    protected _previews: TileType[];
    protected _containerRect: Rectangle;
    protected _layout: TileGroup;
    protected _innerMargin: Margin;
    protected _outerMargin: Margin;

    constructor(parent: Actor | null, layout: TileGroup, innerMargin: Margin, outerMargin: Margin, containerRect: Rectangle, style_class: string = "") {
        super({ style_class });
        if (parent) parent.add_child(this);
        this._previews = [];
        this._containerRect = new Rectangle();
        this._layout = new TileGroup({tiles: []});
        this._innerMargin = new Margin();
        this._outerMargin = new Margin();
        this.relayout({ containerRect, layout, innerMargin, outerMargin });
    }

    protected build_layout(groupRect: Rectangle, group: TileGroup, previews: TileType[], innerMargin: Margin, outerMargin: Margin, containerRect: Rectangle): TileType[] {
        if (group.tiles.length == 0) {
            const tileMargin = buildTileMargin(groupRect, innerMargin, outerMargin, containerRect);
            const tile = this.buildTile(this, groupRect.copy(), tileMargin);    
            previews.push(tile);
            return previews;
        }

        const workingRect = groupRect.copy();

        group.tiles.forEach((innerGroup, index) => {
            let innerGroupRect = new Rectangle({
                x: workingRect.x,
                y: workingRect.y,
                width: group.horizontal ? groupRect.width * innerGroup.perc:groupRect.width,
                height: group.horizontal ? groupRect.height:groupRect.height * innerGroup.perc,
            });
            // if there is remaining width or height, then we have lost some pixel because of
            // floating point precision. Ensure the remaining width or height is given to the last tile
            if (index === group.tiles.length - 1) {
                // ensure we don't go beyond the limits and ensure the remaining 
                // width or height is given to the last tile
                innerGroupRect.width = groupRect.x + groupRect.width - innerGroupRect.x;
                innerGroupRect.height = groupRect.y + groupRect.height - innerGroupRect.y;
            }
            this.build_layout(innerGroupRect, innerGroup, previews, innerMargin, outerMargin, containerRect);
            workingRect.x += group.horizontal ? innerGroupRect.width:0;
            workingRect.y += group.horizontal ? 0:innerGroupRect.height;
        })

        return previews;
    }

    protected buildTile(parent: Actor, rect: Rectangle, margin: Margin): TileType {
        throw("This class shouldn't be instantiated but be extended instead");
    }

    public relayout(params?: Partial<{
        layout: TileGroup,
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

        this._previews = this.build_layout(
            this._containerRect, 
            this._layout, 
            [], 
            this._innerMargin, 
            this._outerMargin,
            this._containerRect
        );
        this._previews.forEach((lay) => lay.open());
    }
}