import St from 'gi://St';
import Indicator from './indicator';
import * as IndicatorUtils from './utils';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import CurrentMenu from './currentMenu';

export default class EditingMenu implements CurrentMenu {
    private readonly _indicator: Indicator;

    constructor(indicator: Indicator) {
        this._indicator = indicator;

        const boxLayout = new St.BoxLayout({
            vertical: true,
            styleClass: "buttons-box-layout",
            xExpand: true,
            style: "spacing: 8px"
        });

        const openMenuBtn = IndicatorUtils.createButton("menu-symbolic", "Menu  ", this._indicator.path);
        openMenuBtn.connect('clicked', (self) => this._indicator.openMenu(false) );
        boxLayout.add_child(openMenuBtn);

        const infoMenuBtn = IndicatorUtils.createButton("info-symbolic", "Info     ", this._indicator.path);
        infoMenuBtn.connect('clicked', (self) => this._indicator.openMenu(true) );
        boxLayout.add_child(infoMenuBtn);

        const saveBtn = IndicatorUtils.createButton("save-symbolic", "Save    ", this._indicator.path);
        saveBtn.connect('clicked', (self) => {
            this._indicator.menu.toggle();
            this._indicator.saveLayoutOnClick();
        });
        boxLayout.add_child(saveBtn);

        const cancelBtn = IndicatorUtils.createButton("cancel-symbolic", "Cancel", this._indicator.path);
        cancelBtn.connect('clicked', (self) => {
            this._indicator.menu.toggle();
            this._indicator.cancelLayoutOnClick();
        });
        boxLayout.add_child(cancelBtn);

        const menuItem = new PopupMenu.PopupBaseMenuItem({ style_class: 'indicator-menu-item' });
        menuItem.add_child(boxLayout);

        (this._indicator.menu as PopupMenu.PopupMenu).addMenuItem(menuItem);
    }

    destroy(): void {
        (this._indicator.menu as PopupMenu.PopupMenu).removeAll();
    }
}