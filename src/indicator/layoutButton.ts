import { St, Clutter, Mtk } from '../gi/ext';
import LayoutWidget from '../components/layout/LayoutWidget';
import SnapAssistTile from '../components/snapassist/snapAssistTile';
import Layout from '../components/layout/Layout';
import Tile from '../components/layout/Tile';
import { buildMarginOf, buildRectangle, getScalingFactorOf } from '../utils/ui';
import { registerGObjectClass } from '../utils/gjs';

class LayoutButtonWidget extends LayoutWidget<SnapAssistTile> {
    static { registerGObjectClass(this) }

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
        });
        this.relayout();
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

export default class LayoutButton extends St.Button {
    static { registerGObjectClass(this) }

    constructor(
        parent: Clutter.Actor,
        layout: Layout,
        gapSize: number,
        height: number,
        width: number,
    ) {
        super({
            styleClass: 'layout-button button',
            xExpand: false,
            yExpand: false,
        });

        parent.add_child(this);

        const scalingFactor = getScalingFactorOf(this)[1];

        this.child = new St.Widget(); // the child is just a container
        new LayoutButtonWidget(
            this.child,
            layout,
            gapSize,
            height * scalingFactor,
            width * scalingFactor,
        );
    }

    private _canFocusWhenEnabled: boolean | null = null;

    public setDisabled(disabled: boolean) {
        this.reactive = !disabled;
        if (disabled) {
            if (this._canFocusWhenEnabled === null)
                this._canFocusWhenEnabled = this.can_focus;
            this.can_focus = false;
        } else if (this._canFocusWhenEnabled !== null) {
            this.can_focus = this._canFocusWhenEnabled;
            this._canFocusWhenEnabled = null;
        }
        // St's CSS has no opacity property, so the dimming is an actor
        // property rather than a style class
        this.opacity = disabled ? 89 : 255;
    }
}
