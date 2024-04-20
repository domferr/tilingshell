import Gio from '@gi-types/gio2';
import GObject from '@gi-types/gobject2';
import Layout from './components/layout/Layout';
import Tile from './components/layout/Tile';

export default class Settings {
    static _settings: Gio.Settings;
    static _is_initialized: boolean = false;

    static SETTING_LAST_VERSION_INSTALLED = 'last-version-installed';
    static SETTING_TILING_SYSTEM = 'enable-tiling-system';
    static SETTING_SNAP_ASSIST = 'enable-snap-assist';
    static SETTING_SHOW_INDICATOR = 'show-indicator';
    static SETTING_INNER_GAPS = 'inner-gaps';
    static SETTING_OUTER_GAPS = 'outer-gaps';
    static SETTING_SPAN_MULTIPLE_TILES = 'enable-span-multiple-tiles';
    static SETTING_LAYOUTS_JSON = 'layouts-json';
    static SETTING_SELECTED_LAYOUTS = 'selected-layouts';
    
    static initialize(settings?: Gio.Settings) {
        if (this._is_initialized) return;
        
        this._is_initialized = true;
        this._settings = settings ? settings:imports.misc.extensionUtils.getSettings();
    }

    static bind(key: string, object: GObject.Object, property: string): void {
        this._settings.bind(key, object, property, Gio.SettingsBindFlags.DEFAULT);
    }

    static get_last_version_installed() : number {
        return this._settings.get_uint(this.SETTING_LAST_VERSION_INSTALLED);
    }

    static get_tiling_system_enabled() : boolean {
        return this._settings.get_boolean(this.SETTING_TILING_SYSTEM);
    }

    static get_snap_assist_enabled() : boolean {
        return this._settings.get_boolean(this.SETTING_SNAP_ASSIST);
    }

    static get_show_indicator() : boolean {
        return this._settings.get_boolean(this.SETTING_SHOW_INDICATOR);
    }

    static get_inner_gaps(scaleFactor: number) : { top: number, bottom: number, left: number, right: number } {
        // get the gaps settings and scale by scale factor
        const value = this._settings.get_uint(this.SETTING_INNER_GAPS) * scaleFactor;
        return {
            top: value,
            bottom: value,
            left: value,
            right: value,
        };
    }

    static get_outer_gaps(scaleFactor: number) : { top: number, bottom: number, left: number, right: number } {
        // get the gaps settings and scale by scale factor
        const value = this._settings.get_uint(this.SETTING_OUTER_GAPS) * scaleFactor;
        return {
            top: value,
            bottom: value,
            left: value,
            right: value,
        };
    }

    static get_span_multiple_tiles() : boolean {
        return this._settings.get_boolean(this.SETTING_SPAN_MULTIPLE_TILES);
    }

    static get_layouts_json() : Layout[] {
        try {
            const layouts = JSON.parse(this._settings.get_string(this.SETTING_LAYOUTS_JSON)) as Layout[];
            if (layouts.length === 0) throw "At least one layout is required";
            return layouts.filter(layout => layout.tiles.length > 0);
        } catch(ex: any) {
            this.reset_layouts_json();
            return JSON.parse(this._settings.get_string(this.SETTING_LAYOUTS_JSON)) as Layout[];
        }
    }

    static set_last_version_installed(version: number) {
        this._settings.set_uint(this.SETTING_LAST_VERSION_INSTALLED, version);
    }

    static reset_layouts_json() {
        this.save_layouts_json([
            new Layout([
                new Tile({ x:0, y:0, height: 0.5, width: 0.22, groups: [1, 2] }), // top-left
                new Tile({ x:0, y:0.5, height: 0.5, width: 0.22, groups: [1, 2] }), // bottom-left
                new Tile({ x:0.22, y:0, height: 1, width: 0.56, groups: [2, 3] }), // center
                new Tile({ x:0.78, y:0, height: 0.5, width: 0.22, groups: [3, 4] }), // top-right
                new Tile({ x:0.78, y:0.5, height: 0.5, width: 0.22, groups: [3, 4] }), // bottom-right
            ], `Layout 1`),
            new Layout([
                new Tile({ x:0, y:0, height: 1, width: 0.22, groups: [1] }),
                new Tile({ x:0.22, y:0, height: 1, width: 0.56, groups: [1, 2] }),
                new Tile({ x:0.78, y:0, height: 1, width: 0.22, groups: [2] }),
            ], `Layout 2`),
            new Layout([
                new Tile({ x:0, y:0, height: 1, width: 0.33, groups: [1] }),
                new Tile({ x:0.33, y:0, height: 1, width: 0.67, groups: [1] }),
            ], `Layout 3`),
            new Layout([
                new Tile({ x:0, y:0, height: 1, width: 0.67, groups: [1] }),
                new Tile({ x:0.67, y:0, height: 1, width: 0.33, groups: [1] }),
            ], `Layout 4`),
        ]);
    }

    static save_layouts_json(layouts: Layout[]) {
        this._settings.set_string(this.SETTING_LAYOUTS_JSON, JSON.stringify(layouts));
    }

    static save_selected_layouts_json(ids: string[]) {
        this._settings.set_strv(Settings.SETTING_SELECTED_LAYOUTS, ids);
    }

    static get_selected_layouts() : string[] {
        return this._settings.get_strv(Settings.SETTING_SELECTED_LAYOUTS);
    }

    static connect(key: string, func: (...arg: any[]) => void) : number {
        return this._settings.connect(`changed::${key}`, func);
    }

    static disconnect(id: number) {
        this._settings.disconnect(id);
    }
}

