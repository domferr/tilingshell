import Layout from '../components/layout/Layout';
import Settings from '../settings/settings';

export function isLayoutSuitableForMonitor(
    layout: Layout,
    monitorWidth: number,
    monitorHeight: number,
): boolean {
    if (layout.minimumMonitorResolution) {
        return (
            monitorWidth >= layout.minimumMonitorResolution.width &&
            monitorHeight >= layout.minimumMonitorResolution.height
        );
    }

    const minTileWidthThreshold = Settings.MINIMUM_TILE_WIDTH_THRESHOLD;
    if (layout.tiles.length === 0 || minTileWidthThreshold === 0) return true;
    const minTileHeightThreshold = Math.round((minTileWidthThreshold * 2) / 3);

    const smallestTileWidth = Math.min(...layout.tiles.map((t) => t.width));
    const smallestTileHeight = Math.min(...layout.tiles.map((t) => t.height));

    return (
        smallestTileWidth * monitorWidth >= minTileWidthThreshold &&
        smallestTileHeight * monitorHeight >= minTileHeightThreshold
    );
}

export function getLayoutsForMonitor(
    layouts: Layout[],
    monitorWidth: number,
    monitorHeight: number,
): Layout[] {
    const suitable = layouts.filter((lay) =>
        isLayoutSuitableForMonitor(lay, monitorWidth, monitorHeight),
    );

    if (suitable.length === 0 && layouts.length > 0) {
        return [layouts[0]];
    }

    return suitable.length > 0 ? suitable : layouts;
}
