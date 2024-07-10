import { registerGObjectClass } from '@utils/gjs';
import { buildMarginOf, buildRectangle, getScalingFactorOf } from '@utils/ui';
import Clutter from 'gi://Clutter';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import Layout from '@/components/layout/Layout';
import LayoutWidget from '@/components/layout/LayoutWidget';
import Tile from '@/components/layout/Tile';
import SnapAssistTile from '@/components/snapassist/snapAssistTile';

@registerGObjectClass
class LayoutButtonWidget extends LayoutWidget<SnapAssistTile> {
  constructor(parent: Clutter.Actor, layout: Layout, gapSize: number, height: number, width: number) {
    super({
      parent,
      layout,
      containerRect: buildRectangle({ x: 0, y: 0, width, height }),
      innerGaps: buildMarginOf(gapSize),
      outerGaps: new Clutter.Margin(),
    });
    this.relayout();
  }

  buildTile(parent: Clutter.Actor, rect: Mtk.Rectangle, gaps: Clutter.Margin, tile: Tile): SnapAssistTile {
    return new SnapAssistTile({ parent, rect, gaps, tile });
  }
}

@registerGObjectClass
export default class LayoutButton extends St.Button {
  constructor(parent: Clutter.Actor, layout: Layout, gapSize: number, height: number, width: number) {
    super({
      styleClass: 'layout-button button',
      xExpand: false,
      yExpand: false,
    });

    parent.add_child(this);

    const [_, scalingFactor] = getScalingFactorOf(this);

    this.child = new St.Widget(); // the child is just a container
    new LayoutButtonWidget(this.child, layout, gapSize, height * scalingFactor, width * scalingFactor);
  }
}
