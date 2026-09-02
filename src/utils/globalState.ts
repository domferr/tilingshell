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
                const selected_layouts = Settings.get_selected_layouts();
                if (selected_layouts.length === 0) {
                    this.validate_selected_layouts();
                    return;
                }

                const defaultLayout: Layout = this._layouts[0];
                const n_monitors = Main.layoutManager.monitors.length;
                const n_workspaces = global.workspaceManager.get_n_workspaces();
                for (let i = 0; i < n_workspaces; i++) {
                    const ws =
                        global.workspaceManager.get_workspace_by_index(i);
                    if (!ws) continue;

                    const monitors_layouts =
                        i < selected_layouts.length
                            ? selected_layouts[i]
                            : [defaultLayout.id];
                    while (monitors_layouts.length < n_monitors)
                        monitors_layouts.push(defaultLayout.id);
                    while (monitors_layouts.length > n_monitors)
                        monitors_layouts.pop();

                    this._selected_layouts.set(ws, monitors_layouts);
                }
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

                const to_be_saved: string[][] = [];
                for (let i = 0; i < n_workspaces; i++) {
                    const ws =
                        global.workspaceManager.get_workspace_by_index(i);
                    if (!ws) continue;
                    const monitors_layouts = this._selected_layouts.get(ws);
                    if (!monitors_layouts) continue;
                    to_be_saved.push(monitors_layouts);
                }

                this._persistSelectedLayouts(to_be_saved);
            },
        );

        this._signals.connect(
            global.workspaceManager,
            'workspace-removed',
            () => {
                const newMap: Map<Meta.Workspace, string[]> = new Map();
                const n_workspaces = global.workspaceManager.get_n_workspaces();
                const to_be_saved: string[][] = [];
                for (let i = 0; i < n_workspaces; i++) {
                    const ws =
                        global.workspaceManager.get_workspace_by_index(i);
                    if (!ws) continue;
                    const monitors_layouts = this._selected_layouts.get(ws);
                    if (!monitors_layouts) continue;

                    this._selected_layouts.delete(ws);
                    newMap.set(ws, monitors_layouts);
                    to_be_saved.push(monitors_layouts);
                }
                this._persistSelectedLayouts(to_be_saved);

                this._selected_layouts.clear();
                this._selected_layouts = newMap;
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
        const n_monitors = Main.layoutManager.monitors.length;
        const currentSignatures = this._getMonitorSignatures();
        const topologyMatch = this._findTopologyMatch(
            Settings.get_selected_layouts_by_topology(),
            currentSignatures,
        );
        const defaultLayoutId = this._layouts[0].id;
        let old_selected_layouts =
            topologyMatch?.selections ?? Settings.get_selected_layouts();
        if (topologyMatch) {
            const fromKey = this._buildTopologyKey(
                topologyMatch.signatures,
            );
            if (fromKey !== this._buildTopologyKey(currentSignatures)) {
                old_selected_layouts = this._remapSelections(
                    old_selected_layouts,
                    topologyMatch.signatures,
                    currentSignatures,
                    defaultLayoutId,
                );
            }
        }
        for (let i = 0; i < global.workspaceManager.get_n_workspaces(); i++) {
            const ws = global.workspaceManager.get_workspace_by_index(i);
            if (!ws) continue;

            const monitors_layouts =
                i < old_selected_layouts.length ? old_selected_layouts[i] : [];
            while (monitors_layouts.length < n_monitors)
                monitors_layouts.push(defaultLayoutId);
            while (monitors_layouts.length > n_monitors) monitors_layouts.pop();

            monitors_layouts.forEach((_, ind) => {
                if (
                    this._layouts.findIndex(
                        (lay) => lay.id === monitors_layouts[ind],
                    ) === -1
                )
                    monitors_layouts[ind] = monitors_layouts[0];
            });

            this._selected_layouts.set(ws, monitors_layouts);
        }

        this._save_selected_layouts();
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

        this._persistSelectedLayouts(to_be_saved);
    }

    private _persistSelectedLayouts(selectedLayouts: string[][]) {
        Settings.save_selected_layouts(selectedLayouts);
        const topologyMap = Settings.get_selected_layouts_by_topology();
        const topologyKey = this._buildTopologyKey(
            this._getMonitorSignatures(),
        );
        if (selectedLayouts.length === 0) {
            delete topologyMap[topologyKey];
        } else {
            topologyMap[topologyKey] = selectedLayouts;
        }
        Settings.save_selected_layouts_by_topology(topologyMap);
    }

    private _getMonitorSignatures(): string[] {
        return Main.layoutManager.monitors.map((monitor) => {
            const geometryScale =
                (monitor as { geometryScale?: number }).geometryScale ??
                (monitor as { geometry_scale?: number }).geometry_scale ??
                (monitor as { scale?: number }).scale ??
                (monitor as { scaleFactor?: number }).scaleFactor ??
                1;
            return `${monitor.x},${monitor.y},${monitor.width},${monitor.height},${geometryScale}`;
        });
    }

    private _buildTopologyKey(signatures: string[]): string {
        return signatures.join('|');
    }

    private _findTopologyMatch(
        topologyMap: Record<string, string[][]>,
        currentSignatures: string[],
    ): { selections: string[][]; signatures: string[] } | null {
        const exactKey = this._buildTopologyKey(currentSignatures);
        if (topologyMap[exactKey]) {
            return {
                selections: topologyMap[exactKey],
                signatures: currentSignatures,
            };
        }

        for (const [key, selections] of Object.entries(topologyMap)) {
            const signatures = key.length > 0 ? key.split('|') : [];
            if (this._signaturesMatch(signatures, currentSignatures)) {
                return {
                    selections,
                    signatures,
                };
            }
        }

        return null;
    }

    private _signaturesMatch(
        source: string[],
        target: string[],
    ): boolean {
        if (source.length !== target.length) return false;
        const counts = new Map<string, number>();
        source.forEach((signature) => {
            counts.set(signature, (counts.get(signature) ?? 0) + 1);
        });
        for (const signature of target) {
            const count = counts.get(signature);
            if (!count) return false;
            if (count === 1) counts.delete(signature);
            else counts.set(signature, count - 1);
        }
        return counts.size === 0;
    }

    private _remapSelections(
        selections: string[][],
        fromSignatures: string[],
        toSignatures: string[],
        defaultLayoutId: string,
    ): string[][] {
        const indexMap = toSignatures.map((signature) =>
            fromSignatures.indexOf(signature),
        );
        return selections.map((workspaceSelections) => {
            const remapped: string[] = [];
            for (let i = 0; i < toSignatures.length; i++) {
                const fromIndex = indexMap[i];
                const layoutId =
                    fromIndex >= 0
                        ? workspaceSelections?.[fromIndex]
                        : undefined;
                remapped.push(layoutId ?? defaultLayoutId);
            }
            return remapped;
        });
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
        // get the currently selected layouts
        const selected = Settings.get_selected_layouts();
        // select the layout for the given monitor
        selected[global.workspaceManager.get_active_workspace_index()][
            monitorIndex
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
                selected[lastWs.index()][monitorIndex] = layoutToSelectId;
            }
        }

        this._persistSelectedLayouts(selected);
    }
}
