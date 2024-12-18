import { Gio, GLib } from '@gi.prefs';
import Settings from '@settings/settings';
import SettingsOverride from '@settings/settingsOverride';

const dconfPath = '/org/gnome/shell/extensions/tilingshell/';
const excludedKeys: string[] = [
    Settings.KEY_SETTING_LAYOUTS_JSON,
    Settings.KEY_LAST_VERSION_NAME_INSTALLED,
    Settings.KEY_OVERRIDDEN_SETTINGS,
];

export default class SettingsExport {
    private readonly _gioSettings: Gio.Settings;

    constructor(gioSettings: Gio.Settings) {
        this._gioSettings = gioSettings;
    }

    exportToString(): string {
        return this._excludeKeys(this._dumpDconf());
    }

    importFromString(content: string) {
        this.restoreToDefault();

        const proc = Gio.Subprocess.new(
            ['dconf', 'load', dconfPath],
            Gio.SubprocessFlags.STDIN_PIPE,
        );

        proc.communicate_utf8(content, null);

        if (!proc.get_successful()) {
            this.restoreToDefault();

            throw new Error(
                'Failed to import dconf dump file. Restoring to default...',
            );
        }
    }

    restoreToDefault() {
        Settings.ACTIVE_SCREEN_EDGES = false;
        Settings.ENABLE_MOVE_KEYBINDINGS = false;
        SettingsOverride.get().restoreAll();
        this._gioSettings
            .list_keys()
            .filter((key) => key.length > 0 && !excludedKeys.includes(key))
            .forEach((key) => this._gioSettings.reset(key));
    }

    private _dumpDconf(): string {
        const proc = Gio.Subprocess.new(
            ['dconf', 'dump', dconfPath],
            Gio.SubprocessFlags.STDOUT_PIPE,
        );

        const [, dump] = proc.communicate_utf8(null, null);

        if (proc.get_successful()) return dump;
        else throw new Error('Failed to dump dconf');
    }

    private _excludeKeys(dconfDump: string) {
        if (dconfDump.length === 0) throw new Error('Empty dconf dump');

        const keyFile = new GLib.KeyFile();
        const length = new TextEncoder().encode(dconfDump).length;

        if (!keyFile.load_from_data(dconfDump, length, GLib.KeyFileFlags.NONE))
            throw new Error('Failed to load from dconf dump');

        const [key_list] = keyFile.get_keys('/');

        key_list.forEach((key) => {
            if (excludedKeys.includes(key)) keyFile.remove_key('/', key);
        });

        const [data] = keyFile.to_data();
        if (data) return data;
        else throw new Error('Failed to exclude dconf keys');
    }
}
