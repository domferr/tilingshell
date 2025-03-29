import { registerGObjectClass } from '@/utils/gjs';
import TilePreview from '../tilepreview/tilePreview';
import Tile from '../layout/Tile';
import { St, Clutter, Mtk } from '@gi.ext';
import { getScalingFactorOf } from '@utils/ui';
import { logger } from '@utils/logger';

const debug = logger('SnapAssistTile');

const MIN_RADIUS = 2;

/**
 * SnapAssistTile
 *
 * This class represents a visual preview of a tile in the snap assist feature.
 * It extends TilePreview and provides styling logic to adjust the border radius,
 * border width, and theme colors dynamically.
 *
 * Features:
 * - Determines whether the tile is positioned at the edges of the screen or near
 *   another tile and adjusts border radius and widths accordingly.
 * - Computes the appropriate scaling factor for styling based on display scaling.
 * - Adjusts the theme between light and dark based on text color contrast.
 * - Listens for theme changes and updates styles dynamically.
 */
@registerGObjectClass
export default class SnapAssistTile extends TilePreview {
    private _styleChangedSignalID: number | undefined;

    constructor(params: {
        parent?: Clutter.Actor;
        rect?: Mtk.Rectangle;
        gaps?: Clutter.Margin;
        tile: Tile;
    }) {
        super({
            parent: params.parent,
            rect: params.rect,
            gaps: params.gaps,
            tile: params.tile,
        });

        const isLeft = this._tile.x <= 0.001;
        const isTop = this._tile.y <= 0.001;
        const isRight = this._tile.x + this._tile.width >= 0.99;
        const isBottom = this._tile.y + this._tile.height >= 0.99;

        const [alreadyScaled, scalingFactor] = getScalingFactorOf(this);
        // the value got is already scaled if the tile is on primary monitor
        const radiusValue =
            (alreadyScaled ? 1 : scalingFactor) *
            (this.get_theme_node().get_length('border-radius-value') /
                (alreadyScaled ? scalingFactor : 1));
        const borderWidthValue =
            (alreadyScaled ? 1 : scalingFactor) *
            (this.get_theme_node().get_length('border-width-value') /
                (alreadyScaled ? scalingFactor : 1));
        // top-left top-right bottom-right bottom-left
        const radius = [
            this._gaps.top === 0 && this._gaps.left === 0 ? 0 : MIN_RADIUS,
            this._gaps.top === 0 && this._gaps.right === 0 ? 0 : MIN_RADIUS,
            this._gaps.bottom === 0 && this._gaps.right === 0 ? 0 : MIN_RADIUS,
            this._gaps.bottom === 0 && this._gaps.left === 0 ? 0 : MIN_RADIUS,
        ];
        if (isTop && isLeft) radius[St.Corner.TOPLEFT] = radiusValue;
        if (isTop && isRight) radius[St.Corner.TOPRIGHT] = radiusValue;
        if (isBottom && isRight) radius[St.Corner.BOTTOMRIGHT] = radiusValue;
        if (isBottom && isLeft) radius[St.Corner.BOTTOMLEFT] = radiusValue;

        // Without gaps, two borders of two near tiles may
        // look like the border width is double the size.
        // The initial width takes into account there are no gaps,
        // tiles are very near, so the width is half the final one.
        const borderWidth = [
            borderWidthValue,
            borderWidthValue,
            borderWidthValue,
            borderWidthValue,
        ];
        // we double the width if the tile NOT alone another tile. In case the width is a floating value (like 0.5) it will be
        // equal to 1 and two near tiles will appear with a border of a total of 2. In case of top and right borders we floor the
        // value for example from 0.5 to 0, to keep consistency since the near tile will NOT floor the value on the oppisite side
        if (isTop || this._gaps.top > 0) borderWidth[St.Side.TOP] *= 2;
        else borderWidth[St.Side.TOP] = Math.floor(borderWidth[St.Side.TOP]);
        if (isRight || this._gaps.right > 0) borderWidth[St.Side.RIGHT] *= 2;
        else
            borderWidth[St.Side.RIGHT] = Math.floor(borderWidth[St.Side.RIGHT]);
        if (isBottom || this._gaps.bottom > 0) borderWidth[St.Side.BOTTOM] *= 2;
        if (isLeft || this._gaps.left > 0) borderWidth[St.Side.LEFT] *= 2;

        // the border radius and width values set will be scaled if the tile is on primary monitor
        this.set_style(`
            border-radius: ${radius[St.Corner.TOPLEFT]}px ${radius[St.Corner.TOPRIGHT]}px ${radius[St.Corner.BOTTOMRIGHT]}px ${radius[St.Corner.BOTTOMLEFT]}px;
            border-top-width: ${borderWidth[St.Side.TOP]}px;
            border-right-width: ${borderWidth[St.Side.RIGHT]}px;
            border-bottom-width: ${borderWidth[St.Side.BOTTOM]}px;
            border-left-width: ${borderWidth[St.Side.LEFT]}px;`);

        this._applyStyle();
        this._styleChangedSignalID = St.ThemeContext.get_for_stage(
            global.get_stage(),
        ).connect('changed', () => {
            this._applyStyle();
        });
        this.connect('destroy', () => this.onDestroy());
    }

    _init() {
        super._init();
        this.set_style_class_name('snap-assist-tile');
    }

    _applyStyle() {
        // the tile will be light or dark, following the text color
        const [hasColor, { red, green, blue }] =
            this.get_theme_node().lookup_color('color', true);
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
            St.ThemeContext.get_for_stage(global.get_stage()).disconnect(
                this._styleChangedSignalID,
            );
            this._styleChangedSignalID = undefined;
        }
    }
}
