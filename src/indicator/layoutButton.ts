import Clutter from 'gi://Clutter';
import Mtk from "gi://Mtk";
import LayoutWidget from '@/components/layout/LayoutWidget';
import SnapAssistTile from '@/components/snapassist/snapAssistTile';
import Layout from '@/components/layout/Layout';
import Tile from '@/components/layout/Tile';
import { buildRectangle } from '@utils/ui';
import { registerGObjectClass } from '@utils/gjs';
import St from 'gi://St';

@registerGObjectClass
class LayoutButtonWidget extends LayoutWidget<SnapAssistTile> {
    constructor(parent: Clutter.Actor, layout: Layout, gapSize: number, scaleFactor: number, height: number, width: number) {
        const rect = buildRectangle({ x: 0, y: 0, width: width * scaleFactor, height: height * scaleFactor});
        const gaps = new Clutter.Margin();
        gaps.top = gapSize * scaleFactor;
        gaps.bottom = gapSize * scaleFactor;
        gaps.left = gapSize * scaleFactor;
        gaps.right = gapSize * scaleFactor;
        
        super(parent, layout, gaps, new Clutter.Margin(), rect, "");
    }

    buildTile(parent: Clutter.Actor, rect: Mtk.Rectangle, gaps: Clutter.Margin, tile: Tile): SnapAssistTile {
        return new SnapAssistTile({ parent, rect, gaps, tile });
    }
}

@registerGObjectClass
export default class LayoutButton extends St.Button {
    constructor(parent: Clutter.Actor, layout: Layout, gapSize: number, scaleFactor: number, height: number, width: number) {
        super({
            styleClass: "layout-button button",
            xExpand: false,
            yExpand: false
        });

        parent.add_child(this);

        this.child = new St.Widget(); // the child is just a container
        new LayoutButtonWidget(this.child, layout, gapSize, scaleFactor, height, width);
    }
}