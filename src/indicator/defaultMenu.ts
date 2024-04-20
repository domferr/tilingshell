import St from '@gi-types/st1';
import Clutter from '@gi-types/clutter10';
import SignalHandling from "@/signalHandling";
import Indicator from "./indicator";
import { Main, getScalingFactor } from '@/utils/ui';
import Settings from '@/settings';
import * as IndicatorUtils from './utils';
import GlobalState from '@/globalState';
import LayoutSelectionWidget from './layoutSelectionWidget';

const { PopupBaseMenuItem } = imports.ui.popupMenu;

export default class DefaultMenu implements CurrentMenu {
    private readonly _signals: SignalHandling;
    private readonly _indicator: Indicator;

    private _layoutsBoxLayout: St.BoxLayout;
    private _layoutsButtons: St.Button[];
    private _scalingFactor: number;

    constructor(indicator: Indicator) {
        this._layoutsButtons = [];
        this._indicator = indicator;
        this._signals = new SignalHandling();

        //@ts-ignore
        let monitor = Main.layoutManager.findMonitorForActor(indicator);
        this._scalingFactor = getScalingFactor(monitor?.index || Main.layoutManager.primaryIndex);

        this._layoutsBoxLayout = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            vertical: false, // horizontal box layout
            style_class: "layouts-box-layout"
        });
        const layoutsPopupMenu = new PopupBaseMenuItem({ style_class: 'indicator-menu-item' });
        layoutsPopupMenu.add_actor(this._layoutsBoxLayout);
        this._indicator.menu.addMenuItem(layoutsPopupMenu);

        this._drawLayouts();
        // update the layouts shown by the indicator when they are modified
        this._signals.connect(Settings, Settings.SETTING_LAYOUTS_JSON, () => {
            this._drawLayouts();
        });
        this._signals.connect(Settings, Settings.SETTING_INNER_GAPS, () => {
            this._drawLayouts();
        });

        const buttonsPopupMenu = this._buildEditingButtonsRow();
        this._indicator.menu.addMenuItem(buttonsPopupMenu);

        // if the selected layout was changed externaly, update the selected button
        this._signals.connect(Settings, Settings.SETTING_SELECTED_LAYOUTS, () => {
            const selectedId = Settings.get_selected_layouts()[Main.layoutManager.primaryIndex];
            const selectedIndex = GlobalState.get().layouts.findIndex(lay => lay.id === selectedId);
            if (this._layoutsButtons[selectedIndex].checked) return;
            this._layoutsButtons.forEach((btn, layInd) => btn.set_checked(layInd === selectedIndex));
        });

        this._signals.connect(Main.layoutManager, 'monitors-changed', () => {
            //@ts-ignore
            let monitor = Main.layoutManager.findMonitorForActor(this);
            const newScalingFactor = getScalingFactor(monitor?.index || Main.layoutManager.primaryIndex);
            if (this._scalingFactor === newScalingFactor) return;

            this._scalingFactor = newScalingFactor;
            this._drawLayouts();
        });
    }

    private _buildEditingButtonsRow() {
        const buttonsBoxLayout = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            vertical: false, // horizontal box layout
            style_class: "buttons-box-layout"
        });

        const editLayoutsBtn = IndicatorUtils.createButton("document-edit-symbolic", "Edit Layouts...");
        editLayoutsBtn.connect('clicked', (self) => this._indicator.editLayoutsOnClick() );
        buttonsBoxLayout.add_child(editLayoutsBtn);
        const newLayoutBtn = IndicatorUtils.createButton("list-add-symbolic", "New Layout...");
        newLayoutBtn.connect('clicked', (self) => this._indicator.newLayoutOnClick(true) );
        buttonsBoxLayout.add_child(newLayoutBtn);

        const buttonsPopupMenu = new PopupBaseMenuItem({ style_class: 'indicator-menu-item' });
        buttonsPopupMenu.add_actor(buttonsBoxLayout);
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
            const btn = new St.Button({x_expand: false, style_class: "layout-button button"});
            btn.child = new LayoutSelectionWidget(lay, hasGaps ? 1:0, this._scalingFactor, layoutHeight, layoutWidth);
            this._layoutsBoxLayout.add_child(btn);
            btn.connect('clicked', (self) => !btn.checked && this._indicator.selectLayoutOnClick(lay));
            return btn;
        });

        const selectedId = Settings.get_selected_layouts()[Main.layoutManager.primaryIndex];
        const selectedIndex = GlobalState.get().layouts.findIndex(lay => lay.id === selectedId);
        this._layoutsButtons[selectedIndex]?.set_checked(true);
    }

    public destroy() {
        this._indicator.menu.removeAll();
        this._layoutsButtons = [];
        this._signals.disconnect();
    }
}