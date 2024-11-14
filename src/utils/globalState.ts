import { registerGObjectClass } from '@utils/gjs';
import Layout from '../components/layout/Layout';
import Settings from '../settings/settings';
import SignalHandling from './signalHandling';
import { GObject, Meta, Gio } from '@gi.ext';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { logger } from './logger';

const debug = logger('GlobalState');

@registerGObjectClass
export default class GlobalState extends GObject.Object {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
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
    };

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

                const n_monitors = Main.layoutManager.monitors.length;
                const n_workspaces = global.workspaceManager.get_n_workspaces();
                for (let i = 0; i < n_workspaces; i++) {
                    const ws =
                        global.workspaceManager.get_workspace_by_index(i);
                    if (!ws) continue;

                    const monitors_layouts =
                        i < selected_layouts.length
                            ? selected_layouts[i]
                            : [GlobalState.get().layouts[0].id];
                    while (monitors_layouts.length < n_monitors)
                        monitors_layouts.push(this._layouts[0].id);
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
                const newWs =
                    global.workspaceManager.get_workspace_by_index(index);
                if (!newWs) return;

                const layout: Layout = this._layouts[0];
                debug(`added workspace ${index}`);
                this._selected_layouts.set(
                    newWs,
                    Main.layoutManager.monitors.map(() => layout.id),
                );

                const to_be_saved: string[][] = [];
                const n_workspaces = global.workspaceManager.get_n_workspaces();
                for (let i = 0; i < n_workspaces; i++) {
                    const ws =
                        global.workspaceManager.get_workspace_by_index(i);
                    if (!ws) continue;
                    const monitors_layouts = this._selected_layouts.get(ws);
                    if (!monitors_layouts) continue;
                    to_be_saved.push(monitors_layouts);
                }

                Settings.save_selected_layouts(to_be_saved);
            },
        );

        this._signals.connect(
            global.workspaceManager,
            'workspace-removed',
            (_) => {
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
                Settings.save_selected_layouts(to_be_saved);

                this._selected_layouts.clear();
                this._selected_layouts = newMap;
                debug('deleted workspace');
            },
        );

        this._signals.connect(
            global.workspaceManager,
            'workspaces-reordered',
            (_) => {
                this._save_selected_layouts();
                debug('reordered workspaces');
            },
        );
    }

    public validate_selected_layouts() {
        const n_monitors = Main.layoutManager.monitors.length;
        const old_selected_layouts = Settings.get_selected_layouts();
        for (let i = 0; i < global.workspaceManager.get_n_workspaces(); i++) {
            const ws = global.workspaceManager.get_workspace_by_index(i);
            if (!ws) continue;

            const monitors_layouts =
                i < old_selected_layouts.length ? old_selected_layouts[i] : [];
            while (monitors_layouts.length < n_monitors)
                monitors_layouts.push(this._layouts[0].id);
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

        Settings.save_selected_layouts(to_be_saved);
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
}
