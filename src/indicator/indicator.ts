import { icon_new_for_string } from '@gi-types/gio2';
import { BoxLayout, Button, Icon } from '@gi-types/st1';
import { registerGObjectClass } from '@/utils/gjs';
import { getCurrentExtension, logger } from '@/utils/shell';
import { Actor, Margin, ActorAlign } from '@gi-types/clutter10';
import { Rectangle } from '@gi-types/meta10';
import { LayoutWidget } from '@/components/layout/LayoutWidget';
import { SnapAssistTile } from '@/components/snapassist/snapAssistTile';
import { Main } from '@/utils/ui';
import Settings from '@/settings';
import { Layout } from '@/components/layout/Layout';
import { Tile } from '@/components/layout/Tile';

const { PopupBaseMenuItem } = imports.ui.popupMenu;
const { Button: PopupMenuButton } = imports.ui.panelMenu;

const debug = logger('indicator');

@registerGObjectClass
export class LayoutSelectionWidget extends LayoutWidget<SnapAssistTile> {
    private static readonly _layoutHeight: number = 36;
    private static readonly _layoutWidth: number = 64; // 16:9 ratio. -> (16*this._snapAssistHeight) / 9 and then rounded to int

    constructor(layout: Layout, gapSize: number, scaleFactor: number) {
        const rect = new Rectangle({height: LayoutSelectionWidget._layoutHeight * scaleFactor, width: LayoutSelectionWidget._layoutWidth * scaleFactor, x: 0, y: 0});
        const gaps = new Margin({ top: gapSize * scaleFactor, bottom: gapSize * scaleFactor, left: gapSize * scaleFactor, right: gapSize * scaleFactor });
        super(null, layout, gaps, gaps, rect, "snap-assist-layout");
    }

    buildTile(parent: Actor, rect: Rectangle, gaps: Margin, tile: Tile): SnapAssistTile {
        return new SnapAssistTile({parent, rect, gaps, tile});
    }
}

@registerGObjectClass
export class Indicator extends PopupMenuButton {
    private icon: Icon;
    private onLayoutSelected: (layout: Layout) => void;
    private layoutsBoxLayout: BoxLayout;
    private layoutsButtons: Button[] = [];

    constructor(onLayoutSelection: (layout: Layout) => void) {
        super(0.5, 'Modern Window Manager Indicator', false);

        this.onLayoutSelected = onLayoutSelection;

        this.icon = new Icon({
            gicon: icon_new_for_string(`${getCurrentExtension().path}/icons/indicator.svg`),
            style_class: 'system-status-icon indicator-icon',
        });

        this.add_child(this.icon);
        
        this.layoutsBoxLayout = new BoxLayout({
            x_align: ActorAlign.CENTER,
            y_align: ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            vertical: false // horizontal box layout
        });

        const layoutsPopupMenu = new PopupBaseMenuItem({ style_class: 'popup-menu-layout-selection' });
        layoutsPopupMenu.add_actor(this.layoutsBoxLayout);

        this.menu.addMenuItem(layoutsPopupMenu);
    }

    public setLayouts(layouts: Layout[], selectedIndex: number) {
        this.layoutsBoxLayout.remove_all_children();
        const scalingFactor = global.display.get_monitor_scale(Main.layoutManager.primaryIndex);
        
        const hasGaps = Settings.get_inner_gaps(1).top > 0;

        this.layoutsButtons = layouts.map((lay, ind) => {
            const btn = new Button({style_class: "popup-menu-layout-button"});
            btn.child = new LayoutSelectionWidget(lay, hasGaps ? 1:0, scalingFactor);
            this.layoutsBoxLayout.add_child(btn);
            btn.connect('clicked', (self) => {
                this.selectButtonAtIndex(ind, lay);
                this.menu.toggle();
            });
            return btn;
        });

        this.layoutsButtons[selectedIndex].set_checked(true);
    }
    
    public getSelectedButtonIndex() {
        return this.layoutsButtons.findIndex(btn => btn.checked);
    }

    private selectButtonAtIndex(index: number, layout: Layout) {
        this.layoutsButtons.forEach(btn => btn.set_checked(false));
        this.layoutsButtons[index].set_checked(true);
        this.onLayoutSelected(layout);
    }

    destroy() {
        this.layoutsButtons.forEach(btn => btn.destroy());
        this.layoutsButtons = [];
        super.destroy();
    }
}
