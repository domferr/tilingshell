import {Rectangle, Window} from '@gi-types/meta10';
import {logger} from "@/utils/shell";
import {TileGroup} from "@/components/tileGroup";
import {registerGObjectClass} from "@/utils/gjs";
import {global} from "@/utils/ui";
import { Actor, AnimationMode, ContentPrototype, LayoutManager, Margin } from '@gi-types/clutter10';
import { BlurTilePreview } from './tilepreview/blurTilePreview';
import { TilePreview, WINDOW_ANIMATION_TIME } from './tilepreview/tilePreview';
import { LayoutWidget } from './layout/LayoutWidget';

const debug = logger('tilingLayout');

/**
 * A TilingLayout is a group of multiple tile previews. By aggregating all of them,
 * it is possible to easily show and hide each tile at the same time and to get the
 * hovered tile.
 */
@registerGObjectClass
export class TilingLayout extends LayoutWidget<TilePreview> {
    private readonly _blur = false;
    
    private _showing: boolean;

    constructor(layout: TileGroup, innerMargin: Margin, outerMargin: Margin, workarea: Rectangle) {
        super(global.window_group, layout, innerMargin, outerMargin, workarea);
    }

    _init() {
        super._init();
        this.hide();
        this._showing = false;
    }

    protected buildTile(parent: Actor, rect: Rectangle, margin: Margin): TilePreview {
        return this._blur ? new BlurTilePreview(parent, rect, margin):new TilePreview(parent, rect, margin);
    }

    public get showing(): boolean {
        return this._showing;
    }

    public openBelow(window: Window) {
        let windowActor = window.get_compositor_private();
        if (!windowActor)
            return;

        global.window_group.set_child_below_sibling(this, windowActor as any);
        this.open();
    }

    public openAbove(window: Window) {
        let windowActor = window.get_compositor_private();
        if (!windowActor)
            return;

        global.window_group.set_child_above_sibling(this, windowActor as any);
        this.open();
    }

    public open() {
        this.show();
        this._showing = true;
        // @ts-ignore
        this.ease({
            x: this.x,
            y: this.y,
            opacity: 255,
            duration: WINDOW_ANIMATION_TIME,
            mode: AnimationMode.EASE_OUT_QUAD,
        });
    }

    public close() {
        this._showing = false;
        // @ts-ignore
        this.ease({
            opacity: 0,
            duration: WINDOW_ANIMATION_TIME,
            mode: AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.hide(),
        });
    }

    public getTileBelow(currPointerPos: { x: number; y: number }) : TilePreview | undefined {
        for (let i = 0; i < this._previews.length; i++) {
            let preview = this._previews[i];
            const isHovering = currPointerPos.x >= preview.x && currPointerPos.x <= preview.x + preview.width
                && currPointerPos.y >= preview.y && currPointerPos.y <= preview.y + preview.height;
            if (isHovering) return preview;
        }
    }
}