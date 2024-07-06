import Layout from '@components/layout/Layout';
import LayoutWidget from '@components/layout/LayoutWidget';
import Tile from '@components/layout/Tile';
import SnapAssistTile from '@components/snapassist/snapAssistTile';
import { registerGObjectClass } from '@utils/gjs';
import { buildRectangle, getScalingFactorOf } from '@utils/ui';
import Mtk from 'gi://Mtk';
import Clutter from 'gi://Clutter';

@registerGObjectClass
export default class LayoutIcon extends LayoutWidget<SnapAssistTile> {
    constructor(
        parent: Clutter.Actor,
        importantTiles: Tile[],
        tiles: Tile[],
        innerGaps: Clutter.Margin,
        outerGaps: Clutter.Margin,
        width: number,
        height: number,
    ) {
        super({
            parent,
            layout: new Layout(tiles, ''),
            innerGaps: innerGaps.copy(),
            outerGaps: outerGaps.copy(),
            containerRect: buildRectangle(),
            styleClass: 'layout-icon button',
        });

        const [, scalingFactor] = getScalingFactorOf(this);
        width *= scalingFactor;
        height *= scalingFactor;

        super.relayout({
            containerRect: buildRectangle({ x: 0, y: 0, width, height }),
        });
        this.set_size(width, height);
        this.set_x_expand(false);
        this.set_y_expand(false);

        importantTiles.forEach((t) => {
            const preview = this._previews.find(
                (snap) => snap.tile.x === t.x && snap.tile.y === t.y,
            );
            if (preview) preview.add_style_class_name('important');
        });
    }

    buildTile(
        parent: Clutter.Actor,
        rect: Mtk.Rectangle,
        gaps: Clutter.Margin,
        tile: Tile,
    ): SnapAssistTile {
        return new SnapAssistTile({ parent, rect, gaps, tile });
    }
}
