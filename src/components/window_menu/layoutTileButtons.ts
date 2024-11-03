import Layout from '@components/layout/Layout';
import LayoutWidget from '@components/layout/LayoutWidget';
import { registerGObjectClass } from '@utils/gjs';
import { buildMarginOf, buildRectangle, getScalingFactorOf } from '@utils/ui';
import { Clutter, Mtk } from '@gi.ext';
import SnapAssistTileButton from '../snapassist/snapAssistTileButton';
import Tile from '@components/layout/Tile';

@registerGObjectClass
export default class LayoutTileButtons extends LayoutWidget<SnapAssistTileButton> {
    constructor(
        parent: Clutter.Actor,
        layout: Layout,
        gapSize: number,
        height: number,
        width: number,
    ) {
        super({
            parent,
            layout,
            containerRect: buildRectangle(),
            innerGaps: buildMarginOf(gapSize),
            outerGaps: new Clutter.Margin(),
            styleClass: 'window-menu-layout',
        });

        const [, scalingFactor] = getScalingFactorOf(this);

        this.relayout({
            containerRect: buildRectangle({
                x: 0,
                y: 0,
                width: width * scalingFactor,
                height: height * scalingFactor,
            }),
        });
        this._fixFloatingPointErrors();
    }

    buildTile(
        parent: Clutter.Actor,
        rect: Mtk.Rectangle,
        gaps: Clutter.Margin,
        tile: Tile,
    ): SnapAssistTileButton {
        return new SnapAssistTileButton({ parent, rect, gaps, tile });
    }

    public get buttons(): SnapAssistTileButton[] {
        return this._previews;
    }

    private _fixFloatingPointErrors() {
        const xMap: Map<number, number> = new Map();
        const yMap: Map<number, number> = new Map();
        this._previews.forEach((prev) => {
            const tile = prev.tile;
            const newX = xMap.get(tile.x);
            if (!newX) xMap.set(tile.x, prev.rect.x);
            const newY = yMap.get(tile.y);
            if (!newY) yMap.set(tile.y, prev.rect.y);

            if (newX || newY) {
                prev.open(
                    false,
                    buildRectangle({
                        x: newX ?? prev.rect.x,
                        y: newY ?? prev.rect.y,
                        width: prev.rect.width,
                        height: prev.rect.height,
                    }),
                );
            }
            xMap.set(
                tile.x + tile.width,
                xMap.get(tile.x + tile.width) ?? prev.rect.x + prev.rect.width,
            );
            yMap.set(
                tile.y + tile.height,
                yMap.get(tile.y + tile.height) ??
                    prev.rect.y + prev.rect.height,
            );
        });
    }
}
