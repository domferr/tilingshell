import { logger } from '@utils/shell';
import { getScalingFactorOf } from '@utils/ui';
import Clutter from 'gi://Clutter';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import { registerGObjectClass } from '@/utils/gjs';

import Tile from '../layout/Tile';
import TilePreview from '../tilepreview/tilePreview';

const debug = logger('SnapAssistTile');

@registerGObjectClass
export default class SnapAssistTile extends TilePreview {
  protected _tile: Tile;
  private _styleChangedSignalID: number | undefined;

  constructor(params: { parent?: Clutter.Actor; rect?: Mtk.Rectangle; gaps?: Clutter.Margin; tile: Tile }) {
    super({ parent: params.parent, rect: params.rect, gaps: params.gaps });
    this._tile = params.tile;

    const isLeft = this._tile.x <= 0.001;
    const isTop = this._tile.y <= 0.001;
    const isRight = this._tile.x + this._tile.width >= 0.99;
    const isBottom = this._tile.y + this._tile.height >= 0.99;

    const [alreadyScaled, scalingFactor] = getScalingFactorOf(this);
    // the value got is already scaled if the tile is on primary monitor
    const radiusValue =
      (alreadyScaled ? 1 : scalingFactor) *
      (this.get_theme_node().get_length('border-radius-value') / (alreadyScaled ? scalingFactor : 1));
    // top-left top-right bottom-right bottom-left
    const radius = [2, 2, 2, 2];
    if (isTop && isLeft) radius[St.Corner.TOPLEFT] = radiusValue;
    if (isTop && isRight) radius[St.Corner.TOPRIGHT] = radiusValue;
    if (isBottom && isRight) radius[St.Corner.BOTTOMRIGHT] = radiusValue;
    if (isBottom && isLeft) radius[St.Corner.BOTTOMLEFT] = radiusValue;
    // the border radius value set will be scaled if the tile is on primary monitor
    this.set_style(`
            border-radius: ${radius[St.Corner.TOPLEFT]}px ${radius[St.Corner.TOPRIGHT]}px ${radius[St.Corner.BOTTOMRIGHT]}px ${radius[St.Corner.BOTTOMLEFT]}px;`);

    this._applyStyle();
    this._styleChangedSignalID = St.ThemeContext.get_for_stage(global.get_stage()).connect('changed', () => {
      this._applyStyle();
    });
    this.connect('destroy', () => this.onDestroy());
  }

  _init() {
    super._init();
    this.set_style_class_name('snap-assist-tile button');
  }

  public get tile() {
    return this._tile;
  }

  _applyStyle() {
    // the tile will be light or dark, following the text color
    const [hasColor, { red, green, blue, alpha }] = this.get_theme_node().lookup_color('color', true);
    if (!hasColor) return;
    // if the text color is light, apply light theme, otherwise apply dark theme
    if (red * 0.299 + green * 0.587 + blue * 0.114 > 186) {
      // apply light theme (which is the default, e.g. remove dark theme)
      this.remove_style_class_name('dark');
    } else {
      // apply dark theme
      this.add_style_class_name('dark');
    }
  }

  onDestroy(): void {
    if (this._styleChangedSignalID) {
      St.ThemeContext.get_for_stage(global.get_stage()).disconnect(this._styleChangedSignalID);
      this._styleChangedSignalID = undefined;
    }
  }
}
