import { Gio, GLib, Meta } from '../gi/ext';
import { logger } from './logger';

const debug = logger('MonitorIdentity');

// (connector, vendor, product, serial)
type MonitorSpec = [string, string, string, string];
type MonitorInfo = [MonitorSpec, unknown, unknown];
type LogicalMonitorInfo = [
    number, // x
    number, // y
    number, // scale
    number, // transform
    boolean, // primary
    MonitorSpec[],
    unknown, // properties
];

/**
 * Asks Mutter's DisplayConfig D-Bus API for the connected monitors and
 * returns a stable identifier for each monitor index (the index used by
 * Main.layoutManager.monitors). Unlike the index, which depends on the
 * order the connectors are enumerated in, the identifier survives a new
 * login. It is built from the EDID's vendor, product and serial number, so
 * it also survives plugging a monitor into another port. When two connected
 * monitors share the same identifier (e.g. identical models without a
 * serial number), the connector is appended to tell them apart.
 *
 * Calls back with undefined if the identifiers can't be determined.
 */
export function fetchMonitorIds(
    callback: (ids: string[] | undefined) => void,
) {
    try {
        Gio.DBus.session.call(
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            'org.gnome.Mutter.DisplayConfig',
            'GetCurrentState',
            null,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (conn: Gio.DBusConnection | null, res: Gio.AsyncResult) => {
                let ids: string[] | undefined;
                try {
                    if (!conn) throw new Error('no D-Bus connection');
                    ids = parseMonitorIds(conn.call_finish(res));
                } catch (e) {
                    debug('DisplayConfig error:', e);
                    ids = undefined;
                }
                callback(ids);
            },
        );
    } catch (e) {
        debug(e);
        callback(undefined);
    }
}

function parseMonitorIds(state: GLib.Variant): string[] | undefined {
    const [, monitors, logicalMonitors] = state.recursiveUnpack() as [
        number,
        MonitorInfo[],
        LogicalMonitorInfo[],
        unknown,
    ];

    const edidId = ([connector, vendor, product, serial]: MonitorSpec) =>
        vendor || product || serial
            ? `${vendor}:${product}:${serial}`
            : connector;

    // count the identifiers to find monitors that can't be told apart
    const counts = new Map<string, number>();
    monitors.forEach(([spec]) => {
        const id = edidId(spec);
        counts.set(id, (counts.get(id) ?? 0) + 1);
    });
    const monitorId = (spec: MonitorSpec) => {
        const id = edidId(spec);
        return (counts.get(id) ?? 0) > 1 ? `${id}@${spec[0]}` : id;
    };

    // global.backend is not available on older GNOME versions
    const monitorManager: Meta.MonitorManager | undefined =
        (global as any).backend?.get_monitor_manager?.() ??
        (Meta.MonitorManager as any).get?.();
    if (!monitorManager) return undefined;

    const ids: string[] = [];
    for (const [, , , , , specs] of logicalMonitors) {
        if (specs.length === 0) continue;

        const index = monitorManager.get_monitor_for_connector(specs[0][0]);
        if (index < 0) return undefined;

        // mirrored monitors share a logical monitor
        ids[index] = specs.map(monitorId).sort().join('+');
    }

    // every monitor index must have an identifier
    for (let i = 0; i < ids.length; i++)
        if (ids[i] === undefined) return undefined;

    return ids;
}
