import { St, Clutter, Mtk } from '@gi.ext';
import TilePreview from '../tilepreview/tilePreview';
import {
    buildRectangle,
    buildTileGaps,
    enableScalingFactorSupport,
} from '@/utils/ui';
import { logger } from '@utils/logger';
import Layout from './Layout';
import Tile from './Tile';
import TileUtils from './TileUtils';
import { registerGObjectClass } from '@utils/gjs';

const debug = logger('LayoutWidget');

// export module LayoutWidget {
export interface LayoutWidgetConstructorProperties
    extends Partial<St.Widget.ConstructorProps> {
    parent?: Clutter.Actor;
    layout: Layout;
    innerGaps: Clutter.Margin;
    outerGaps: Clutter.Margin;
    containerRect?: Mtk.Rectangle;
    scalingFactor?: number;
}
// }

// A widget to draw a layout
@registerGObjectClass
export default class LayoutWidget<
    TileType extends TilePreview,
> extends St.Widget {
    protected _previews: TileType[];
    protected _containerRect: Mtk.Rectangle;
    protected _layout: Layout;
    protected _innerGaps: Clutter.Margin;
    protected _outerGaps: Clutter.Margin;
    protected _scalingFactor: number;

    constructor(params: LayoutWidgetConstructorProperties) {
        super({ styleClass: params.styleClass || '' });
        if (params.parent) params.parent.add_child(this);
        this._scalingFactor = 1;
        if (params.scalingFactor) this.scalingFactor = params.scalingFactor;

        this._previews = [];
        this._containerRect = params.containerRect || buildRectangle();
        this._layout = params.layout || new Layout([], '');
        this._innerGaps = params.innerGaps || new Clutter.Margin();
        this._outerGaps = params.outerGaps || new Clutter.Margin();
    }

    public set scalingFactor(value: number) {
        enableScalingFactorSupport(this, value);
        this._scalingFactor = value;
    }

    public get scalingFactor(): number {
        return this._scalingFactor;
    }

    public get innerGaps(): Clutter.Margin {
        return this._innerGaps.copy();
    }

    public get outerGaps(): Clutter.Margin {
        return this._outerGaps.copy();
    }

    public get layout(): Layout {
        return this._layout;
    }

    protected draw_layout(): void {
        const containerWithoutOuterGaps = buildRectangle({
            x: this._outerGaps.left + this._containerRect.x,
            y: this._outerGaps.top + this._containerRect.y,
            width:
                this._containerRect.width -
                this._outerGaps.left -
                this._outerGaps.right,
            height:
                this._containerRect.height -
                this._outerGaps.top -
                this._outerGaps.bottom,
        });
        this._previews = this._layout.tiles.map((tile) => {
            const tileRect = TileUtils.apply_props(
                tile,
                containerWithoutOuterGaps,
            );
            const { gaps, isTop, isRight, isBottom, isLeft } = buildTileGaps(
                tileRect,
                this._innerGaps,
                this._outerGaps,
                containerWithoutOuterGaps,
            );

            if (isTop) {
                tileRect.height += this._outerGaps.top;
                tileRect.y -= this._outerGaps.top;
            }
            if (isLeft) {
                tileRect.width += this._outerGaps.left;
                tileRect.x -= this._outerGaps.left;
            }
            if (isRight) tileRect.width += this._outerGaps.right;

            if (isBottom) tileRect.height += this._outerGaps.bottom;

            return this.buildTile(this, tileRect, gaps, tile);
        });
    }

    protected buildTile(
        _parent: Clutter.Actor,
        _rect: Mtk.Rectangle,
        _margin: Clutter.Margin,
        _tile: Tile,
    ): TileType {
        throw new Error(
            "This class shouldn't be instantiated but it should be extended instead",
        );
    }

    public relayout(
        params?: Partial<{
            layout: Layout;
            containerRect: Mtk.Rectangle;
            innerGaps: Clutter.Margin;
            outerGaps: Clutter.Margin;
        }>,
    ): boolean {
        let trigger_relayout = this._previews.length === 0;
        if (params?.layout && this._layout !== params.layout) {
            this._layout = params.layout;
            trigger_relayout = true;
        }
        if (params?.innerGaps) {
            trigger_relayout ||= !this._areGapsEqual(
                this._innerGaps,
                params.innerGaps,
            );
            this._innerGaps = params.innerGaps.copy();
        }
        if (params?.outerGaps && this._outerGaps !== params.outerGaps) {
            trigger_relayout ||= !this._areGapsEqual(
                this._outerGaps,
                params.outerGaps,
            );
            this._outerGaps = params.outerGaps.copy();
        }
        if (
            params?.containerRect &&
            !this._containerRect.equal(params.containerRect)
        ) {
            this._containerRect = params.containerRect.copy();
            trigger_relayout = true;
        }

        if (!trigger_relayout) {
            debug('relayout not needed');
            return false;
        }

        this._previews?.forEach((preview) => {
            if (preview.get_parent() === this) this.remove_child(preview);

            preview.destroy();
        });
        this._previews = [];
        if (this._containerRect.width === 0 || this._containerRect.height === 0)
            return true;

        this.draw_layout();
        this._previews.forEach((lay) => lay.open());

        return true;
    }

    private _areGapsEqual(
        first: Clutter.Margin,
        second: Clutter.Margin,
    ): boolean {
        return (
            first.bottom === second.bottom &&
            first.top === second.top &&
            first.left === second.left &&
            first.right === second.right
        );
    }
}
