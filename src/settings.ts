import Gio from '@gi-types/gio2';
import GObject from '@gi-types/gobject2';

export default class Settings {
    static _settings: Gio.Settings;

    static SETTING_TILING_SYSTEM = 'enable-tiling-system';
    static SETTING_SNAP_ASSIST = 'enable-snap-assist';
    static SETTING_SHOW_INDICATOR = 'show-indicator';
    static SETTING_INNER_GAPS = 'inner-gaps';
    static SETTING_OUTER_GAPS = 'outer-gaps';
    static SETTING_SPAN_MULTIPLE_TILES = 'enable-span-multiple-tiles';
    
    static initialize() {
        this._settings = imports.misc.extensionUtils.getSettings();
    }

    static bind(key: string, object: GObject.Object, property: string, flags: Gio.SettingsBindFlags): void {
        this._settings.bind(key, object, property, flags);
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

    static connect(key: string, func: () => void) {
        return this._settings.connect(`changed::${key}`, func);
    }

    static disconnect(id: number) {
        this._settings.disconnect(id);
    }
}

