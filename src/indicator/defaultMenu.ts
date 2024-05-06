import St from 'gi://St';
import Clutter from 'gi://Clutter';
import SignalHandling from "@/signalHandling";
import Indicator from "./indicator";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { getScalingFactorOf } from '@/utils/ui';
import Settings from '@/settings';
import * as IndicatorUtils from './utils';
import GlobalState from '@/globalState';
import CurrentMenu from './currentMenu';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import LayoutButton from './layoutButton';
import { logger } from '@utils/shell';

const debug = logger("DefaultMenu");

export default class DefaultMenu implements CurrentMenu {
    private readonly _signals: SignalHandling;
    private readonly _indicator: Indicator;

    private _layoutsBoxLayout: St.BoxLayout;
    private _layoutsButtons: LayoutButton[];
    private _scalingFactor: number;

    constructor(indicator: Indicator) {
        this._layoutsButtons = [];
        this._indicator = indicator;
        this._signals = new SignalHandling();

        this._layoutsBoxLayout = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            xExpand: true,
            yExpand: true,
            vertical: false, // horizontal box layout
            styleClass: "layouts-box-layout"
        });
        
        const layoutsPopupMenu = new PopupMenu.PopupBaseMenuItem({ style_class: 'indicator-menu-item' });
        layoutsPopupMenu.add_child(this._layoutsBoxLayout);

        (this._indicator.menu as PopupMenu.PopupMenu).addMenuItem(layoutsPopupMenu);
        this._scalingFactor = getScalingFactorOf(this._layoutsBoxLayout)[1];

        this._drawLayouts();
        // update the layouts shown by the indicator when they are modified
        this._signals.connect(Settings, Settings.SETTING_LAYOUTS_JSON, () => {
            this._drawLayouts();
        });
        this._signals.connect(Settings, Settings.SETTING_INNER_GAPS, () => {
            this._drawLayouts();
        });

        const buttonsPopupMenu = this._buildEditingButtonsRow();
        (this._indicator.menu as PopupMenu.PopupMenu).addMenuItem(buttonsPopupMenu);

        // if the selected layout was changed externaly, update the selected button
        this._signals.connect(Settings, Settings.SETTING_SELECTED_LAYOUTS, () => {
            const selectedId = Settings.get_selected_layouts()[Main.layoutManager.primaryIndex];
            const selectedIndex = GlobalState.get().layouts.findIndex(lay => lay.id === selectedId);
            if (this._layoutsButtons[selectedIndex].checked) return;
            this._layoutsButtons.forEach((btn, layInd) => btn.set_checked(layInd === selectedIndex));
        });

        this._signals.connect(Main.layoutManager, 'monitors-changed', () => {
            debug("monitors-changed")
            this._updateScaling();
        });
    }

    private _updateScaling() {
        const newScalingFactor = getScalingFactorOf(this._layoutsBoxLayout)[1];
        if (this._scalingFactor === newScalingFactor) return;

        this._scalingFactor = newScalingFactor;
        this._drawLayouts();
    }

    private _buildEditingButtonsRow() {
        const buttonsBoxLayout = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            xExpand: true,
            yExpand: true,
            vertical: false, // horizontal box layout
            styleClass: "buttons-box-layout"
        });

        const editLayoutsBtn = IndicatorUtils.createButton("document-edit-symbolic", "Edit Layouts...");
        editLayoutsBtn.connect('clicked', (self) => this._indicator.editLayoutsOnClick() );
        buttonsBoxLayout.add_child(editLayoutsBtn);
        const newLayoutBtn = IndicatorUtils.createButton("list-add-symbolic", "New Layout...");
        newLayoutBtn.connect('clicked', (self) => this._indicator.newLayoutOnClick(true) );
        buttonsBoxLayout.add_child(newLayoutBtn);

        const buttonsPopupMenu = new PopupMenu.PopupBaseMenuItem({ style_class: 'indicator-menu-item' });
        buttonsPopupMenu.add_child(buttonsBoxLayout);
        
        return buttonsPopupMenu;
    }

    private _drawLayouts() {
        const layouts = GlobalState.get().layouts;
        this._layoutsButtons.forEach(btn => btn.destroy());
        this._layoutsButtons = [];
        this._layoutsBoxLayout.remove_all_children();
        
        const hasGaps = Settings.get_inner_gaps(1).top > 0;

        const layoutHeight: number = 36;
        const layoutWidth: number = 64; // 16:9 ratio. -> (16*layoutHeight) / 9 and then rounded to int
        this._layoutsButtons = layouts.map((lay, btnInd) => {
            const btn = new LayoutButton(this._layoutsBoxLayout, lay, hasGaps ? 2:0, layoutHeight, layoutWidth);
            btn.connect('clicked', (self) => !btn.checked && this._indicator.selectLayoutOnClick(lay));
            return btn;
        });

        const selectedId = Settings.get_selected_layouts()[Main.layoutManager.primaryIndex];
        const selectedIndex = GlobalState.get().layouts.findIndex(lay => lay.id === selectedId);
        this._layoutsButtons[selectedIndex]?.set_checked(true);
    }

    public destroy() {
        this._signals.disconnect();
        this._layoutsButtons.forEach(btn => btn.destroy());
        this._layoutsButtons = [];
        this._layoutsBoxLayout.destroy();
        (this._indicator.menu as PopupMenu.PopupMenu).removeAll();
    }
}