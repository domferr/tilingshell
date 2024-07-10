import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Settings from '@settings';
import SettingsOverride from '@settingsOverride';
import SignalHandling from '@signalHandling';
import { registerGObjectClass } from '@utils/gjs';
import { logger } from '@utils/shell';

const debug = logger('KeyBindings');

@registerGObjectClass
export default class KeyBindings extends GObject.Object {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'KeyBindings',
        Signals: {
            'move-window': {
                param_types: [Meta.Display.$gtype, GObject.TYPE_INT], // Meta.Display, Meta.Direction
            },
        },
    };

    private _signals: SignalHandling;

    constructor(extensionSettings: Gio.Settings) {
        super();

        this._signals = new SignalHandling();

        this._signals.connect(
            Settings,
            Settings.SETTING_ENABLE_MOVE_KEYBINDINGS,
            () => {
                this._setupKeyBindings(extensionSettings);
            },
        );
        if (Settings.get_enable_move_keybindings()) {
            this._setupKeyBindings(extensionSettings);
        }
    }

    private _setupKeyBindings(extensionSettings: Gio.Settings) {
        const enabled = Settings.get_enable_move_keybindings();
        if (enabled) this._applyKeybindings(extensionSettings);
        else this._removeKeybindings();
    }

    private _applyKeybindings(extensionSettings: Gio.Settings) {
        // Disable native keybindings for Super + Left/Right
        const mutterKeybindings = new Gio.Settings({
            schema_id: 'org.gnome.mutter.keybindings',
        });
        this._overrideKeyBinding(
            Settings.SETTING_MOVE_WINDOW_RIGHT,
            (display: Meta.Display) => {
                this.emit('move-window', display, Meta.DisplayDirection.RIGHT);
            },
            extensionSettings,
            mutterKeybindings,
            'toggle-tiled-right',
        );
        this._overrideKeyBinding(
            Settings.SETTING_MOVE_WINDOW_LEFT,
            (display: Meta.Display) => {
                this.emit('move-window', display, Meta.DisplayDirection.LEFT);
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
                this.emit('move-window', display, Meta.DisplayDirection.UP);
            },
            extensionSettings,
            desktopWm,
            'maximize',
        );
        this._overrideKeyBinding(
            Settings.SETTING_MOVE_WINDOW_DOWN,
            (display: Meta.Display) => {
                this.emit('move-window', display, Meta.DisplayDirection.DOWN);
            },
            extensionSettings,
            desktopWm,
            'unmaximize',
        );
    }

    private _removeKeybindings() {
        SettingsOverride.get().restoreAll();
        Main.wm.removeKeybinding(Settings.SETTING_MOVE_WINDOW_RIGHT);
        Main.wm.removeKeybinding(Settings.SETTING_MOVE_WINDOW_LEFT);
        Main.wm.removeKeybinding(Settings.SETTING_MOVE_WINDOW_UP);
        Main.wm.removeKeybinding(Settings.SETTING_MOVE_WINDOW_DOWN);
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

    public destroy() {
        this._removeKeybindings();
    }

    static solveV9CompatibilityIssue() {
        const mutterKeybindings = new Gio.Settings({
            schema_id: 'org.gnome.mutter.keybindings',
        });
        mutterKeybindings.reset('toggle-tiled-right');
        mutterKeybindings.reset('toggle-tiled-left');

        const desktopWm = new Gio.Settings({
            schema_id: 'org.gnome.desktop.wm.keybindings',
        });
        desktopWm.reset('maximize');
        desktopWm.reset('unmaximize');

        debug('Applied compatibility changes for v9.0/v9.1');
    }
}
