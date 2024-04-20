import { registerGObjectClass } from '@/utils/gjs';
import Clutter from '@gi-types/clutter10';
import Meta from '@gi-types/meta10';
import LayoutWidget from '@/components/layout/LayoutWidget';
import SnapAssistTile from '@/components/snapassist/snapAssistTile';
import Layout from '@/components/layout/Layout';
import Tile from '@/components/layout/Tile';

@registerGObjectClass
export default class LayoutSelectionWidget extends LayoutWidget<SnapAssistTile> {
    constructor(layout: Layout, gapSize: number, scaleFactor: number, height: number, width: number) {
        const rect = new Meta.Rectangle({height: height * scaleFactor, width: width * scaleFactor, x: 0, y: 0});
        const gaps = new Clutter.Margin({ top: gapSize * scaleFactor, bottom: gapSize * scaleFactor, left: gapSize * scaleFactor, right: gapSize * scaleFactor });
        super(null, layout, gaps, new Clutter.Margin(), rect, "layout-selection");
    }

    buildTile(parent: Clutter.Actor, rect: Meta.Rectangle, gaps: Clutter.Margin, tile: Tile): SnapAssistTile {
        return new SnapAssistTile({parent, rect, gaps, tile});
    }
}