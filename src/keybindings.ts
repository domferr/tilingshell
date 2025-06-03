import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { GObject, Meta, Gio, Shell, GLib, Clutter } from '@gi.ext';
import Settings from '@settings/settings';
import SettingsOverride from '@settings/settingsOverride';
import SignalHandling from '@utils/signalHandling';
import { registerGObjectClass } from '@utils/gjs';
import { logger } from '@utils/logger';

const debug = logger('KeyBindings');

export enum KeyBindingsDirection {
    NODIRECTION = 1,
    UP,
    DOWN,
    LEFT,
    RIGHT,
}

export enum FocusSwitchDirection {
    NEXT = 1,
    PREV,
}

@registerGObjectClass
export default class KeyBindings extends GObject.Object {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'KeyBindings',
        Signals: {
            'move-window': {
                param_types: [Meta.Display.$gtype, GObject.TYPE_INT], // Meta.Display, KeyBindingsDirection
            },
            'span-window': {
                param_types: [Meta.Display.$gtype, GObject.TYPE_INT], // Meta.Display, KeyBindingsDirection
            },
            'span-window-all-tiles': {
                param_types: [Meta.Display.$gtype], // Meta.Display
            },
            'untile-window': {
                param_types: [Meta.Display.$gtype], // Meta.Display
            },
            'move-window-center': {
                param_types: [Meta.Display.$gtype], // Meta.Display
            },
            'focus-window-direction': {
                param_types: [Meta.Display.$gtype, GObject.TYPE_INT], // Meta.Display, KeyBindingsDirection
            },
            'focus-window': {
                param_types: [Meta.Display.$gtype, GObject.TYPE_INT], // Meta.Display, FocusSwitchDirection
            },
            'highlight-current-window': {
                param_types: [Meta.Display.$gtype], // Meta.Display
            },
            'cycle-layouts': {
                param_types: [
                    Meta.Display.$gtype,
                    GObject.TYPE_INT,
                    GObject.TYPE_INT,
                ], // Meta.Display, number, number
            },
        },
    };

    private _signals: SignalHandling;

    constructor(extensionSettings: Gio.Settings) {
        super();

        this._signals = new SignalHandling();

        this._signals.connect(
            Settings,
            Settings.KEY_ENABLE_MOVE_KEYBINDINGS,
            () => {
                this._setupKeyBindings(extensionSettings);
            },
        );
        if (Settings.ENABLE_MOVE_KEYBINDINGS)
            this._setupKeyBindings(extensionSettings);
    }

    private _setupKeyBindings(extensionSettings: Gio.Settings) {
        if (Settings.ENABLE_MOVE_KEYBINDINGS)
            this._applyKeybindings(extensionSettings);
        else this._removeKeybindings();
    }

    private _applyKeybindings(extensionSettings: Gio.Settings) {
        // Disable native keybindings for Super + Left/Right
        this._overrideNatives(extensionSettings);

        Main.wm.addKeybinding(
            Settings.SETTING_SPAN_WINDOW_RIGHT,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit('span-window', display, KeyBindingsDirection.RIGHT);
            },
        );

        Main.wm.addKeybinding(
            Settings.SETTING_SPAN_WINDOW_LEFT,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit('span-window', display, KeyBindingsDirection.LEFT);
            },
        );

        Main.wm.addKeybinding(
            Settings.SETTING_SPAN_WINDOW_UP,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit('span-window', display, KeyBindingsDirection.UP);
            },
        );

        Main.wm.addKeybinding(
            Settings.SETTING_SPAN_WINDOW_DOWN,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit('span-window', display, KeyBindingsDirection.DOWN);
            },
        );

        Main.wm.addKeybinding(
            Settings.SETTING_SPAN_WINDOW_ALL_TILES,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit('span-window-all-tiles', display);
            },
        );

        // untile window with keybinding
        Main.wm.addKeybinding(
            Settings.SETTING_UNTILE_WINDOW,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (dp: Meta.Display) => this.emit('untile-window', dp),
        );

        // center the window with keybinding
        Main.wm.addKeybinding(
            Settings.SETTING_MOVE_WINDOW_CENTER,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (dp: Meta.Display) => this.emit('move-window-center', dp),
        );

        Main.wm.addKeybinding(
            Settings.SETTING_FOCUS_WINDOW_RIGHT,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit(
                    'focus-window-direction',
                    display,
                    KeyBindingsDirection.RIGHT,
                );
            },
        );

        Main.wm.addKeybinding(
            Settings.SETTING_FOCUS_WINDOW_LEFT,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit(
                    'focus-window-direction',
                    display,
                    KeyBindingsDirection.LEFT,
                );
            },
        );

        Main.wm.addKeybinding(
            Settings.SETTING_FOCUS_WINDOW_UP,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit(
                    'focus-window-direction',
                    display,
                    KeyBindingsDirection.UP,
                );
            },
        );

        Main.wm.addKeybinding(
            Settings.SETTING_FOCUS_WINDOW_DOWN,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit(
                    'focus-window-direction',
                    display,
                    KeyBindingsDirection.DOWN,
                );
            },
        );

        Main.wm.addKeybinding(
            Settings.SETTING_FOCUS_WINDOW_NEXT,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit('focus-window', display, FocusSwitchDirection.NEXT);
            },
        );

        Main.wm.addKeybinding(
            Settings.SETTING_FOCUS_WINDOW_PREV,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit('focus-window', display, FocusSwitchDirection.PREV);
            },
        );

        Main.wm.addKeybinding(
            Settings.SETTING_HIGHLIGHT_CURRENT_WINDOW,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            (display: Meta.Display) => {
                this.emit('highlight-current-window', display);
            },
        );

        const action = Main.wm.addKeybinding(
            Settings.SETTING_CYCLE_LAYOUTS,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (display: Meta.Display, _, event: any) => {
                this.emit('cycle-layouts', display, action, event.get_mask());
            },
        );
    }

    private _overrideNatives(extensionSettings: Gio.Settings) {
        // Disable native keybindings for Super + Left/Right
        const mutterKeybindings = new Gio.Settings({
            schema_id: 'org.gnome.mutter.keybindings',
        });
        this._overrideKeyBinding(
            Settings.SETTING_MOVE_WINDOW_RIGHT,
            (display: Meta.Display) => {
                this.emit('move-window', display, KeyBindingsDirection.RIGHT);
            },
            extensionSettings,
            mutterKeybindings,
            'toggle-tiled-right',
        );
        this._overrideKeyBinding(
            Settings.SETTING_MOVE_WINDOW_LEFT,
            (display: Meta.Display) => {
                this.emit('move-window', display, KeyBindingsDirection.LEFT);
            },
            extensionSettings,
            mutterKeybindings,
            'toggle-tiled-left',
        );

        // Disable native keybindings for Super + Up/Down
        const desktopWm = new Gio.Settings({
            schema_id: 'org.gnome.desktop.wm.keybindings',
        });
        this._overrideKeyBinding(
            Settings.SETTING_MOVE_WINDOW_UP,
            (display: Meta.Display) => {
                this.emit('move-window', display, KeyBindingsDirection.UP);
            },
            extensionSettings,
            desktopWm,
            'maximize',
        );
        this._overrideKeyBinding(
            Settings.SETTING_MOVE_WINDOW_DOWN,
            (display: Meta.Display) => {
                this.emit('move-window', display, KeyBindingsDirection.DOWN);
            },
            extensionSettings,
            desktopWm,
            'unmaximize',
        );
    }

    private _overrideKeyBinding(
        name: string,
        handler: Meta.KeyHandlerFunc,
        extensionSettings: Gio.Settings,
        nativeSettings: Gio.Settings,
        nativeKeyName: string,
    ) {
        const done = SettingsOverride.get().override(
            nativeSettings,
            nativeKeyName,
            new GLib.Variant('as', []),
        );
        if (!done) {
            debug(`failed to override ${nativeKeyName}`);
            return;
        }

        Main.wm.addKeybinding(
            name,
            extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            handler,
        );
    }

    private _removeKeybindings() {
        this._restoreNatives();
        Main.wm.removeKeybinding(Settings.SETTING_MOVE_WINDOW_RIGHT);
        Main.wm.removeKeybinding(Settings.SETTING_MOVE_WINDOW_LEFT);
        Main.wm.removeKeybinding(Settings.SETTING_MOVE_WINDOW_UP);
        Main.wm.removeKeybinding(Settings.SETTING_MOVE_WINDOW_DOWN);
        Main.wm.removeKeybinding(Settings.SETTING_SPAN_WINDOW_RIGHT);
        Main.wm.removeKeybinding(Settings.SETTING_SPAN_WINDOW_LEFT);
        Main.wm.removeKeybinding(Settings.SETTING_SPAN_WINDOW_UP);
        Main.wm.removeKeybinding(Settings.SETTING_SPAN_WINDOW_DOWN);
        Main.wm.removeKeybinding(Settings.SETTING_SPAN_WINDOW_ALL_TILES);
        Main.wm.removeKeybinding(Settings.SETTING_UNTILE_WINDOW);
        Main.wm.removeKeybinding(Settings.SETTING_MOVE_WINDOW_CENTER);
        Main.wm.removeKeybinding(Settings.SETTING_FOCUS_WINDOW_UP);
        Main.wm.removeKeybinding(Settings.SETTING_FOCUS_WINDOW_DOWN);
        Main.wm.removeKeybinding(Settings.SETTING_FOCUS_WINDOW_LEFT);
        Main.wm.removeKeybinding(Settings.SETTING_FOCUS_WINDOW_RIGHT);
        Main.wm.removeKeybinding(Settings.SETTING_FOCUS_WINDOW_NEXT);
        Main.wm.removeKeybinding(Settings.SETTING_FOCUS_WINDOW_PREV);
        Main.wm.removeKeybinding(Settings.SETTING_HIGHLIGHT_CURRENT_WINDOW);
        Main.wm.removeKeybinding(Settings.SETTING_CYCLE_LAYOUTS);
    }

    private _restoreNatives() {
        // Disable native keybindings for Super + Left/Right
        const mutterKeybindings = new Gio.Settings({
            schema_id: 'org.gnome.mutter.keybindings',
        });
        SettingsOverride.get().restoreKey(
            mutterKeybindings,
            'toggle-tiled-right',
        );
        SettingsOverride.get().restoreKey(
            mutterKeybindings,
            'toggle-tiled-left',
        );

        // Disable native keybindings for Super + Up/Down
        const desktopWm = new Gio.Settings({
            schema_id: 'org.gnome.desktop.wm.keybindings',
        });
        SettingsOverride.get().restoreKey(desktopWm, 'maximize');
        SettingsOverride.get().restoreKey(desktopWm, 'unmaximize');
    }

    public destroy() {
        this._removeKeybindings();
    }
}
