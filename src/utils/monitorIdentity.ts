import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { logger } from './logger';

const debug = logger('MonitorIdentity');

/* Stable identity for a physical monitor.
 *
 * Monitor *indices* are not stable: mutter renumbers `Main.layoutManager.monitors`
 * whenever the topology changes (dock/undock, lid, disabling a display), and the
 * ordering is neither primary-first nor left-to-right. Anything keyed by index
 * is therefore reassigned to a different physical screen on those events - see #573.
 *
 * The EDID triple (vendor, product, serial) is what GNOME itself keys
 * ~/.config/monitors.xml on, so it survives both re-indexing and being plugged
 * into a different dock. Connector labels such as DP-2 are *not* stable across
 * docks: the same panel has been observed under 8 different connector names.
 *
 * Serial alone is not enough - a laptop panel typically reports 0x00000000 - so
 * the connector is appended as a tiebreaker only when the serial is unusable,
 * which keeps two units of the same model distinct when they do have serials.
 */

const NO_SERIAL = new Set(['', '0', '0x0', '0x00000000']);

const safeString = (obj: Meta.Monitor, method: string): string => {
    try {
        const fn = (obj as unknown as Record<string, unknown>)?.[method];
        if (typeof fn !== 'function') return '';
        const value = (fn as () => string | null).call(obj);
        return typeof value === 'string' ? value.trim() : '';
    } catch (_error) {
        // Older mutter releases (and the GNOME 42-44 legacy build) may not
        // expose every accessor. Degrade rather than throw.
        return '';
    }
};

/** Human-readable description, used as a last-resort identity. */
const describeFallback = (monitor: Meta.Monitor): string =>
    safeString(monitor, 'get_product_id') ||
    safeString(monitor, 'get_description') ||
    'unknown';

/**
 * @returns identity key that is stable across index changes and docks
 */
export function getMonitorKey(monitor: Meta.Monitor): string {
    if (!monitor) return 'unknown';

    const connector = safeString(monitor, 'get_connector');
    const vendor = safeString(monitor, 'get_vendor');
    const product = safeString(monitor, 'get_product');
    const serial = safeString(monitor, 'get_serial');

    // No EDID triple on this mutter version - fall back, but keep it
    // distinguishable so two identical models do not collapse into one key.
    if (!vendor && !product) {
        return describeFallback(monitor) + (connector ? `#${connector}` : '');
    }

    const triple = `${vendor}/${product}/${serial}`;
    if (!serial || NO_SERIAL.has(serial)) {
        // No usable serial: the connector is the only thing left to separate two
        // identical panels wired to different ports.
        return `${triple}#${connector}`;
    }
    return triple;
}

/** Identity keys of all connected monitors, in current index order. */
export function getMonitorKeys(): string[] {
    const monitors = Main.layoutManager.monitors ?? [];
    return monitors.map(monitor => getMonitorKey(monitor));
}

/** Label that tells two identical panels apart, e.g. `LG Ultra HD (DP-2 · 0x…c3d)`. */
export function getMonitorLabel(monitor: Meta.Monitor): string {
    if (!monitor) return '';
    const connector = safeString(monitor, 'get_connector');
    const serial = safeString(monitor, 'get_serial');
    const name =
        safeString(monitor, 'get_product') ||
        safeString(monitor, 'get_product_id') ||
        safeString(monitor, 'get_description') ||
        safeString(monitor, 'get_display_name') ||
        'Monitor';

    const parts: string[] = [];
    if (connector) parts.push(connector);
    // Only show a serial when it is real - laptop panels report 0x00000000.
    if (serial && !NO_SERIAL.has(serial)) parts.push(serial.slice(-8));

    return parts.length ? `${name} (${parts.join(' · ')})` : name;
}

/** Log the resolved identities - useful for confirming the accessors on a given mutter. */
export function logMonitorKeys(context: string) {
    const monitors = Main.layoutManager.monitors ?? [];
    monitors.forEach((monitor, index) => {
        debug(
            `${context}: index=${index} key=${getMonitorKey(monitor)} label=${getMonitorLabel(monitor)}`,
        );
    });
}
