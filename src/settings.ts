import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Layout from './components/layout/Layout';
import Tile from './components/layout/Tile';

export enum ActivationKey {
    NONE = -1,
    CTRL = 0,
    ALT,
    SUPER,
}

export default class Settings {
    static _settings: Gio.Settings | null;
    static _is_initialized: boolean = false;

    static SETTING_LAST_VERSION_NAME_INSTALLED = 'last-version-name-installed';
    static SETTING_OVERRIDDEN_SETTINGS = 'overridden-settings';
    static SETTING_TILING_SYSTEM = 'enable-tiling-system';
    static SETTING_TILING_SYSTEM_ACTIVATION_KEY =
        'tiling-system-activation-key';
    static SETTING_SNAP_ASSIST = 'enable-snap-assist';
    static SETTING_SHOW_INDICATOR = 'show-indicator';
    static SETTING_INNER_GAPS = 'inner-gaps';
    static SETTING_OUTER_GAPS = 'outer-gaps';
    static SETTING_SPAN_MULTIPLE_TILES = 'enable-span-multiple-tiles';
    static SETTING_SPAN_MULTIPLE_TILES_ACTIVATION_KEY =
        'span-multiple-tiles-activation-key';
    static SETTING_LAYOUTS_JSON = 'layouts-json';
    static SETTING_SELECTED_LAYOUTS = 'selected-layouts';
    static SETTING_RESTORE_WINDOW_ORIGINAL_SIZE =
        'restore-window-original-size';
    static SETTING_RESIZE_COMPLEMENTING_WINDOWS =
        'resize-complementing-windows';
    static SETTING_ENABLE_BLUR_SNAP_ASSISTANT = 'enable-blur-snap-assistant';
    static SETTING_ENABLE_BLUR_SELECTED_TILEPREVIEW =
        'enable-blur-selected-tilepreview';
    static SETTING_ENABLE_MOVE_KEYBINDINGS = 'enable-move-keybindings';
    static SETTING_ACTIVE_SCREEN_EDGES = 'active-screen-edges';
    static SETTING_TOP_EDGE_MAXIMIZE = 'top-edge-maximize';

    static SETTING_MOVE_WINDOW_RIGHT = 'move-window-right';
    static SETTING_MOVE_WINDOW_LEFT = 'move-window-left';
    static SETTING_MOVE_WINDOW_UP = 'move-window-up';
    static SETTING_MOVE_WINDOW_DOWN = 'move-window-down';

    static initialize(settings: Gio.Settings) {
        if (this._is_initialized) return;

        this._is_initialized = true;
        this._settings = settings;
    }

    static destroy() {
        if (this._is_initialized) {
            this._is_initialized = false;
            this._settings = null;
        }
    }

    static bind(
        key: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        object: GObject.Object | any,
        property: string,
        flags: Gio.SettingsBindFlags = Gio.SettingsBindFlags.DEFAULT,
    ): void {
        this._settings?.bind(key, object, property, flags);
    }

    static get_last_version_installed(): string {
        return (
            this._settings?.get_string(
                this.SETTING_LAST_VERSION_NAME_INSTALLED,
            ) ?? '0'
        );
    }

    static get_tiling_system_enabled(): boolean {
        return this._settings?.get_boolean(this.SETTING_TILING_SYSTEM) ?? false;
    }

    static get_snap_assist_enabled(): boolean {
        return this._settings?.get_boolean(this.SETTING_SNAP_ASSIST) ?? false;
    }

    static get_show_indicator(): boolean {
        if (!this._settings) return true;
        return this._settings.get_boolean(this.SETTING_SHOW_INDICATOR);
    }

    static get_inner_gaps(scaleFactor: number = 1): {
        top: number;
        bottom: number;
        left: number;
        right: number;
    } {
        // get the gaps settings and scale by scale factor
        const value =
            (this._settings?.get_uint(this.SETTING_INNER_GAPS) ?? 0) *
            scaleFactor;
        return {
            top: value,
            bottom: value,
            left: value,
            right: value,
        };
    }

    static get_outer_gaps(scaleFactor: number = 1): {
        top: number;
        bottom: number;
        left: number;
        right: number;
    } {
        // get the gaps settings and scale by scale factor
        const value =
            (this._settings?.get_uint(this.SETTING_OUTER_GAPS) ?? 0) *
            scaleFactor;
        return {
            top: value,
            bottom: value,
            left: value,
            right: value,
        };
    }

    static get_span_multiple_tiles(): boolean {
        return (
            this._settings?.get_boolean(this.SETTING_SPAN_MULTIPLE_TILES) ??
            false
        );
    }

    static get_layouts_json(): Layout[] {
        try {
            const layouts = JSON.parse(
                this._settings?.get_string(this.SETTING_LAYOUTS_JSON) || '[]',
            ) as Layout[];
            if (layouts.length === 0)
                throw new Error('At least one layout is required');
            return layouts.filter((layout) => layout.tiles.length > 0);
        } catch (ex: unknown) {
            this.reset_layouts_json();
            return JSON.parse(
                this._settings?.get_string(this.SETTING_LAYOUTS_JSON) || '[]',
            ) as Layout[];
        }
    }

    static get_selected_layouts(): string[] {
        return (
            this._settings?.get_strv(Settings.SETTING_SELECTED_LAYOUTS) || []
        );
    }

    static get_restore_window_original_size(): boolean {
        return (
            this._settings?.get_boolean(
                Settings.SETTING_RESTORE_WINDOW_ORIGINAL_SIZE,
            ) ?? false
        );
    }

    static get_resize_complementing_windows(): boolean {
        return (
            this._settings?.get_boolean(
                Settings.SETTING_RESIZE_COMPLEMENTING_WINDOWS,
            ) ?? false
        );
    }

    static get_tiling_system_activation_key(): ActivationKey {
        const val = this._settings?.get_strv(
            this.SETTING_TILING_SYSTEM_ACTIVATION_KEY,
        );
        if (!val || val.length === 0) return ActivationKey.CTRL;
        return Number(val[0]);
    }

    static get_span_multiple_tiles_activation_key(): ActivationKey {
        const val = this._settings?.get_strv(
            this.SETTING_SPAN_MULTIPLE_TILES_ACTIVATION_KEY,
        );
        if (!val || val.length === 0) return ActivationKey.ALT;
        return Number(val[0]);
    }

    static get_enable_blur_snap_assistant(): boolean {
        return (
            this._settings?.get_boolean(
                this.SETTING_ENABLE_BLUR_SNAP_ASSISTANT,
            ) ?? false
        );
    }

    static get_enable_blur_selected_tilepreview(): boolean {
        return (
            this._settings?.get_boolean(
                this.SETTING_ENABLE_BLUR_SELECTED_TILEPREVIEW,
            ) ?? false
        );
    }

    static get_enable_move_keybindings(): boolean {
        return (
            this._settings?.get_boolean(this.SETTING_ENABLE_MOVE_KEYBINDINGS) ??
            false
        );
    }

    static get_overridden_settings(): string {
        return (
            this._settings?.get_string(this.SETTING_OVERRIDDEN_SETTINGS) ?? '{}'
        );
    }

    static get_active_screen_edges(): boolean {
        return (
            this._settings?.get_boolean(this.SETTING_ACTIVE_SCREEN_EDGES) ??
            false
        );
    }

    static get_top_edge_maximize(): boolean {
        return (
            this._settings?.get_boolean(this.SETTING_TOP_EDGE_MAXIMIZE) ?? false
        );
    }

    static set_last_version_installed(version: string) {
        this._settings?.set_string(
            this.SETTING_LAST_VERSION_NAME_INSTALLED,
            version,
        );
    }

    static set_tiling_system_activation_key(key: ActivationKey) {
        this._settings?.set_strv(this.SETTING_TILING_SYSTEM_ACTIVATION_KEY, [
            String(key),
        ]);
    }

    static set_span_multiple_tiles_activation_key(key: ActivationKey) {
        this._settings?.set_strv(
            this.SETTING_SPAN_MULTIPLE_TILES_ACTIVATION_KEY,
            [String(key)],
        );
    }

    static set_show_indicator(value: boolean) {
        this._settings?.set_boolean(this.SETTING_SHOW_INDICATOR, value);
    }

    static set_overridden_settings(newVal: string): boolean {
        return (
            this._settings?.set_string(
                this.SETTING_OVERRIDDEN_SETTINGS,
                newVal,
            ) ?? false
        );
    }

    static set_kb_move_window_right(newVal: string): boolean {
        return (
            this._settings?.set_strv(this.SETTING_MOVE_WINDOW_RIGHT, [
                newVal,
            ]) ?? false
        );
    }

    static set_kb_move_window_left(newVal: string): boolean {
        return (
            this._settings?.set_strv(this.SETTING_MOVE_WINDOW_LEFT, [newVal]) ??
            false
        );
    }

    static set_kb_move_window_up(newVal: string): boolean {
        return (
            this._settings?.set_strv(this.SETTING_MOVE_WINDOW_UP, [newVal]) ??
            false
        );
    }

    static set_kb_move_window_down(newVal: string): boolean {
        return (
            this._settings?.set_strv(this.SETTING_MOVE_WINDOW_DOWN, [newVal]) ??
            false
        );
    }

    static reset_layouts_json() {
        this.save_layouts_json([
            new Layout(
                [
                    new Tile({
                        x: 0,
                        y: 0,
                        height: 0.5,
                        width: 0.22,
                        groups: [1, 2],
                    }), // top-left
                    new Tile({
                        x: 0,
                        y: 0.5,
                        height: 0.5,
                        width: 0.22,
                        groups: [1, 2],
                    }), // bottom-left
                    new Tile({
                        x: 0.22,
                        y: 0,
                        height: 1,
                        width: 0.56,
                        groups: [2, 3],
                    }), // center
                    new Tile({
                        x: 0.78,
                        y: 0,
                        height: 0.5,
                        width: 0.22,
                        groups: [3, 4],
                    }), // top-right
                    new Tile({
                        x: 0.78,
                        y: 0.5,
                        height: 0.5,
                        width: 0.22,
                        groups: [3, 4],
                    }), // bottom-right
                ],
                'Layout 1',
            ),
            new Layout(
                [
                    new Tile({
                        x: 0,
                        y: 0,
                        height: 1,
                        width: 0.22,
                        groups: [1],
                    }),
                    new Tile({
                        x: 0.22,
                        y: 0,
                        height: 1,
                        width: 0.56,
                        groups: [1, 2],
                    }),
                    new Tile({
                        x: 0.78,
                        y: 0,
                        height: 1,
                        width: 0.22,
                        groups: [2],
                    }),
                ],
                'Layout 2',
            ),
            new Layout(
                [
                    new Tile({
                        x: 0,
                        y: 0,
                        height: 1,
                        width: 0.33,
                        groups: [1],
                    }),
                    new Tile({
                        x: 0.33,
                        y: 0,
                        height: 1,
                        width: 0.67,
                        groups: [1],
                    }),
                ],
                'Layout 3',
            ),
            new Layout(
                [
                    new Tile({
                        x: 0,
                        y: 0,
                        height: 1,
                        width: 0.67,
                        groups: [1],
                    }),
                    new Tile({
                        x: 0.67,
                        y: 0,
                        height: 1,
                        width: 0.33,
                        groups: [1],
                    }),
                ],
                'Layout 4',
            ),
        ]);
    }

    static save_layouts_json(layouts: Layout[]) {
        this._settings?.set_string(
            this.SETTING_LAYOUTS_JSON,
            JSON.stringify(layouts),
        );
    }

    static save_selected_layouts_json(ids: string[]) {
        this._settings?.set_strv(Settings.SETTING_SELECTED_LAYOUTS, ids);
    }

    static get_kb_move_window_right(): string {
        return (
            this._settings?.get_strv(this.SETTING_MOVE_WINDOW_RIGHT)[0] ?? ''
        );
    }

    static get_kb_move_window_left(): string {
        return this._settings?.get_strv(this.SETTING_MOVE_WINDOW_LEFT)[0] ?? '';
    }

    static get_kb_move_window_up(): string {
        return this._settings?.get_strv(this.SETTING_MOVE_WINDOW_UP)[0] ?? '';
    }

    static get_kb_move_window_down(): string {
        return this._settings?.get_strv(this.SETTING_MOVE_WINDOW_DOWN)[0] ?? '';
    }

    static connect(key: string, func: (...arg: unknown[]) => void): number {
        return this._settings?.connect(`changed::${key}`, func) || -1;
    }

    static disconnect(id: number) {
        this._settings?.disconnect(id);
    }
}
