import { registerGObjectClass } from '@utils/gjs';
import Layout from '../components/layout/Layout';
import Settings from '../settings/settings';
import SignalHandling from './signalHandling';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
        Settings.bind(
            Settings.SETTING_TILE_PREVIEW_ANIMATION_TIME,
            this,
            'tilePreviewAnimationTime',
            Gio.SettingsBindFlags.GET,
        );
        this._signals.connect(Settings, Settings.SETTING_LAYOUTS_JSON, () => {
            this._layouts = Settings.get_layouts_json();
            this.emit(GlobalState.SIGNAL_LAYOUTS_CHANGED);
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

        const selectedLayouts = Settings.get_selected_layouts();
        if (
            layoutToDelete.id ===
            selectedLayouts[Main.layoutManager.primaryIndex]
        ) {
            selectedLayouts[Main.layoutManager.primaryIndex] =
                this._layouts[0].id;
            Settings.save_selected_layouts_json(selectedLayouts);
        }
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

    public getSelectedLayoutOfMonitor(monitorIndex: number): Layout {
        const selectedLayouts = Settings.get_selected_layouts();
        if (monitorIndex < 0 || monitorIndex >= selectedLayouts.length)
            monitorIndex = 0;

        return (
            this._layouts.find(
                (lay) => lay.id === selectedLayouts[monitorIndex],
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
