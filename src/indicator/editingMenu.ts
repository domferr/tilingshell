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
        const menuItem = new PopupMenu.PopupBaseMenuItem({ style_class: 'indicator-menu-item' });

        const openMenuBtn = IndicatorUtils.createButton("video-display-symbolic", "Menu");
        openMenuBtn.connect('clicked', (self) => this._indicator.openMenu(false) );
        boxLayout.add_child(openMenuBtn);

        const infoMenuBtn = IndicatorUtils.createButton("dialog-question-symbolic", "Info");
        infoMenuBtn.connect('clicked', (self) => this._indicator.openMenu(true) );
        boxLayout.add_child(infoMenuBtn);

        const saveBtn = IndicatorUtils.createButton("emblem-ok-symbolic", "Save");
        saveBtn.connect('clicked', (self) => {
            this._indicator.menu.toggle();
            this._indicator.saveLayoutOnClick();
        });
        boxLayout.add_child(saveBtn);

        const cancelBtn = IndicatorUtils.createButton("window-close-symbolic", "Cancel");
        cancelBtn.connect('clicked', (self) => {
            this._indicator.menu.toggle();
            this._indicator.cancelLayoutOnClick();
        });
        boxLayout.add_child(cancelBtn);

        menuItem.add_child(boxLayout);

        //@ts-ignore todo
        this._indicator.menu.addMenuItem(menuItem);
    }

    destroy(): void {
        //@ts-ignore todo
        this._indicator.menu.removeAll();
    }
}