import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Settings from '@settings/settings';
import SettingsOverride from '@settings/settingsOverride';

const dconfPath = '/org/gnome/shell/extensions/tilingshell/';
const excludedKeys = [
    Settings.SETTING_LAYOUTS_JSON,
    Settings.SETTING_LAST_VERSION_NAME_INSTALLED,
    Settings.SETTING_OVERRIDDEN_SETTINGS,
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
        SettingsOverride.get().restoreAll();

        const proc = Gio.Subprocess.new(
            ['dconf', 'load', dconfPath],
            Gio.SubprocessFlags.STDIN_PIPE,
        );

        const stdin = proc.get_stdin_pipe();
        if (stdin) {
            stdin.write(content, null);
            stdin.close(null);
            proc.wait(null);
        }
        if (!proc.get_successful()) {
            throw new Error(
                'Failed to import dconf dump file. Restoring to default...',
            );
        }
    }

    restoreToDefault() {
        this._gioSettings
            .list_keys()
            .filter((key) => key.length > 0 && !excludedKeys.includes(key))
            .forEach((key) => this._gioSettings.reset(key));
    }

    private _dumpDconf(): string {
        const proc = Gio.Subprocess.new(
            ['dconf', 'dump', dconfPath],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        );

        const [, dump] = proc.communicate_utf8(null, null);
        proc.wait(null);

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
