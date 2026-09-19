import { _ } from '../translations';

export interface MonitorDetails {
    name: string;
    index?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

// clustering tolerance (in pixels) used when no monitor size is available
const FALLBACK_CLUSTER_TOLERANCE = 100;

// Half of the smallest known monitor dimension: two monitors whose centers
// are closer than this on an axis are considered aligned on that axis
const clusterTolerance = (group: MonitorDetails[]): number => {
    const sizes = group
        .flatMap(m => [m.width ?? 0, m.height ?? 0])
        .filter(size => size > 0);
    return sizes.length > 0
        ? Math.min(...sizes) / 2
        : FALLBACK_CLUSTER_TOLERANCE;
};

// Group values into clusters: a value starts a new cluster when it is
// farther than the tolerance from the start of the current cluster.
// Returns the cluster rank of each value (0 = leftmost/topmost)
const clusterRanks = (
    values: number[],
    tolerance: number
): Map<number, number> => {
    const sorted = Array.from(new Set(values)).sort((a, b) => a - b);
    const ranks = new Map<number, number>();
    let rank = 0;
    let clusterStart = sorted.length > 0 ? sorted[0] : 0;
    sorted.forEach(value => {
        if (value - clusterStart > tolerance) {
            rank++;
            clusterStart = value;
        }
        ranks.set(value, rank);
    });
    return ranks;
};

const horizontalKey = (rank: number, count: number): string => {
    if (count <= 1) return '';
    if (rank === 0) return 'left';
    if (rank === count - 1) return 'right';
    return 'middle';
};

const verticalKey = (rank: number, count: number): string => {
    if (count <= 1) return '';
    if (rank === 0) return 'top';
    if (rank === count - 1) return 'bottom';
    return 'middle';
};

// Whole phrases are translated (instead of composing translated words)
// since word order differs between languages
const translatePositionKey = (key: string): string => {
    switch (key) {
        case 'left':
            return _('left');
        case 'right':
            return _('right');
        case 'top':
            return _('top');
        case 'bottom':
            return _('bottom');
        case 'middle':
            return _('middle');
        case 'top left':
            return _('top left');
        case 'top middle':
            return _('top middle');
        case 'top right':
            return _('top right');
        case 'middle left':
            return _('middle left');
        case 'middle right':
            return _('middle right');
        case 'bottom left':
            return _('bottom left');
        case 'bottom middle':
            return _('bottom middle');
        case 'bottom right':
            return _('bottom right');
        default:
            return key;
    }
};

// Compute a position label (e.g. "left", "top right") for each monitor of
// a group sharing the same name. Labels are unique and non-empty within
// the group: duplicated labels (e.g. mirrored monitors, or four monitors
// in a row where two are "middle") are numbered
const computePositionLabels = (group: MonitorDetails[]): string[] => {
    const centersX = group.map(m => (m.x ?? 0) + (m.width ?? 0) / 2);
    const centersY = group.map(m => (m.y ?? 0) + (m.height ?? 0) / 2);
    const tolerance = clusterTolerance(group);
    const columnRanks = clusterRanks(centersX, tolerance);
    const rowRanks = clusterRanks(centersY, tolerance);
    const columns = Math.max(...Array.from(columnRanks.values())) + 1;
    const rows = Math.max(...Array.from(rowRanks.values())) + 1;

    const keys = group.map((m, i) => {
        const h = horizontalKey(columnRanks.get(centersX[i])!, columns);
        const v = verticalKey(rowRanks.get(centersY[i])!, rows);
        if (v.length > 0 && h.length > 0)
            return v === 'middle' && h === 'middle' ? 'middle' : `${v} ${h}`;
        return v.length > 0 ? v : h;
    });

    const occurrences = new Map<string, number>();
    keys.forEach(key => occurrences.set(key, (occurrences.get(key) ?? 0) + 1));
    const counters = new Map<string, number>();
    return keys.map(key => {
        const label = translatePositionKey(key);
        if ((occurrences.get(key) ?? 0) <= 1) return label;
        const n = (counters.get(key) ?? 0) + 1;
        counters.set(key, n);
        return label.length > 0 ? `${label} ${n}` : `${n}`;
    });
};

// Append the relative position (e.g. "(left)", "(top right)") to the name
// of the monitors sharing their name with another monitor, leaving unique
// names untouched. Does not mutate the given monitors
export const disambiguateMonitorNames = (
    monitors: MonitorDetails[]
): MonitorDetails[] => {
    const groups = new Map<string, MonitorDetails[]>();
    monitors.forEach(m => {
        const group = groups.get(m.name);
        if (group) group.push(m);
        else groups.set(m.name, [m]);
    });

    const renamed = new Map<MonitorDetails, string>();
    groups.forEach((group, name) => {
        if (group.length <= 1) return;
        computePositionLabels(group).forEach((label, i) =>
            renamed.set(group[i], `${name} (${label})`)
        );
    });

    return monitors.map(m => {
        const newName = renamed.get(m);
        return newName === undefined ? { ...m } : { ...m, name: newName };
    });
};
