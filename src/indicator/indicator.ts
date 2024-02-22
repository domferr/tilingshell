import { icon_new_for_string, Settings } from '@gi-types/gio2';
import { BoxLayout, Button, Icon } from '@gi-types/st1';
import { registerGObjectClass } from '@/utils/gjs';
import { getCurrentExtension, getCurrentExtensionSettings, logger } from '@/utils/shell';
import { TileGroup } from '@/components/tileGroup';
import { Actor, Margin, ActorAlign } from '@gi-types/clutter10';
import { Rectangle } from '@gi-types/meta10';
import { LayoutWidget } from '@/components/layout/LayoutWidget';
import { SnapAssistTile } from '@/components/snapassist/snapAssistTile';
import { Main } from '@/utils/ui';

const { PopupBaseMenuItem } = imports.ui.popupMenu;
const { Button: PopupMenuButton } = imports.ui.panelMenu;

const debug = logger('indicator');

@registerGObjectClass
export class LayoutSelectionWidget extends LayoutWidget<SnapAssistTile> {
    private static readonly _layoutHeight: number = 36;
    private static readonly _layoutWidth: number = 64; // 16:9 ratio. -> (16*this._snapAssistHeight) / 9 and then rounded to int

    constructor(layout: TileGroup, margins: number, scalingFactor: number) {
        super(null, layout, margins, LayoutSelectionWidget._layoutWidth * scalingFactor, LayoutSelectionWidget._layoutHeight * scalingFactor,
            "snap-assist-layout"
        );
    }

    buildTile(parent: Actor, rect: Rectangle, margin: Margin): SnapAssistTile {
        return new SnapAssistTile(parent, rect, margin);
    }
}

@registerGObjectClass
export class Indicator extends PopupMenuButton {    
    private settings: Settings;
    private icon: Icon;
    private onLayoutSelected: (layout: TileGroup) => void;
    private layoutsBoxLayout: BoxLayout;
    private layoutsButtons: Button[] = [];

    constructor(onLayoutSelection: (layout: TileGroup) => void) {
        super(0.5, 'Modern Window Manager Indicator', false);

        this.onLayoutSelected = onLayoutSelection;
        this.settings = getCurrentExtensionSettings();

        this.icon = new Icon({
            gicon: icon_new_for_string(`${getCurrentExtension().path}/icons/indicator.svg`),
            style_class: 'system-status-icon indicator-icon',
        });

        this.add_child(this.icon);
        
        this.layoutsBoxLayout = new BoxLayout({
            name: 'popup-menu-layout-selection',
            x_align: ActorAlign.CENTER,
            y_align: ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            vertical: false
        });

        const layoutsPopupMenu = new PopupBaseMenuItem({ style_class: 'popup-menu-layout-selection' });
        layoutsPopupMenu.add_actor(this.layoutsBoxLayout);

        this.menu.addMenuItem(layoutsPopupMenu);
    }

    public setLayouts(layouts: TileGroup[], selectedIndex: number, hasMargins: boolean) {
        this.layoutsBoxLayout.remove_all_children();
        const scalingFactor = global.display.get_monitor_scale(Main.layoutManager.primaryIndex);

        this.layoutsButtons = layouts.map((lay, ind) => {
            const btn = new Button({style_class: "popup-menu-layout-button"});
            btn.child = new LayoutSelectionWidget(lay, hasMargins ? 1:0, scalingFactor);
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

    private selectButtonAtIndex(index: number, layout: TileGroup) {
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
