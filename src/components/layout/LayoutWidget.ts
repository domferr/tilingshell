import { registerGObjectClass } from '@utils/gjs';
import Clutter from 'gi://Clutter';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import { logger } from '@/utils/shell';
import { buildRectangle, buildTileGaps, enableScalingFactorSupport } from '@/utils/ui';

import TilePreview from '../tilepreview/tilePreview';
import Layout from './Layout';
import Tile from './Tile';
import TileUtils from './TileUtils';

const debug = logger('LayoutWidget');

// eslint-disable-next-line @typescript-eslint/no-namespace
export module LayoutWidget {
  export interface ConstructorProperties extends Partial<St.Widget.ConstructorProps> {
    parent: Clutter.Actor;
    layout: Layout;
    innerGaps: Clutter.Margin;
    outerGaps: Clutter.Margin;
    containerRect: Mtk.Rectangle;
    scalingFactor?: number;
  }
}

// A widget to draw a layout
@registerGObjectClass
export default class LayoutWidget<TileType extends TilePreview> extends St.Widget {
  protected _previews: TileType[];
  protected _containerRect: Mtk.Rectangle;
  protected _layout: Layout;
  protected _innerGaps: Clutter.Margin;
  protected _outerGaps: Clutter.Margin;

  constructor(params: LayoutWidget.ConstructorProperties) {
    super({ styleClass: params.styleClass || '' });
    params.parent.add_child(this);
    if (params.scalingFactor) this.scalingFactor = params.scalingFactor;

    this._previews = [];
    this._containerRect = params.containerRect || buildRectangle();
    this._layout = params.layout || new Layout([], '');
    this._innerGaps = params.innerGaps || new Clutter.Margin();
    this._outerGaps = params.outerGaps || new Clutter.Margin();
  }

  public set scalingFactor(value: number) {
    enableScalingFactorSupport(this, value);
  }

  public get innerGaps(): Clutter.Margin {
    return this._innerGaps.copy();
  }

  public get outerGaps(): Clutter.Margin {
    return this._outerGaps.copy();
  }

  protected draw_layout(): void {
    this._previews = this._layout.tiles.map((tile) => {
      const tileRect = TileUtils.apply_props(tile, this._containerRect);
      const tileMargin = buildTileGaps(tileRect, this._innerGaps, this._outerGaps, this._containerRect);
      return this.buildTile(this, tileRect, tileMargin, tile);
    });
  }

  protected buildTile(parent: Clutter.Actor, rect: Mtk.Rectangle, margin: Clutter.Margin, tile: Tile): TileType {
    throw "This class shouldn't be instantiated but it should be extended instead";
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
    if (params?.innerGaps) {
      this._innerGaps = params.innerGaps.copy();
      trigger_relayout = true;
    }
    if (params?.outerGaps && this._outerGaps !== params.outerGaps) {
      this._outerGaps = params.outerGaps.copy();
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
      debug('relayout not needed');
      return false;
    }

    this._previews?.forEach((preview) => {
      if (preview.get_parent() === this) {
        this.remove_child(preview);
      }
      preview.destroy();
    });
    this._previews = [];
    if (this._containerRect.width === 0 || this._containerRect.height === 0) return true;

    this.draw_layout();
    this._previews.forEach((lay) => lay.open());

    return true;
  }
}
