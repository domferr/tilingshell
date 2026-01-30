import { registerGObjectClass } from '../utils/gjs';
import Layout from '../components/layout/Layout';
import Settings from '../settings/settings';
import SignalHandling from './signalHandling';
import { GObject, Meta, Gio } from '../gi/ext';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { logger } from './logger';
import { getWindows } from './ui';
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
        this._syncSelectedLayoutsFromSettings(true);

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
                this._syncSelectedLayoutsFromSettings(true);
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
        this._syncSelectedLayoutsFromSettings(true);
    }

    private _save_selected_layouts() {
        const to_be_saved: string[][] = [];
        const n_workspaces = global.workspaceManager.get_n_workspaces();
        for (let i = 0; i < n_workspaces; i++) {
            const ws = global.workspaceManager.get_workspace_by_index(i);
            if (!ws) continue;
            const monitors_layouts = this._selected_layouts.get(ws);
            if (!monitors_layouts) continue;
            to_be_saved.push(monitors_layouts);
        }

        Settings.save_selected_layouts(to_be_saved);
        const currentSignatures = this._getMonitorSignatures();
        Settings.save_selected_layouts_monitors(currentSignatures);
        const layoutsByTopology = Settings.get_selected_layouts_by_topology();
        layoutsByTopology[this._getMonitorTopologyKey(currentSignatures)] =
            to_be_saved;
        Settings.save_selected_layouts_by_topology(layoutsByTopology);
    }

    private _syncSelectedLayoutsFromSettings(saveIfChanged: boolean) {
        const n_workspaces = global.workspaceManager.get_n_workspaces();
        const defaultLayoutId = this._layouts[0]?.id;
        const currentSignatures = this._getMonitorSignatures();
        const layoutsByTopology = Settings.get_selected_layouts_by_topology();
        const topologyKey = this._getMonitorTopologyKey(currentSignatures);
        const topologyLayouts = layoutsByTopology[topologyKey];
        const savedLayouts = topologyLayouts ?? Settings.get_selected_layouts();
        const savedSignatures = topologyLayouts
            ? currentSignatures
            : Settings.get_selected_layouts_monitors();
        const changedSignatures =
            !this._areStringArraysEqual(savedSignatures, currentSignatures);
        let didRemap = false;

        for (let i = 0; i < n_workspaces; i++) {
            const ws = global.workspaceManager.get_workspace_by_index(i);
            if (!ws) continue;

            const monitors_layouts =
                i < savedLayouts.length ? savedLayouts[i] : [];
            const remapped = this._remapLayoutsForMonitors(
                monitors_layouts,
                savedSignatures,
                currentSignatures,
                defaultLayoutId,
            );
            if (!this._areStringArraysEqual(monitors_layouts, remapped))
                didRemap = true;

            this._selected_layouts.set(ws, remapped);
        }

        if (saveIfChanged && (didRemap || changedSignatures))
            this._save_selected_layouts();
    }

    private _remapLayoutsForMonitors(
        monitorsLayouts: string[],
        savedSignatures: string[],
        currentSignatures: string[],
        fallbackLayoutId: string,
    ): string[] {
        const mapped: string[] = [];
        currentSignatures.forEach((signature) => {
            const savedIndex = savedSignatures.indexOf(signature);
            const layoutId =
                savedIndex >= 0 ? monitorsLayouts[savedIndex] : undefined;
            mapped.push(layoutId ?? fallbackLayoutId);
        });

        return mapped.map((layoutId) => {
            const exists = this._layouts.find((lay) => lay.id === layoutId);
            return exists ? layoutId : fallbackLayoutId;
        });
    }

    private _getMonitorSignatures(): string[] {
        return Main.layoutManager.monitors.map(
            (monitor) => {
                const geometryScale = monitor.geometryScale ?? 1;
                return `${monitor.x},${monitor.y},${monitor.width},${monitor.height},${geometryScale}`;
            },
        );
    }

    private _getMonitorTopologyKey(signatures: string[]): string {
        return signatures.join('||');
    }

    private _areStringArraysEqual(a: string[], b: string[]): boolean {
        if (a.length !== b.length) return false;
        return a.every((value, index) => value === b[index]);
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
                monitors_selected[this._getPrimaryMonitorIndex()]
            ) {
                monitors_selected[this._getPrimaryMonitorIndex()] =
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
        const settingsMonitorIndex =
            this._getMonitorIndexInSettings(monitorIndex);
        if (
            settingsMonitorIndex < 0 ||
            settingsMonitorIndex >= monitors_selected.length
        )
            monitorIndex = 0;

        return (
            this._layouts.find(
                (lay) => lay.id === monitors_selected[settingsMonitorIndex],
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
        // get the currently selected layouts
        const selected = Settings.get_selected_layouts();
        const settingsMonitorIndex =
            this._getMonitorIndexInSettings(monitorIndex);
        // select the layout for the given monitor
        selected[global.workspaceManager.get_active_workspace_index()][
            settingsMonitorIndex
        ] = layoutToSelectId;

        // if there are 2 or more workspaces, if the last workspace is empty
        // it must follow the layout of the second-last workspace
        // if we changed the second-last workspace we take care of changing
        // the last workspace as well, if there aren't tiled windows (is empty)
        const n_workspaces = global.workspaceManager.get_n_workspaces();
        if (
            global.workspaceManager.get_active_workspace_index() ===
            n_workspaces - 2
        ) {
            const lastWs = global.workspaceManager.get_workspace_by_index(
                n_workspaces - 1,
            );
            if (!lastWs) return;

            // check if there are tiled windows on that monitor and in the last workspace
            const tiledWindows = getWindows(lastWs).find(
                (win) =>
                    (win as ExtendedWindow).assignedTile &&
                    win.get_monitor() === monitorIndex,
            );
            if (!tiledWindows) {
                // the last workspace, on that monitor, is empty
                // select the same layout for last workspace as well
                selected[lastWs.index()][settingsMonitorIndex] =
                    layoutToSelectId;
            }
        }

        Settings.save_selected_layouts(selected);
        Settings.save_selected_layouts_monitors(this._getMonitorSignatures());
    }

    private _getMonitorIndexInSettings(monitorIndex: number): number {
        const currentSignatures = this._getMonitorSignatures();
        const savedSignatures = Settings.get_selected_layouts_monitors();
        const signature =
            monitorIndex >= 0 && monitorIndex < currentSignatures.length
                ? currentSignatures[monitorIndex]
                : undefined;
        const savedIndex = signature
            ? savedSignatures.indexOf(signature)
            : -1;
        if (savedIndex !== -1) return savedIndex;
        return monitorIndex;
    }

    private _getPrimaryMonitorIndex(): number {
        return this._getMonitorIndexInSettings(
            Main.layoutManager.primaryIndex,
        );
    }
}
