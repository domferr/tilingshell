import { Widget } from "@gi-types/st1";
import { TilePreview } from "../tilepreview/tilePreview";
import { Actor, Margin } from '@gi-types/clutter10';
import { TileGroup } from "../tileGroup";
import { Rectangle } from "@gi-types/meta10";
import { registerGObjectClass } from "@/utils/gjs";

// A widget to draw layouts
@registerGObjectClass
export class LayoutWidget<TileType extends TilePreview> extends Widget {
    protected _previews: TileType[];

    constructor(parent: Actor | null, layout: TileGroup, margins: number, width: number, height: number, style_class: string = "") {
        super({ style_class });
        if (parent) parent.add_child(this);

        this._previews = this._tileGroupToSnapAssistTile(
            new Rectangle({height, width, x: 0, y: 0}),
            layout,
            [],
            new Margin({top: margins, bottom: margins, left: margins, right: margins})
        );
        this._previews.forEach((lay) => lay.open());
    }

    private _tileGroupToSnapAssistTile(groupRect: Rectangle, group: TileGroup, previews: TileType[], margin: Margin): TileType[] {
        if (group.tiles.length == 0) {
            const tile = this.buildTile(this, groupRect, margin);    
            previews.push(tile);
            return previews;
        }

        let tmpGroupRect = new Rectangle({
            x: groupRect.x,
            y: groupRect.y,
        });

        group.tiles.forEach((innerGroup, index) => {
            let innerGroupRect = new Rectangle({
                x: tmpGroupRect.x,
                y: tmpGroupRect.y,
                width: group.horizontal ? groupRect.width * innerGroup.perc:groupRect.width,
                height: group.horizontal ? groupRect.height:groupRect.height * innerGroup.perc,
            });
            let innerGroupMargin = new Margin({
                top: margin.top,
                left: margin.left,
                right: margin.right,
                bottom: margin.bottom,
            });
            this._tileGroupToSnapAssistTile(innerGroupRect, innerGroup, previews, innerGroupMargin);
            tmpGroupRect.x = group.horizontal ? (tmpGroupRect.x+innerGroupRect.width):tmpGroupRect.x;
            tmpGroupRect.y = group.horizontal ? tmpGroupRect.y:(tmpGroupRect.y+innerGroupRect.height);
        })

        return previews;
    }

    protected buildTile(parent: Actor, rect: Rectangle, margin: Margin): TileType {
        throw("This class shouldn't be instantiated but be extended instead");
    }
}