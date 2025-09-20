import { GObject, St, Clutter, Gio } from '@gi.ext';
import SignalHandling from '@utils/signalHandling';
import Indicator from './indicator';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    enableScalingFactorSupport,
    getMonitors,
    getMonitorScalingFactor,
    getScalingFactorOf,
} from '@/utils/ui';
import Settings from '@settings/settings';
import * as IndicatorUtils from './utils';
import GlobalState from '@utils/globalState';
import CurrentMenu from './currentMenu';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import LayoutButton from './layoutButton';
import { logger } from '@utils/logger';
import { registerGObjectClass } from '@utils/gjs';
import { Monitor } from 'resource:///org/gnome/shell/ui/layout.js';
import Layout from '@components/layout/Layout';
import { _ } from '../translations';
import { openPrefs } from '@polyfill';
import { widgetOrientation } from '@utils/gnomesupport';

const debug = logger('DefaultMenu');

@registerGObjectClass
class LayoutsRow extends St.BoxLayout {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'LayoutsRow',
        Signals: {
            'selected-layout': {
                param_types: [GObject.TYPE_STRING],
            },
        },
    };

    private _layoutsBox: St.BoxLayout;
    private _layoutsButtons: LayoutButton[];
    private _label: St.Label;
    private _monitor: Monitor;

    constructor(
        parent: Clutter.Actor,
        layouts: Layout[],
        selectedId: string,
        showMonitorName: boolean,
        monitor: Monitor,
    ) {
        super({
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            xExpand: true,
            yExpand: true,
            style: 'spacing: 8px',
            ...widgetOrientation(true),
        });
        this._layoutsBox = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            xExpand: true,
            yExpand: true,
            styleClass: 'layouts-box-layout',
        });
        this._monitor = monitor;
        this._label = new St.Label({
            text: `Monitor ${this._monitor.index + 1}`,
            styleClass: 'monitor-layouts-title',
        });
        this.add_child(this._label);
        if (!showMonitorName) this._label.hide();
        this.add_child(this._layoutsBox);

        parent.add_child(this);

        const selectedIndex = layouts.findIndex((lay) => lay.id === selectedId);
        const hasGaps = Settings.get_inner_gaps(1).top > 0;

        const layoutHeight: number = 36;
        const layoutWidth: number = 64; // 16:9 ratio. -> (16*layoutHeight) / 9 and then rounded to int

        this._layoutsButtons = layouts.map((lay, ind) => {
            const btn = new LayoutButton(
                this._layoutsBox,
                lay,
                hasGaps ? 2 : 0,
                layoutHeight,
                layoutWidth,
            );
            btn.connect(
                'clicked',
                () => !btn.checked && this.emit('selected-layout', lay.id),
            );
            if (ind === selectedIndex) btn.set_checked(true);
            return btn;
        });
    }

    public selectLayout(selectedId: string) {
        const selectedIndex = GlobalState.get().layouts.findIndex(
            (lay) => lay.id === selectedId,
        );
        this._layoutsButtons.forEach((btn, ind) =>
            btn.set_checked(ind === selectedIndex),
        );
    }

    public updateMonitorName(
        showMonitorName: boolean,
        monitorsDetails: {
            name: string;
            x: number;
            y: number;
            height: number;
            width: number;
        }[],
    ) {
        if (!showMonitorName) this._label.hide();
        else this._label.show();

        const details = monitorsDetails.find(
            (m) => m.x === this._monitor.x && m.y === this._monitor.y,
        );
        if (!details) return;

        this._label.set_text(details.name);
    }
}

export default class DefaultMenu implements CurrentMenu {
    private readonly _signals: SignalHandling;
    private readonly _indicator: Indicator;

    private _layoutsRows: LayoutsRow[];
    private _container: St.BoxLayout;
    private _scalingFactor: number;
    private _children: St.Widget[];

    constructor(indicator: Indicator, enableScalingFactor: boolean) {
        this._indicator = indicator;
        this._signals = new SignalHandling();
        this._children = [];
        const layoutsPopupMenu = new PopupMenu.PopupBaseMenuItem({
            style_class: 'indicator-menu-item',
        });
        this._children.push(layoutsPopupMenu);
        this._container = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            xExpand: true,
            yExpand: true,
            styleClass: 'default-menu-container',
            ...widgetOrientation(true),
        });
        layoutsPopupMenu.add_child(this._container);
        (this._indicator.menu as PopupMenu.PopupMenu).addMenuItem(
            layoutsPopupMenu,
        );

        if (enableScalingFactor) {
            const monitor = Main.layoutManager.findMonitorForActor(
                this._container,
            );
            const scalingFactor = getMonitorScalingFactor(
                monitor?.index || Main.layoutManager.primaryIndex,
            );
            enableScalingFactorSupport(this._container, scalingFactor);
        }
        this._scalingFactor = getScalingFactorOf(this._container)[1];

        this._layoutsRows = [];
        this._drawLayouts();
        // update the layouts shown by the indicator when they are modified
        this._signals.connect(
            Settings,
            Settings.KEY_SETTING_LAYOUTS_JSON,
            () => {
                this._drawLayouts();
            },
        );
        this._signals.connect(Settings, Settings.KEY_INNER_GAPS, () => {
            this._drawLayouts();
        });

        // if the selected layout was changed externaly, update the selected button
        this._signals.connect(
            Settings,
            Settings.KEY_SETTING_SELECTED_LAYOUTS,
            () => {
                this._updateScaling();
                if (this._layoutsRows.length !== getMonitors().length)
                    this._drawLayouts();

                const selected_layouts = Settings.get_selected_layouts();
                const wsIndex =
                    global.workspaceManager.get_active_workspace_index();
                getMonitors().forEach((m, index) => {
                    const selectedId =
                        wsIndex < selected_layouts.length
                            ? selected_layouts[wsIndex][index]
                            : GlobalState.get().layouts[0].id;
                    this._layoutsRows[index].selectLayout(selectedId);
                });
            },
        );

        this._signals.connect(
            global.workspaceManager,
            'active-workspace-changed',
            () => {
                const selected_layouts = Settings.get_selected_layouts();
                const wsIndex =
                    global.workspaceManager.get_active_workspace_index();
                getMonitors().forEach((m, index) => {
                    const selectedId =
                        wsIndex < selected_layouts.length
                            ? selected_layouts[wsIndex][index]
                            : GlobalState.get().layouts[0].id;
                    this._layoutsRows[index].selectLayout(selectedId);
                });
            },
        );

        this._signals.connect(Main.layoutManager, 'monitors-changed', () => {
            if (!enableScalingFactor) return;

            const monitor = Main.layoutManager.findMonitorForActor(
                this._container,
            );
            const scalingFactor = getMonitorScalingFactor(
                monitor?.index || Main.layoutManager.primaryIndex,
            );
            enableScalingFactorSupport(this._container, scalingFactor);

            this._updateScaling();
            if (this._layoutsRows.length !== getMonitors().length)
                this._drawLayouts();

            // compute monitors details and update labels asynchronously (if we have successful results...)
            this._computeMonitorsDetails();
        });

        // compute monitors details and update labels asynchronously (if we have successful results...)
        this._computeMonitorsDetails();

        const buttonsPopupMenu = this._buildEditingButtonsRow();
        (this._indicator.menu as PopupMenu.PopupMenu).addMenuItem(
            buttonsPopupMenu,
        );
        this._children.push(buttonsPopupMenu);
    }

    // compute monitors details and update labels asynchronously (if we have successful results...)
    private _computeMonitorsDetails() {
        if (getMonitors().length === 1) {
            this._layoutsRows.forEach((lr) => lr.updateMonitorName(false, []));
            return;
        }

        try {
            // Since Gdk.Monitor has monitor's name but we can't import Gdk into gnome-shell, we run a gjs code in a subprocess.
            // This code will just get all the monitors, printing into JSON format to stdout each monitor's name and geometry.
            // If we are successfull, we parse the stdout of the subprocess and update monitor's name
            const proc = Gio.Subprocess.new(
                ['gjs', '-m', `${this._indicator.path}/monitorDescription.js`],
                Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_PIPE,
            );

            proc.communicate_utf8_async(
                null,
                null,
                (pr: Gio.Subprocess | null, res: Gio.AsyncResult) => {
                    if (!pr) return;

                    const [, stdout, stderr] = pr.communicate_utf8_finish(res);
                    if (pr.get_successful()) {
                        debug(stdout);
                        const monitorsDetails = JSON.parse(stdout);
                        this._layoutsRows.forEach((lr) =>
                            lr.updateMonitorName(true, monitorsDetails),
                        );
                    } else {
                        debug('error:', stderr);
                    }
                },
            );
        } catch (e) {
            debug(e);
        }
    }

    private _updateScaling() {
        const newScalingFactor = getScalingFactorOf(this._container)[1];
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
            styleClass: 'buttons-box-layout',
        });

        const editLayoutsBtn = IndicatorUtils.createButton(
            'edit-symbolic',
            `${_('Edit Layouts')}...`,
            this._indicator.path,
        );
        editLayoutsBtn.connect('clicked', () =>
            this._indicator.openLayoutEditor(),
        );
        buttonsBoxLayout.add_child(editLayoutsBtn);
        const newLayoutBtn = IndicatorUtils.createButton(
            'add-symbolic',
            `${_('New Layout')}...`,
            this._indicator.path,
        );
        newLayoutBtn.connect('clicked', () =>
            this._indicator.newLayoutOnClick(true),
        );
        buttonsBoxLayout.add_child(newLayoutBtn);

        const prefsBtn = IndicatorUtils.createIconButton(
            'prefs-symbolic',
            this._indicator.path,
        );
        prefsBtn.connect('clicked', () => {
            openPrefs();
            this._indicator.menu.toggle();
        });
        buttonsBoxLayout.add_child(prefsBtn);

        const buttonsPopupMenu = new PopupMenu.PopupBaseMenuItem({
            style_class: 'indicator-menu-item',
        });
        buttonsPopupMenu.add_child(buttonsBoxLayout);

        return buttonsPopupMenu;
    }

    private _drawLayouts() {
        const layouts = GlobalState.get().layouts;
        this._container.destroy_all_children();
        this._layoutsRows = [];

        const selected_layouts = Settings.get_selected_layouts();
        const ws_index = global.workspaceManager.get_active_workspace_index();
        const monitors = getMonitors();
        this._layoutsRows = monitors.map((monitor) => {
            const ws_selected_layouts =
                ws_index < selected_layouts.length
                    ? selected_layouts[ws_index]
                    : [];
            const selectedId =
                monitor.index < ws_selected_layouts.length
                    ? ws_selected_layouts[monitor.index]
                    : GlobalState.get().layouts[0].id;
            const row = new LayoutsRow(
                this._container,
                layouts,
                selectedId,
                monitors.length > 1,
                monitor,
            );
            row.connect(
                'selected-layout',
                (r: LayoutsRow, layoutId: string) => {
                    this._indicator.selectLayoutOnClick(
                        monitor.index,
                        layoutId,
                    );
                },
            );
            return row;
        });
    }

    public destroy() {
        this._signals.disconnect();
        this._layoutsRows.forEach((lr) => lr.destroy());
        this._layoutsRows = [];
        this._children.forEach((c) => c.destroy());
        this._children = [];
    }
}
