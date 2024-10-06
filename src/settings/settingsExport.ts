import GioUnix from 'gi://Gio';
import GLib from 'gi://GLib';

const dconfPath = '/org/gnome/shell/extensions/tilingshell/';
const excludedKeys = [
    'layouts-json',
    'last-version-name-installed',
    'overridden-settings',
];

export default class SettingsExport {
    dconfDump: string;

    constructor() {
        this.dconfDump = this.dumpDconf();
        this.excludeKeys();
    }

    static importFrom(content: string) {
        this.restoreToDefault();

        const proc = GioUnix.Subprocess.new(
            ['dconf', 'load', dconfPath],
            GioUnix.SubprocessFlags.STDIN_PIPE,
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

    static restoreToDefault() {
        const procList = GioUnix.Subprocess.new(
            ['dconf', 'list', dconfPath],
            GioUnix.SubprocessFlags.STDOUT_PIPE |
                GioUnix.SubprocessFlags.STDERR_PIPE,
        );

        const [, list] = procList.communicate_utf8(null, null);
        procList.wait(null);

        if (!procList.get_successful())
            throw new Error('Failed to retrieve dconf keys');

        const keys = list
            .split('\n')
            .filter((key) => !excludedKeys.includes(key));

        for (const key of keys) {
            const procReset = GioUnix.Subprocess.new(
                ['dconf', 'reset', '-f', dconfPath + key],
                GioUnix.SubprocessFlags.NONE,
            );
            procReset.wait(null);
            if (!procReset.get_successful())
                throw new Error('Failed to restore to default settings');
        }
    }

    private dumpDconf(): string {
        const proc = GioUnix.Subprocess.new(
            ['dconf', 'dump', dconfPath],
            GioUnix.SubprocessFlags.STDOUT_PIPE |
                GioUnix.SubprocessFlags.STDERR_PIPE,
        );

        const [, dump] = proc.communicate_utf8(null, null);
        proc.wait(null);

        if (proc.get_successful()) return dump;
        else throw new Error('Failed to dump dconf');
    }

    private excludeKeys() {
        if (this.dconfDump.length === 0) return;

        const keyFile = new GLib.KeyFile();
        const length = new TextEncoder().encode(this.dconfDump).length;

        if (
            !keyFile.load_from_data(
                this.dconfDump,
                length,
                GLib.KeyFileFlags.NONE,
            )
        )
            return;

        const [key_list] = keyFile.get_keys('/');

        key_list.forEach((key) => {
            if (excludedKeys.includes(key)) keyFile.remove_key('/', key);
        });

        const [data] = keyFile.to_data();
        if (data) this.dconfDump = data;
        else throw new Error('Failed to exclude dconf keys');
    }
}
