import Layout from '@components/layout/Layout';
import LayoutWidget from '@components/layout/LayoutWidget';
import { registerGObjectClass } from '@utils/gjs';
import { buildMarginOf, buildRectangle } from '@utils/ui';
import Clutter from 'gi://Clutter';
import Mtk from 'gi://Mtk';
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
            containerRect: buildRectangle({ x: 0, y: 0, width, height }),
            innerGaps: buildMarginOf(gapSize),
            outerGaps: new Clutter.Margin(),
            styleClass: 'window-menu-layout',
        });
        console.log('LayoutTileButtons');
        this.relayout();
    }

    buildTile(
        parent: Clutter.Actor,
        rect: Mtk.Rectangle,
        gaps: Clutter.Margin,
        tile: Tile,
    ): SnapAssistTileButton {
        console.log(`${rect.x} ${rect.y} ${rect.width} ${rect.height}`);
        return new SnapAssistTileButton({ parent, rect, gaps, tile });
    }

    public get buttons(): SnapAssistTileButton[] {
        return this._previews;
    }
}
