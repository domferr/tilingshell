import { registerGObjectClass } from '../utils/gjs';
import Layout from '../components/layout/Layout';
import Settings from '../settings/settings';
import SignalHandling from './signalHandling';
import { GObject, Meta, Gio } from '../gi/ext';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { logger } from './logger';
import { getWindows } from './ui';
import {
    getMonitorKey,
    getMonitorKeys,
    logMonitorKeys,
} from './monitorIdentity';
import ExtendedWindow from '../components/tilingsystem/extendedWindow';

const debug = logger('GlobalState');

export default class GlobalState extends GObject.Object {
    static { registerGObjectClass(this, {
        GTypeName: 'GlobalState',
        Signals: {
            'layouts-changed': {
                param_types: [],
            },
        },
        Properties: {
            tilePreviewAnimationTime: GObject.ParamSpec.uint(
                'tilePreviewAnimationTime',
                'tilePreviewAnimationTime',
                'Animation time of tile previews in milliseconds',
                GObject.ParamFlags.READWRITE,
                0,
                2000,
                100,
            ),
        },
    })};

    public static SIGNAL_LAYOUTS_CHANGED = 'layouts-changed';

    private static _instance: GlobalState | null;

    private _signals: SignalHandling;
    private _layouts: Layout[];
    private _tilePreviewAnimationTime: number;
    // if workspaces are reordered, we use this map to know which layouts where selected
    // to each workspace and we save the new ordering in the settings
    private _selected_layouts: Map<Meta.Workspace, string[]>; // used to handle reordering of workspaces

    // identity keys (EDID vendor/product/serial) of the current monitor list,
    // in current index order; used to interpret the positional selected-layouts
    // array, whose indices refer to the monitor list as it was when it was written
    private _monitor_keys: string[] | null;
    // guards against re-entering our own changed::selected-layouts handler
    private _saving: boolean;

    static get(): GlobalState {
        if (!this._instance) this._instance = new GlobalState();

        return this._instance;
    }

    static destroy() {
        if (this._instance) {
            this._instance._signals.disconnect();
            this._instance._layouts = [];
            this._instance = null;
        }
    }

    constructor() {
        super();

        this._signals = new SignalHandling();
        this._layouts = Settings.get_layouts_json();
        this._tilePreviewAnimationTime = 100;
        this._selected_layouts = new Map();
        this._monitor_keys = null;
        this._saving = false;
        this.validate_selected_layouts();

        Settings.bind(
            Settings.KEY_TILE_PREVIEW_ANIMATION_TIME,
            this,
            'tilePreviewAnimationTime',
            Gio.SettingsBindFlags.GET,
        );
        this._signals.connect(
            Settings,
            Settings.KEY_SETTING_LAYOUTS_JSON,
            () => {
                this._layouts = Settings.get_layouts_json();
                this.emit(GlobalState.SIGNAL_LAYOUTS_CHANGED);
            },
        );

        this._signals.connect(
            Settings,
            Settings.KEY_SETTING_SELECTED_LAYOUTS,
            () => {
                // Our own writes land here too; the map is already authoritative.
                if (this._saving) return;

                const selected_layouts = Settings.get_selected_layouts();
                if (selected_layouts.length === 0) {
                    this.validate_selected_layouts();
                    return;
                }

                const n_monitors = (Main.layoutManager.monitors ?? []).length;
                // The monitor count changed underneath us. Rebuild from monitor
                // identities instead of padding with the first layout - padding
                // with a default and persisting it is what used to erase
                // per-monitor assignments every time a dock or lid changed the
                // topology.
                if (selected_layouts.some(m => m.length !== n_monitors)) {
                    this.validate_selected_layouts();
                    return;
                }

                const n_workspaces = global.workspaceManager.get_n_workspaces();
                for (let i = 0; i < n_workspaces; i++) {
                    const ws =
                        global.workspaceManager.get_workspace_by_index(i);
                    if (!ws) continue;
                    this._selected_layouts.set(ws, selected_layouts[i]);
                }

                // An out-of-process write (the prefs window, a manual gsettings
                // edit) is authoritative for the monitors plugged in right now,
                // so fold it into the identity map. Without this a later dock
                // event would resurrect the superseded layout.
                this._save_selected_layouts();
            },
        );

        this._signals.connect(
            global.workspaceManager,
            'workspace-added',
            (_, index: number) => {
                const n_workspaces = global.workspaceManager.get_n_workspaces();
                const newWs =
                    global.workspaceManager.get_workspace_by_index(index);
                if (!newWs) return;

                debug(`added workspace ${index}`);

                const secondLastWs =
                    global.workspaceManager.get_workspace_by_index(
                        n_workspaces - 2,
                    );

                // the new workspace must start with the same layout of the last workspace
                // use the layout at index 0 if for some reason we cannot find the layout
                // of the last workspace
                const secondLastWsLayoutsId = secondLastWs
                    ? (this._selected_layouts.get(secondLastWs) ?? [])
                    : [];
                if (secondLastWsLayoutsId.length === 0) {
                    secondLastWsLayoutsId.push(
                        ...Main.layoutManager.monitors.map(
                            () => this._layouts[0].id,
                        ),
                    );
                }

                this._selected_layouts.set(
                    newWs,
                    secondLastWsLayoutsId, // Main.layoutManager.monitors.map(() => layout.id),
                );

                this._save_selected_layouts();
            },
        );

        this._signals.connect(
            global.workspaceManager,
            'workspace-removed',
            () => {
                const newMap: Map<Meta.Workspace, string[]> = new Map();
                const n_workspaces = global.workspaceManager.get_n_workspaces();
                for (let i = 0; i < n_workspaces; i++) {
                    const ws =
                        global.workspaceManager.get_workspace_by_index(i);
                    if (!ws) continue;
                    const monitors_layouts = this._selected_layouts.get(ws);
                    if (!monitors_layouts) continue;

                    this._selected_layouts.delete(ws);
                    newMap.set(ws, monitors_layouts);
                }

                this._selected_layouts.clear();
                this._selected_layouts = newMap;
                this._save_selected_layouts();
                debug('deleted workspace');
            },
        );

        this._signals.connect(
            global.workspaceManager,
            'workspaces-reordered',
            () => {
                this._save_selected_layouts();
                debug('reordered workspaces');
            },
        );
    }

    public validate_selected_layouts() {
        const monitors = Main.layoutManager.monitors ?? [];
        const newKeys = monitors.map(monitor => getMonitorKey(monitor));
        // The stored array is positional: its indices describe the monitor list
        // as it was when the array was written, not the current one. Resolve it
        // with the previous keys before the cache moves on.
        const oldKeys = this._monitor_keys ?? newKeys;
        const oldSelected = Settings.get_selected_layouts();
        const identity = Settings.get_selected_layouts_by_monitor();
        const n_workspaces = global.workspaceManager.get_n_workspaces();
        const defaultLayoutId = this._layouts[0]?.id;

        // Carry forward every assignment we can still attribute to a physical
        // monitor. Monitors that are currently unplugged keep their entry, which
        // is what lets a layout survive being undocked and plugged back in later.
        for (let i = 0; i < n_workspaces; i++) {
            const perMonitor = identity[String(i)] ?? {};
            const stored = i < oldSelected.length ? oldSelected[i] : [];
            stored.forEach((layoutId, index) => {
                const key = oldKeys[index];
                if (key && layoutId && !(key in perMonitor)) {
                    perMonitor[key] = layoutId;
                }
            });
            identity[String(i)] = perMonitor;
        }
        Settings.save_selected_layouts_by_monitor(identity);

        this._monitor_keys = newKeys;

        const knownLayout = (id: string | undefined) =>
            this._layouts.some(lay => lay.id === id);

        for (let i = 0; i < n_workspaces; i++) {
            const ws = global.workspaceManager.get_workspace_by_index(i);
            if (!ws) continue;

            const perMonitor = identity[String(i)] ?? {};
            const monitors_layouts = newKeys.map(
                key =>
                    (knownLayout(perMonitor[key]) && perMonitor[key]) ||
                    defaultLayoutId,
            );

            this._selected_layouts.set(ws, monitors_layouts);
        }

        this._save_selected_layouts();
        logMonitorKeys('validated');
    }

    private _save_selected_layouts() {
        const to_be_saved: string[][] = [];
        const n_workspaces = global.workspaceManager.get_n_workspaces();
        const identity = Settings.get_selected_layouts_by_monitor();
        const keys = this._monitor_keys ?? getMonitorKeys();
        const stored = Settings.get_selected_layouts();

        for (let i = 0; i < n_workspaces; i++) {
            const ws = global.workspaceManager.get_workspace_by_index(i);
            if (!ws) continue;
            // Fall back to the stored row rather than dropping it: a short array
            // would shift every later row onto a different workspace index.
            const monitors_layouts = this._selected_layouts.get(ws) ?? stored[i];
            if (!monitors_layouts) continue;
            to_be_saved.push(monitors_layouts);

            // Record each assignment against the physical monitor it was made on.
            const perMonitor = identity[String(i)] ?? {};
            monitors_layouts.forEach((layoutId, index) => {
                const key = keys[index];
                if (key && layoutId) perMonitor[key] = layoutId;
            });
            identity[String(i)] = perMonitor;
        }

        this._saving = true;
        try {
            Settings.save_selected_layouts(to_be_saved);
            Settings.save_selected_layouts_by_monitor(identity);
        } finally {
            this._saving = false;
        }
    }

    get layouts(): Layout[] {
        return this._layouts;
    }

    public addLayout(newLay: Layout) {
        this._layouts.push(newLay);
        // easy way to trigger save and signal emission
        this.layouts = this._layouts;
    }

    public deleteLayout(layoutToDelete: Layout) {
        const layFoundIndex = this._layouts.findIndex(
            (lay) => lay.id === layoutToDelete.id,
        );
        if (layFoundIndex === -1) return;

        this._layouts.splice(layFoundIndex, 1);

        // easy way to trigger a save and emit layouts-changed signal
        this.layouts = this._layouts;

        this._selected_layouts.forEach((monitors_selected) => {
            if (
                layoutToDelete.id ===
                monitors_selected[Main.layoutManager.primaryIndex]
            ) {
                monitors_selected[Main.layoutManager.primaryIndex] =
                    this._layouts[0].id;
                this._save_selected_layouts();
            }
        });
    }

    public editLayout(newLay: Layout) {
        const layFoundIndex = this._layouts.findIndex(
            (lay) => lay.id === newLay.id,
        );
        if (layFoundIndex === -1) return;

        this._layouts[layFoundIndex] = newLay;
        // easy way to trigger save and signal emission
        this.layouts = this._layouts;
    }

    public swapLayouts(first: number, second: number) {
        const tmp = this._layouts[first];
        this._layouts[first] = this._layouts[second];
        this._layouts[second] = tmp;
        // easy way to trigger save and signal emission
        this.layouts = this._layouts;
    }

    set layouts(layouts: Layout[]) {
        this._layouts = layouts;
        Settings.save_layouts_json(layouts);
        this.emit(GlobalState.SIGNAL_LAYOUTS_CHANGED);
    }

    public getSelectedLayoutOfMonitor(
        monitorIndex: number,
        workspaceIndex: number,
    ): Layout {
        const selectedLayouts = Settings.get_selected_layouts();
        if (workspaceIndex < 0 || workspaceIndex >= selectedLayouts.length)
            workspaceIndex = 0;

        const monitors_selected =
            workspaceIndex < selectedLayouts.length
                ? selectedLayouts[workspaceIndex]
                : GlobalState.get().layouts[0].id;
        if (monitorIndex < 0 || monitorIndex >= monitors_selected.length)
            monitorIndex = 0;

        return (
            this._layouts.find(
                (lay) => lay.id === monitors_selected[monitorIndex],
            ) || this._layouts[0]
        );
    }

    public get tilePreviewAnimationTime(): number {
        return this._tilePreviewAnimationTime;
    }

    public set tilePreviewAnimationTime(value: number) {
        this._tilePreviewAnimationTime = value;
    }

    public setSelectedLayoutOfMonitor(
        layoutToSelectId: string,
        monitorIndex: number,
    ) {
        const selected = Settings.get_selected_layouts();
        const activeIndex =
            global.workspaceManager.get_active_workspace_index();

        if (Settings.SYNC_LAYOUT_ACROSS_WORKSPACES) {
            for (let i = 0; i < selected.length; i++) {
                if (selected[i]) selected[i][monitorIndex] = layoutToSelectId;
            }
        } else {
            if (!selected[activeIndex]) return;
            selected[activeIndex][monitorIndex] = layoutToSelectId;

            const n_workspaces = global.workspaceManager.get_n_workspaces();
            if (activeIndex === n_workspaces - 2) {
                const lastWs = global.workspaceManager.get_workspace_by_index(
                    n_workspaces - 1,
                );
                if (!lastWs) return;

                const tiledWindows = getWindows(lastWs).find(
                    (win) =>
                        (win as ExtendedWindow).assignedTile &&
                        win.get_monitor() === monitorIndex,
                );
                if (!tiledWindows && selected[lastWs.index()]) {
                    selected[lastWs.index()][monitorIndex] = layoutToSelectId;
                }
            }
        }

        // Mirror the rows we just wrote into the live map, then persist through
        // _save_selected_layouts so each choice is recorded against the physical
        // monitor rather than only its current index. Saving the positional array
        // on its own leaves the identity map stale, and the next dock event would
        // then resurrect the layout it was superseded by.
        const wsCount = global.workspaceManager.get_n_workspaces();
        for (let i = 0; i < wsCount; i++) {
            const ws = global.workspaceManager.get_workspace_by_index(i);
            if (ws && selected[i]) this._selected_layouts.set(ws, selected[i]);
        }

        this._save_selected_layouts();
    }
}
