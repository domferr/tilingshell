import { GObject, St, Clutter, Gio, GLib } from '../gi/ext';
import SignalHandling from '../utils/signalHandling';
import Indicator from './indicator';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    enableScalingFactorSupport,
    getMonitors,
    getMonitorScalingFactor,
    getScalingFactorOf,
} from '../utils/ui';
import Settings from '../settings/settings';
import GlobalState from '../utils/globalState';
import CurrentMenu from './currentMenu';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import LayoutButton from './layoutButton';
import { logger } from '../utils/logger';
import { registerGObjectClass } from '../utils/gjs';
import { Monitor } from 'resource:///org/gnome/shell/ui/layout.js';
import Layout from '../components/layout/Layout';
import { _ } from '../translations';
import { widgetOrientation } from '../utils/gnomesupport';
import { createButton, createIconButton } from './utils';

const debug = logger('DefaultMenu');

class LayoutsRow extends St.BoxLayout {
    static { registerGObjectClass(this, {
        GTypeName: 'LayoutsRow',
        Signals: {
            'selected-layout': {
                param_types: [GObject.TYPE_STRING],
            },
        },
    })};

    private _layoutsBox: St.BoxLayout;
    private _layoutsButtons: LayoutButton[];
    private _layouts: Layout[];
    private _label: St.Label;
    private _monitor: Monitor;

    constructor(
        parent: Clutter.Actor,
        layouts: Layout[],
        selectedId: string,
        showMonitorName: boolean,
        monitor: Monitor,
        selectableIds?: Set<string>,
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

        this._layouts = layouts;
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
            if (selectableIds && !selectableIds.has(lay.id))
                btn.setDisabled(true);
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

    /**
     * While dynamic tiling is on, only layouts sharing the current
     * tile-count group can actually be switched to (see
     * `TilingManager.selectDynamicLayout`) — everything else is disabled so
     * it doesn't look clickable when it isn't. `undefined` (dynamic tiling
     * off, or nothing placed yet) re-enables every button.
     */
    public setSelectable(selectableIds: Set<string> | undefined) {
        this._layoutsButtons.forEach((btn, ind) => {
            const lay = this._layouts[ind];
            btn.setDisabled(!!selectableIds && !selectableIds.has(lay.id));
        });
    }

    public updateMonitorName(
        showMonitorName: boolean,
        monitorsDetails: {
            name: string;
            index?: number;
            x?: number;
            y?: number;
            height?: number;
            width?: number;
        }[],
    ) {
        if (!showMonitorName) this._label.hide();
        else this._label.show();

        debug(`updateMonitorName: monitor=${this._monitor.index}, x=${this._monitor.x}, y=${this._monitor.y}`);
        debug(`updateMonitorName: monitorsDetails=${JSON.stringify(monitorsDetails)}`);

        // Try to match by index first, then fall back to coordinates
        let details = monitorsDetails.find(
            (m) => m.index === this._monitor.index,
        );
        if (details) {
            debug(`updateMonitorName: matched by index ${this._monitor.index}`);
        }
        if (!details) {
            details = monitorsDetails.find(
                (m) => m.x === this._monitor.x && m.y === this._monitor.y,
            );
            if (details) {
                debug(`updateMonitorName: matched by coordinates (${this._monitor.x}, ${this._monitor.y})`);
            }
        }
        if (!details) {
            debug(`updateMonitorName: no match found for monitor ${this._monitor.index}`);
            return;
        }

        debug(`updateMonitorName: setting label to "${details.name}"`);
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
    private _openPrefsFn: () => void;

    constructor(indicator: Indicator, enableScalingFactor: boolean, openPrefsFn: () => void) {
        this._indicator = indicator;
        this._signals = new SignalHandling();
        this._openPrefsFn = openPrefsFn;
        this._children = [];
        const dynamicToggle = new PopupMenu.PopupSwitchMenuItem(
            _('Dynamic tiling'),
            Settings.ENABLE_DYNAMIC_TILING,
            {},
        );
        this._children.push(dynamicToggle);
        dynamicToggle.connect('toggled', (_item: unknown, state: boolean) => {
            Settings.ENABLE_DYNAMIC_TILING = state;
        });
        // keep the switch honest if the setting is changed from anywhere else
        this._signals.connect(
            Settings,
            Settings.KEY_ENABLE_DYNAMIC_TILING,
            () => {
                dynamicToggle.setToggleState(Settings.ENABLE_DYNAMIC_TILING);
                // switching sources (static vs. dynamic template) for the
                // highlight, not just the checked state of this one switch.
                // Deferred: the TilingManagers listen to the same setting
                // and, depending on who connected first, may only adopt the
                // open windows after this handler ran
                this._queueRefreshSelectedLayouts();
            },
        );
        (this._indicator.menu as PopupMenu.PopupMenu).addMenuItem(
            dynamicToggle,
        );

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

                this._refreshSelectedLayouts();
            },
        );

        this._signals.connect(
            global.workspaceManager,
            'active-workspace-changed',
            () => this._refreshSelectedLayouts(),
        );

        // the menu is normally closed, so the highlight can go stale (e.g.
        // dynamic tiling picking a different layout as windows open/close)
        // without anything above firing; refresh right as it is opened
        this._signals.connect(
            this._indicator.menu,
            'open-state-changed',
            (_menu: unknown, isOpen: boolean) => {
                if (isOpen) this._refreshSelectedLayouts();
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

        // GNOME 49+ has Meta.Monitor with get_display_name()
        const monitorsDetails: {
            name: string;
            index: number;
            x: number;
            y: number;
        }[] | undefined = this._get_display_name();

        if (monitorsDetails) {
            this._layoutsRows.forEach((lr) =>
                lr.updateMonitorName(true, monitorsDetails),
            );
            return;
        }

        // Fallback for GNOME < 49: use subprocess with Gdk
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
                        const parsedMonitorsDetails = JSON.parse(stdout);
                        this._layoutsRows.forEach((lr) =>
                            lr.updateMonitorName(true, parsedMonitorsDetails),
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

    // Use GNOME 49+'s Meta.Monitor with get_display_name()
    private _get_display_name() {
        const monitorManager = global.backend.get_monitor_manager();
        if (!monitorManager.get_logical_monitors) return undefined;

        const logicalMonitors = monitorManager.get_logical_monitors();
        if (!logicalMonitors || logicalMonitors.length <= 0) return undefined;

        const monitorsDetails: {
            name: string;
            index: number;
            x: number;
            y: number;
        }[] = [];
        logicalMonitors.forEach(logicalMonitor => {
            const metaMonitors = logicalMonitor.get_monitors();
            if (metaMonitors.length <= 0) return;

            const metaMonitor = metaMonitors[0];
            if (!metaMonitor.get_display_name) return;

            // MetaLogicalMonitor has x, y as direct properties
            const x = (logicalMonitor as any).x ?? 0;
            const y = (logicalMonitor as any).y ?? 0;
            monitorsDetails.push({
                name: metaMonitor.get_display_name(),
                index: logicalMonitor.get_number(),
                x,
                y,
            });
        });

        return monitorsDetails;
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

        const editLayoutsBtn = createButton(
            'edit-symbolic',
            `${_('Edit Layouts')}...`,
            this._indicator.path,
        );
        editLayoutsBtn.connect('clicked', () =>
            this._indicator.openLayoutEditor(),
        );
        buttonsBoxLayout.add_child(editLayoutsBtn);
        const newLayoutBtn = createButton(
            'add-symbolic',
            `${_('New Layout')}...`,
            this._indicator.path,
        );
        newLayoutBtn.connect('clicked', () =>
            this._indicator.newLayoutOnClick(true),
        );
        buttonsBoxLayout.add_child(newLayoutBtn);

        const prefsBtn = createIconButton(
            'prefs-symbolic',
            this._indicator.path,
        );
        prefsBtn.connect('clicked', () => {
            this._openPrefsFn();
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

        const ws_index = global.workspaceManager.get_active_workspace_index();
        const monitors = getMonitors();
        this._layoutsRows = monitors.map((monitor) => {
            const selectedId = this._selectedIdFor(monitor.index, ws_index);
            const selectableIds = this._selectableIdsFor(
                monitor.index,
                ws_index,
            );
            const row = new LayoutsRow(
                this._container,
                layouts,
                selectedId,
                monitors.length > 1,
                monitor,
                selectableIds,
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

    /**
     * The layout that should show as selected for a monitor: while dynamic
     * tiling is on and actually placing windows on that monitor's
     * workspace, this is whichever saved layout it is using as its
     * template right now (see `TilingManager.getCurrentDynamicLayoutId`) —
     * otherwise it falls back to the static per-monitor selection.
     */
    private _selectedIdFor(monitorIndex: number, wsIndex: number): string {
        if (Settings.ENABLE_DYNAMIC_TILING) {
            const ws = global.workspaceManager.get_workspace_by_index(wsIndex);
            const dynamicId = ws
                ? this._indicator
                      .getTilingManager(monitorIndex)
                      ?.getCurrentDynamicLayoutId(ws)
                : undefined;
            if (dynamicId) return dynamicId;
        }

        const selected_layouts = Settings.get_selected_layouts();
        const ws_selected_layouts =
            wsIndex < selected_layouts.length ? selected_layouts[wsIndex] : [];
        return monitorIndex < ws_selected_layouts.length
            ? ws_selected_layouts[monitorIndex]
            : GlobalState.get().layouts[0].id;
    }

    /**
     * Which layouts are actually switchable to for a monitor right now —
     * `undefined` (every button enabled) unless dynamic tiling is on and
     * has a tile-count group to restrict to.
     */
    private _selectableIdsFor(
        monitorIndex: number,
        wsIndex: number,
    ): Set<string> | undefined {
        if (!Settings.ENABLE_DYNAMIC_TILING) return undefined;
        const ws = global.workspaceManager.get_workspace_by_index(wsIndex);
        return ws
            ? this._indicator
                  .getTilingManager(monitorIndex)
                  ?.getCurrentDynamicLayoutGroupIds(ws)
            : undefined;
    }

    private _refreshSelectedLayouts() {
        const wsIndex = global.workspaceManager.get_active_workspace_index();
        getMonitors().forEach((m, index) => {
            this._layoutsRows[index]?.selectLayout(
                this._selectedIdFor(m.index, wsIndex),
            );
            this._layoutsRows[index]?.setSelectable(
                this._selectableIdsFor(m.index, wsIndex),
            );
        });
    }

    private _refreshSourceId: number | null = null;

    private _queueRefreshSelectedLayouts() {
        if (this._refreshSourceId !== null) return;
        this._refreshSourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._refreshSourceId = null;
            this._refreshSelectedLayouts();
            return GLib.SOURCE_REMOVE;
        });
    }

    public destroy() {
        if (this._refreshSourceId !== null) {
            GLib.Source.remove(this._refreshSourceId);
            this._refreshSourceId = null;
        }
        this._signals.disconnect();
        this._layoutsRows.forEach((lr) => lr.destroy());
        this._layoutsRows = [];
        this._children.forEach((c) => c.destroy());
        this._children = [];
    }
}
