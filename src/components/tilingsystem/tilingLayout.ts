import Meta from 'gi://Meta';
import { logger } from "@/utils/shell";
import { registerGObjectClass } from "@/utils/gjs";
import Mtk from 'gi://Mtk';
import Clutter from 'gi://Clutter';
import BlurTilePreview from '../tilepreview/blurTilePreview';
import TilePreview, { WINDOW_ANIMATION_TIME } from '../tilepreview/tilePreview';
import LayoutWidget from '../layout/LayoutWidget';
import Layout from '../layout/Layout';
import Tile from '../layout/Tile';

const debug = logger('tilingLayout');

/**
 * A TilingLayout is a group of multiple tile previews. By aggregating all of them,
 * it is possible to easily show and hide each tile at the same time and to get the
 * hovered tile.
 */
@registerGObjectClass
export default class TilingLayout extends LayoutWidget<TilePreview> {
    private readonly _blur = false;
    
    private _showing: boolean;
    private _hoveredTiles: TilePreview[];

    constructor(layout: Layout, innerGaps: Clutter.Margin, outerGaps: Clutter.Margin, workarea: Mtk.Rectangle, scalingFactor?: number) {
        super({
            containerRect: workarea,
            parent: global.windowGroup,
            layout,
            innerGaps,
            outerGaps,
            scalingFactor
        });
        this._showing = false;
        this._hoveredTiles = [];
        super.relayout();
    }

    _init() {
        super._init();
        this.hide();
    }

    protected buildTile(parent: Clutter.Actor, rect: Mtk.Rectangle, gaps: Clutter.Margin, tile: Tile): TilePreview {
        return this._blur ? new BlurTilePreview({ parent, rect, gaps }):new TilePreview({ parent, rect, gaps });
    }

    public get showing(): boolean {
        return this._showing;
    }

    public openBelow(window: Meta.Window) {
        if (this._showing) return;
        
        let windowActor = window.get_compositor_private();
        if (!windowActor)
            return;

        global.windowGroup.set_child_below_sibling(this, windowActor as any);
        this.open();
    }

    public openAbove(window: Meta.Window) {
        if (this._showing) return;

        let windowActor = window.get_compositor_private();
        if (!windowActor)
            return;

        global.windowGroup.set_child_above_sibling(this, windowActor as any);
        this.open();
    }

    public open() {
        if (this._showing) return;
        
        this.show();
        this._showing = true;
        // @ts-ignore
        this.ease({
            x: this.x,
            y: this.y,
            opacity: 255,
            duration: WINDOW_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    public close() {
        if (!this._showing) return;
        
        this._showing = false;
        // @ts-ignore
        this.ease({
            opacity: 0,
            duration: WINDOW_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.unhoverAllTiles();
                this.hide();
            }
        });
    }

    public getTileBelow(currPointerPos: { x: number; y: number }) : Mtk.Rectangle | undefined {
        for (let i = 0; i < this._previews.length; i++) {
            let preview = this._previews[i];
            const isHovering = currPointerPos.x >= preview.x && currPointerPos.x <= preview.x + preview.width
                && currPointerPos.y >= preview.y && currPointerPos.y <= preview.y + preview.height;
            if (isHovering) return preview.rect;
        }
        return undefined;
    }

    public unhoverAllTiles() {
        this._hoveredTiles.forEach(prev => prev.open());
        this._hoveredTiles = [];
    }

    public hoverTilesInRect(rect: Mtk.Rectangle) {
        this._hoveredTiles = [];
        this._previews.forEach(preview => {
            const [isInside, _] = rect.intersect(preview.rect);
            if (isInside) {
                preview.close();
                this._hoveredTiles.push(preview);
            } else {
                preview.open();
            }
        });
    }
}