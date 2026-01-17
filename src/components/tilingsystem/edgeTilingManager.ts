import {
    buildRectangle,
    isPointInsideRect,
    clampPointInsideRect,
} from '../../utils/ui';
import { GObject, Mtk, St } from '../../gi/ext';
import Settings from '../../settings/settings';
import { EdgeSnapMode } from '../../settings/settings';
import { registerGObjectClass } from '../../utils/gjs';
import { logger } from '../../utils/logger';
import Layout from '../layout/Layout';
import GlobalState from '../../utils/globalState';
import Tile from '../../components/layout/Tile';

const TOP_EDGE_TILING_OFFSET = 8;
const QUARTER_PERCENTAGE = 0.5;
const __DEBUG_MODE__ = false;

export default class EdgeTilingManager extends GObject.Object {
    static { registerGObjectClass(this, {
        GTypeName: 'EdgeTilingManager',
        Properties: {
            quarterActivationPercentage: GObject.ParamSpec.uint(
                'quarterActivationPercentage',
                'quarterActivationPercentage',
                'Threshold to trigger quarter tiling',
                GObject.ParamFlags.READWRITE,
                1,
                50,
                40,
            ),
            edgeTilingOffset: GObject.ParamSpec.uint(
                'edgeTilingOffset',
                'edgeTilingOffset',
                'Offset to trigger edge tiling',
                GObject.ParamFlags.READWRITE,
                1,
                250,
                16,
            ),
        },
    })};

    private _workArea: Mtk.Rectangle;
    private _quarterActivationPercentage: number;
    private _edgeTilingOffset: number;
    private _currentLayout: Layout | null;
    private _monitorIndex: number = 0;
    private _workspaceIndex: number = 0;
    private _debug: (...args: unknown[]) => void;

    // activation zones
    private _topLeft: Mtk.Rectangle;
    private _topRight: Mtk.Rectangle;
    private _bottomLeft: Mtk.Rectangle;
    private _bottomRight: Mtk.Rectangle;
    private _topCenter: Mtk.Rectangle;
    private _leftCenter: Mtk.Rectangle;
    private _rightCenter: Mtk.Rectangle;

    // current active zone
    private _activeEdgeTile: Mtk.Rectangle | null;

    constructor(initialWorkArea: Mtk.Rectangle) {
        super();
        this._workArea = buildRectangle();
        this._topLeft = buildRectangle();
        this._topRight = buildRectangle();
        this._bottomLeft = buildRectangle();
        this._bottomRight = buildRectangle();
        this._topCenter = buildRectangle();
        this._leftCenter = buildRectangle();
        this._rightCenter = buildRectangle();
        this._activeEdgeTile = null;
        this._currentLayout = null;
        this.workarea = initialWorkArea;
        this._quarterActivationPercentage = Settings.QUARTER_TILING_THRESHOLD;
        this._debug = logger('EdgeTilingManager');
        Settings.bind(
            Settings.KEY_QUARTER_TILING_THRESHOLD,
            this,
            'quarterActivationPercentage',
        );
        this._edgeTilingOffset = Settings.EDGE_TILING_OFFSET;
        Settings.bind(
            Settings.KEY_EDGE_TILING_OFFSET,
            this,
            'edgeTilingOffset',
        );
    }

    private set quarterActivationPercentage(value: number) {
        this._quarterActivationPercentage = value / 100;
        this._updateActivationZones();
    }

    private set edgeTilingOffset(value: number) {
        this._edgeTilingOffset = value;
    }

    public set workarea(newWorkArea: Mtk.Rectangle) {
        this._workArea.x = newWorkArea.x;
        this._workArea.y = newWorkArea.y;
        this._workArea.width = newWorkArea.width;
        this._workArea.height = newWorkArea.height;

        this._updateActivationZones();
    }

    public set monitorIndex(index: number) {
        this._monitorIndex = index;
    }

    public set workspaceIndex(index: number) {
        this._workspaceIndex = index;
        this._updateCurrentLayout();
    }

    private _updateCurrentLayout() {
        this._currentLayout = GlobalState.get().getSelectedLayoutOfMonitor(
            this._monitorIndex,
            this._workspaceIndex,
        );
    }

    private _updateActivationZones() {
        const width = Math.ceil(
            this._workArea.width * this._quarterActivationPercentage,
        );
        const height = Math.ceil(
            this._workArea.height * this._quarterActivationPercentage,
        );

        this._topLeft.x = this._workArea.x;
        this._topLeft.y = this._workArea.y;
        this._topLeft.width = width;
        this._topLeft.height = height;

        this._topRight.x =
            this._workArea.x + this._workArea.width - this._topLeft.width;
        this._topRight.y = this._topLeft.y;
        this._topRight.width = width;
        this._topRight.height = height;

        this._bottomLeft.x = this._workArea.x;
        this._bottomLeft.y = this._workArea.y + this._workArea.height - height;
        this._bottomLeft.width = width;
        this._bottomLeft.height = height;

        this._bottomRight.x = this._topRight.x;
        this._bottomRight.y = this._bottomLeft.y;
        this._bottomRight.width = width;
        this._bottomRight.height = height;

        this._topCenter.x = this._topLeft.x + this._topLeft.width;
        this._topCenter.y = this._topRight.y;
        this._topCenter.height = this._topRight.height;
        this._topCenter.width = this._topRight.x - this._topCenter.x;

        this._leftCenter.x = this._topLeft.x;
        this._leftCenter.y = this._topLeft.y + this._topLeft.height;
        this._leftCenter.height = this._bottomLeft.y - this._leftCenter.y;
        this._leftCenter.width = this._topLeft.width;

        this._rightCenter.x = this._topRight.x;
        this._rightCenter.y = this._topRight.y + this._topRight.height;
        this._rightCenter.height = this._bottomRight.y - this._rightCenter.y;
        this._rightCenter.width = this._topRight.width;
    }

    public canActivateEdgeTiling(pointerPos: {
        x: number;
        y: number;
    }): boolean {
        return (
            pointerPos.x <= this._workArea.x + this._edgeTilingOffset ||
            pointerPos.y <= this._workArea.y + TOP_EDGE_TILING_OFFSET ||
            pointerPos.x >=
                this._workArea.x +
                    this._workArea.width -
                    this._edgeTilingOffset ||
            pointerPos.y >=
                this._workArea.y +
                    this._workArea.height -
                    this._edgeTilingOffset
        );
    }

    public isPerformingEdgeTiling(): boolean {
        return this._activeEdgeTile !== null;
    }

    public startEdgeTiling(pointerPos: { x: number; y: number }): {
        changed: boolean;
        rect: Mtk.Rectangle;
    } {
        const { x, y } = clampPointInsideRect(pointerPos, this._workArea);
        const previewRect = buildRectangle();

        if (
            this._activeEdgeTile &&
            isPointInsideRect({ x, y }, this._activeEdgeTile)
        ) {
            return {
                changed: false,
                rect: previewRect,
            };
        }

        if (!this._activeEdgeTile) this._activeEdgeTile = buildRectangle();

        // Get the current edge snap mode
        const edgeSnapMode = Settings.EDGE_SNAP_MODE;

        // Default behavior - initialize with quarter tiling
        previewRect.width = this._workArea.width * QUARTER_PERCENTAGE;
        previewRect.height = this._workArea.height * QUARTER_PERCENTAGE;
        previewRect.y = this._workArea.y;
        previewRect.x = this._workArea.x;

        // Handle different snapping modes
        switch (edgeSnapMode) {
            case EdgeSnapMode.DEFAULT:
                // Default behavior - quarters for corners, halves for edges
                return this._handleDefaultEdgeSnap(x, y, previewRect);
            case EdgeSnapMode.ADAPTIVE:
                // Adaptive behavior - snap to layout tiles by column
                return this._handleAdaptiveEdgeSnap(x, y, previewRect);
            case EdgeSnapMode.GRANULAR:
                // Granular behavior - snap to exact tile under cursor
                return this._handleGranularEdgeSnap(x, y, previewRect);
            default:
                return this._handleDefaultEdgeSnap(x, y, previewRect);
        }
    }

    private _handleDefaultEdgeSnap(
        x: number,
        y: number,
        previewRect: Mtk.Rectangle,
    ): { changed: boolean; rect: Mtk.Rectangle } {
        // This implements the original edge tiling behavior:
        // - corners snap to quarters
        // - edges snap to half screen

        if (isPointInsideRect({ x, y }, this._topCenter)) {
            previewRect.width = this._workArea.width;
            previewRect.height = this._workArea.height;
            this._activeEdgeTile = this._topCenter;
        } else if (isPointInsideRect({ x, y }, this._leftCenter)) {
            previewRect.width = this._workArea.width * QUARTER_PERCENTAGE;
            previewRect.height = this._workArea.height;
            this._activeEdgeTile = this._leftCenter;
        } else if (isPointInsideRect({ x, y }, this._rightCenter)) {
            previewRect.x =
                this._workArea.x + this._workArea.width - previewRect.width;
            previewRect.width = this._workArea.width * QUARTER_PERCENTAGE;
            previewRect.height = this._workArea.height;
            this._activeEdgeTile = this._rightCenter;
        } else if (x <= this._workArea.x + this._workArea.width / 2) {
            // Left half of screen
            if (isPointInsideRect({ x, y }, this._topLeft)) {
                this._activeEdgeTile = this._topLeft;
            } else if (isPointInsideRect({ x, y }, this._bottomLeft)) {
                previewRect.y =
                    this._workArea.y +
                    this._workArea.height -
                    previewRect.height;
                this._activeEdgeTile = this._bottomLeft;
            } else {
                return {
                    changed: false,
                    rect: previewRect,
                };
            }
        } else {
            // Right half of screen
            previewRect.x =
                this._workArea.x + this._workArea.width - previewRect.width;
            if (isPointInsideRect({ x, y }, this._topRight)) {
                this._activeEdgeTile = this._topRight;
            } else if (isPointInsideRect({ x, y }, this._bottomRight)) {
                previewRect.y =
                    this._workArea.y +
                    this._workArea.height -
                    previewRect.height;
                this._activeEdgeTile = this._bottomRight;
            } else {
                return {
                    changed: false,
                    rect: previewRect,
                };
            }
        }

        // Debug visualization
        if (__DEBUG_MODE__) {
            // Clean up any existing debug widget
            global.windowGroup
                .get_children()
                .filter((c) => c.get_name() === 'debug')[0]
                ?.destroy();

            // Create a new debug widget
            const debug = new St.Widget({
                x: this._activeEdgeTile.x,
                y: this._activeEdgeTile.y,
                height: this._activeEdgeTile.height,
                width: this._activeEdgeTile.width,
                style: 'border: 2px solid red',
                name: 'debug',
            });
            global.windowGroup.add_child(debug);
        }

        return {
            changed: true,
            rect: previewRect,
        };
    }

    private _handleAdaptiveEdgeSnap(
        x: number,
        y: number,
        previewRect: Mtk.Rectangle,
    ): { changed: boolean; rect: Mtk.Rectangle } {
        // Adaptive mode: snap to layout tiles by column
        // - corners snap to corner tiles
        // - edges snap to entire column of tiles

        if (!this._currentLayout)
            return this._handleDefaultEdgeSnap(x, y, previewRect);

        if (isPointInsideRect({ x, y }, this._topCenter)) {
            previewRect.width = this._workArea.width;
            previewRect.height = this._workArea.height;
            this._activeEdgeTile = this._topCenter;
        } else if (isPointInsideRect({ x, y }, this._leftCenter)) {
            // Get left column tiles
            const leftColumnTiles = this._getLeftColumnTiles();

            if (leftColumnTiles.length > 0) {
                const minX = Math.min(...leftColumnTiles.map((tile) => tile.x));
                const exactLeftColumnTiles = leftColumnTiles.filter(
                    (tile) => Math.abs(tile.x - minX) < 0.01,
                );

                // Snap to entire column
                const newRect = this._createRectForColumnTiles(
                    exactLeftColumnTiles,
                    false,
                );
                previewRect.x = this._workArea.x + this._workArea.width * minX;
                previewRect.y = newRect.y;
                previewRect.width = newRect.width;
                previewRect.height = newRect.height;
            }

            this._activeEdgeTile = this._leftCenter;
        } else if (isPointInsideRect({ x, y }, this._rightCenter)) {
            // Get right column tiles
            const rightColumnTiles = this._getRightColumnTiles();

            if (rightColumnTiles.length > 0) {
                // Find the maximum X coordinate (in case there are multiple right-aligned columns)
                const maxEndX = Math.max(
                    ...rightColumnTiles.map((tile) => tile.x + tile.width),
                );
                // Find all tiles with this end X coordinate
                const exactRightColumnTiles = rightColumnTiles.filter(
                    (tile) => Math.abs(tile.x + tile.width - maxEndX) < 0.01,
                );

                // Snap to entire column
                const newRect = this._createRectForColumnTiles(
                    exactRightColumnTiles,
                    true,
                );

                // Calculate the starting X position based on the actual tiles
                const rightMostX = Math.min(
                    ...exactRightColumnTiles.map((tile) => tile.x),
                );
                previewRect.x =
                    this._workArea.x + this._workArea.width * rightMostX;
                previewRect.y = newRect.y;
                previewRect.width = newRect.width;
                previewRect.height = newRect.height;
            } else {
                previewRect.x =
                    this._workArea.x + this._workArea.width - previewRect.width;
            }

            this._activeEdgeTile = this._rightCenter;
        } else if (isPointInsideRect({ x, y }, this._topLeft)) {
            // Snap to top-left corner tile
            const topLeftTile = this._findTileAtCorner('top-left');
            if (topLeftTile) {
                previewRect.width = this._workArea.width * topLeftTile.width;
                previewRect.height = this._workArea.height * topLeftTile.height;
                previewRect.x =
                    this._workArea.x + this._workArea.width * topLeftTile.x;
                previewRect.y =
                    this._workArea.y + this._workArea.height * topLeftTile.y;
            }
            this._activeEdgeTile = this._topLeft;
        } else if (isPointInsideRect({ x, y }, this._bottomLeft)) {
            // Snap to bottom-left corner tile
            const bottomLeftTile = this._findTileAtCorner('bottom-left');
            if (bottomLeftTile) {
                previewRect.width = this._workArea.width * bottomLeftTile.width;
                previewRect.height =
                    this._workArea.height * bottomLeftTile.height;
                previewRect.x =
                    this._workArea.x + this._workArea.width * bottomLeftTile.x;
                previewRect.y =
                    this._workArea.y + this._workArea.height * bottomLeftTile.y;
            } else {
                previewRect.y =
                    this._workArea.y +
                    this._workArea.height -
                    previewRect.height;
            }
            this._activeEdgeTile = this._bottomLeft;
        } else if (isPointInsideRect({ x, y }, this._topRight)) {
            // Snap to top-right corner tile
            const topRightTile = this._findTileAtCorner('top-right');
            if (topRightTile) {
                previewRect.width = this._workArea.width * topRightTile.width;
                previewRect.height =
                    this._workArea.height * topRightTile.height;
                previewRect.x =
                    this._workArea.x + this._workArea.width * topRightTile.x;
                previewRect.y =
                    this._workArea.y + this._workArea.height * topRightTile.y;
            } else {
                previewRect.x =
                    this._workArea.x + this._workArea.width - previewRect.width;
            }
            this._activeEdgeTile = this._topRight;
        } else if (isPointInsideRect({ x, y }, this._bottomRight)) {
            // Snap to bottom-right corner tile
            const bottomRightTile = this._findTileAtCorner('bottom-right');
            if (bottomRightTile) {
                previewRect.width =
                    this._workArea.width * bottomRightTile.width;
                previewRect.height =
                    this._workArea.height * bottomRightTile.height;
                previewRect.x =
                    this._workArea.x + this._workArea.width * bottomRightTile.x;
                previewRect.y =
                    this._workArea.y +
                    this._workArea.height * bottomRightTile.y;
            } else {
                previewRect.x =
                    this._workArea.x + this._workArea.width - previewRect.width;
                previewRect.y =
                    this._workArea.y +
                    this._workArea.height -
                    previewRect.height;
            }
            this._activeEdgeTile = this._bottomRight;
        } else {
            return {
                changed: false,
                rect: previewRect,
            };
        }

        // Debug visualization
        if (__DEBUG_MODE__) {
            // Clean up any existing debug widget
            global.windowGroup
                .get_children()
                .filter((c) => c.get_name() === 'debug')[0]
                ?.destroy();

            // Create a new debug widget
            const debug = new St.Widget({
                x: this._activeEdgeTile.x,
                y: this._activeEdgeTile.y,
                height: this._activeEdgeTile.height,
                width: this._activeEdgeTile.width,
                style: 'border: 2px solid red',
                name: 'debug',
            });
            global.windowGroup.add_child(debug);
        }

        return {
            changed: true,
            rect: previewRect,
        };
    }

    private _handleGranularEdgeSnap(
        x: number,
        y: number,
        previewRect: Mtk.Rectangle,
    ): { changed: boolean; rect: Mtk.Rectangle } {
        // Granular mode: snap to exact tile under cursor
        // - corners snap to corner tiles
        // - edges snap to the exact tile the cursor is over

        if (!this._currentLayout)
            return this._handleDefaultEdgeSnap(x, y, previewRect);

        if (isPointInsideRect({ x, y }, this._topCenter)) {
            previewRect.width = this._workArea.width;
            previewRect.height = this._workArea.height;
            this._activeEdgeTile = this._topCenter;
        } else if (isPointInsideRect({ x, y }, this._leftCenter)) {
            // Find the tile exactly at cursor position on left edge
            const leftTile = this._findExactTileAtEdge('left', { x, y });

            if (leftTile) {
                const newRect = this._createRectForSingleTile(leftTile);
                previewRect.x = newRect.x;
                previewRect.y = newRect.y;
                previewRect.width = newRect.width;
                previewRect.height = newRect.height;
            }

            this._activeEdgeTile = this._leftCenter;
        } else if (isPointInsideRect({ x, y }, this._rightCenter)) {
            // Find the tile exactly at cursor position on right edge
            const rightTile = this._findExactTileAtEdge('right', { x, y });

            if (rightTile) {
                const newRect = this._createRectForSingleTile(rightTile);
                previewRect.x = newRect.x;
                previewRect.y = newRect.y;
                previewRect.width = newRect.width;
                previewRect.height = newRect.height;
            } else {
                previewRect.x =
                    this._workArea.x + this._workArea.width - previewRect.width;
            }

            this._activeEdgeTile = this._rightCenter;
        } else if (isPointInsideRect({ x, y }, this._topLeft)) {
            // Snap to top-left corner tile
            const topLeftTile = this._findTileAtCorner('top-left');
            if (topLeftTile) {
                previewRect.width = this._workArea.width * topLeftTile.width;
                previewRect.height = this._workArea.height * topLeftTile.height;
                previewRect.x =
                    this._workArea.x + this._workArea.width * topLeftTile.x;
                previewRect.y =
                    this._workArea.y + this._workArea.height * topLeftTile.y;
            }
            this._activeEdgeTile = this._topLeft;
        } else if (isPointInsideRect({ x, y }, this._bottomLeft)) {
            // Snap to bottom-left corner tile
            const bottomLeftTile = this._findTileAtCorner('bottom-left');
            if (bottomLeftTile) {
                previewRect.width = this._workArea.width * bottomLeftTile.width;
                previewRect.height =
                    this._workArea.height * bottomLeftTile.height;
                previewRect.x =
                    this._workArea.x + this._workArea.width * bottomLeftTile.x;
                previewRect.y =
                    this._workArea.y + this._workArea.height * bottomLeftTile.y;
            } else {
                previewRect.y =
                    this._workArea.y +
                    this._workArea.height -
                    previewRect.height;
            }
            this._activeEdgeTile = this._bottomLeft;
        } else if (isPointInsideRect({ x, y }, this._topRight)) {
            // Snap to top-right corner tile
            const topRightTile = this._findTileAtCorner('top-right');
            if (topRightTile) {
                previewRect.width = this._workArea.width * topRightTile.width;
                previewRect.height =
                    this._workArea.height * topRightTile.height;
                previewRect.x =
                    this._workArea.x + this._workArea.width * topRightTile.x;
                previewRect.y =
                    this._workArea.y + this._workArea.height * topRightTile.y;
            } else {
                previewRect.x =
                    this._workArea.x + this._workArea.width - previewRect.width;
            }
            this._activeEdgeTile = this._topRight;
        } else if (isPointInsideRect({ x, y }, this._bottomRight)) {
            // Snap to bottom-right corner tile
            const bottomRightTile = this._findTileAtCorner('bottom-right');
            if (bottomRightTile) {
                previewRect.width =
                    this._workArea.width * bottomRightTile.width;
                previewRect.height =
                    this._workArea.height * bottomRightTile.height;
                previewRect.x =
                    this._workArea.x + this._workArea.width * bottomRightTile.x;
                previewRect.y =
                    this._workArea.y +
                    this._workArea.height * bottomRightTile.y;
            } else {
                previewRect.x =
                    this._workArea.x + this._workArea.width - previewRect.width;
                previewRect.y =
                    this._workArea.y +
                    this._workArea.height -
                    previewRect.height;
            }
            this._activeEdgeTile = this._bottomRight;
        } else {
            return {
                changed: false,
                rect: previewRect,
            };
        }

        // Debug visualization
        if (__DEBUG_MODE__) {
            // Clean up any existing debug widget
            global.windowGroup
                .get_children()
                .filter((c) => c.get_name() === 'debug')[0]
                ?.destroy();

            // Create a new debug widget
            const debug = new St.Widget({
                x: this._activeEdgeTile.x,
                y: this._activeEdgeTile.y,
                height: this._activeEdgeTile.height,
                width: this._activeEdgeTile.width,
                style: 'border: 2px solid red',
                name: 'debug',
            });
            global.windowGroup.add_child(debug);
        }

        return {
            changed: true,
            rect: previewRect,
        };
    }

    // Helper methods for intelligent edge snap
    private _shouldUseEdgeSnap(): boolean {
        if (!this._currentLayout) return false;
        return true;
    }

    private _getLeftColumnTiles() {
        if (!this._currentLayout) return [];
        return this._currentLayout.tiles.filter(
            (tile) => Math.abs(tile.x) < 0.01, // Tiles starting at x=0
        );
    }

    private _getRightColumnTiles() {
        if (!this._currentLayout) return [];
        return this._currentLayout.tiles.filter(
            (tile) => Math.abs(tile.x + tile.width - 1) < 0.01, // Tiles ending at x=1
        );
    }

    private _findAllTilesInColumn(x: number, tolerance: number = 0.01) {
        if (!this._currentLayout) return [];
        return this._currentLayout.tiles.filter(
            (tile) => Math.abs(tile.x - x) < tolerance,
        );
    }

    private _createRectForColumnTiles(
        tiles: Tile[],
        isRightSide: boolean = false,
    ): Mtk.Rectangle {
        const rect = buildRectangle();
        rect.y = this._workArea.y;

        if (tiles.length === 0) {
            // Use default quarter tiling if no tiles found
            rect.width = this._workArea.width * QUARTER_PERCENTAGE;
            rect.height = this._workArea.height;

            if (isRightSide)
                rect.x = this._workArea.x + this._workArea.width - rect.width;
            else rect.x = this._workArea.x;

            return rect;
        }

        // When we have tiles, use their actual dimensions
        // Get the minimum x and maximum width to create a rect that covers all tiles in column
        const minX = Math.min(...tiles.map((tile) => tile.x));
        const maxWidth = Math.max(...tiles.map((tile) => tile.width));

        rect.width = this._workArea.width * maxWidth;
        rect.height = this._workArea.height;
        rect.x = this._workArea.x + this._workArea.width * minX;

        return rect;
    }

    private _findTileAtCorner(
        corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
    ) {
        if (!this._currentLayout) return null;

        switch (corner) {
            case 'top-left':
                return this._currentLayout.tiles.find(
                    (tile) =>
                        Math.abs(tile.x) < 0.01 && Math.abs(tile.y) < 0.01,
                );
            case 'top-right':
                return this._currentLayout.tiles.find(
                    (tile) =>
                        Math.abs(tile.x + tile.width - 1) < 0.01 &&
                        Math.abs(tile.y) < 0.01,
                );
            case 'bottom-left':
                return this._currentLayout.tiles.find(
                    (tile) =>
                        Math.abs(tile.x) < 0.01 &&
                        Math.abs(tile.y + tile.height - 1) < 0.01,
                );
            case 'bottom-right':
                return this._currentLayout.tiles.find(
                    (tile) =>
                        Math.abs(tile.x + tile.width - 1) < 0.01 &&
                        Math.abs(tile.y + tile.height - 1) < 0.01,
                );
        }

        return null;
    }

    public needMaximize(): boolean {
        return (
            this._activeEdgeTile !== null &&
            Settings.TOP_EDGE_MAXIMIZE &&
            this._activeEdgeTile === this._topCenter
        );
    }

    public abortEdgeTiling() {
        this._activeEdgeTile = null;
    }

    private _findClosestTileToPosition(
        pointerPos: { x: number; y: number },
        candidateTiles: Tile[],
    ): Tile | null {
        if (!candidateTiles.length) return null;

        // Convert pointer position to relative coordinates (0-1)
        const relativeY =
            (pointerPos.y - this._workArea.y) / this._workArea.height;

        // Find the tile whose y-range contains the pointer
        const containingTiles = candidateTiles.filter(
            (tile) => relativeY >= tile.y && relativeY <= tile.y + tile.height,
        );

        // If no tile directly contains the point, find the closest
        if (containingTiles.length === 0) {
            return candidateTiles.reduce(
                (closest, tile) => {
                    // Find distance to the center of the tile
                    const tileCenter = {
                        x: tile.x + tile.width / 2,
                        y: tile.y + tile.height / 2,
                    };

                    const tileCenterPx = {
                        x:
                            this._workArea.x +
                            tileCenter.x * this._workArea.width,
                        y:
                            this._workArea.y +
                            tileCenter.y * this._workArea.height,
                    };

                    const distance = Math.sqrt(
                        Math.pow(pointerPos.x - tileCenterPx.x, 2) +
                            Math.pow(pointerPos.y - tileCenterPx.y, 2),
                    );

                    // Return the closest tile
                    if (!closest) return tile;
                    const closestCenter = {
                        x: closest.x + closest.width / 2,
                        y: closest.y + closest.height / 2,
                    };

                    const closestCenterPx = {
                        x:
                            this._workArea.x +
                            closestCenter.x * this._workArea.width,
                        y:
                            this._workArea.y +
                            closestCenter.y * this._workArea.height,
                    };

                    const closestDistance = Math.sqrt(
                        Math.pow(pointerPos.x - closestCenterPx.x, 2) +
                            Math.pow(pointerPos.y - closestCenterPx.y, 2),
                    );

                    return distance < closestDistance ? tile : closest;
                },
                null as Tile | null,
            );
        }

        // If multiple tiles contain the point, find the closest
        if (containingTiles.length > 1) {
            return containingTiles.reduce(
                (closest, tile) => {
                    const tileCenterX =
                        this._workArea.x +
                        (tile.x + tile.width / 2) * this._workArea.width;
                    const distance = Math.abs(pointerPos.x - tileCenterX);

                    if (!closest) return tile;

                    const closestCenterX =
                        this._workArea.x +
                        (closest.x + closest.width / 2) * this._workArea.width;
                    const closestDistance = Math.abs(
                        pointerPos.x - closestCenterX,
                    );

                    return distance < closestDistance ? tile : closest;
                },
                null as Tile | null,
            );
        }

        // Return the single containing tile
        return containingTiles[0];
    }

    private _createRectForSingleTile(tile: Tile | null): Mtk.Rectangle {
        const rect = buildRectangle();

        if (!tile) {
            // Default to quarter tiling
            rect.width = this._workArea.width * QUARTER_PERCENTAGE;
            rect.height = this._workArea.height * QUARTER_PERCENTAGE;
            rect.x = this._workArea.x;
            rect.y = this._workArea.y;
            return rect;
        }

        // Create rect based on the single tile
        rect.width = this._workArea.width * tile.width;
        rect.height = this._workArea.height * tile.height;
        rect.x = this._workArea.x + this._workArea.width * tile.x;
        rect.y = this._workArea.y + this._workArea.height * tile.y;

        return rect;
    }

    private _findTilesAtEdge(
        edge: 'left' | 'right' | 'top' | 'bottom',
    ): Tile[] {
        if (!this._currentLayout) return [];

        // Find all tiles that touch this edge
        const tiles = this._currentLayout.tiles.filter((tile) => {
            // Determine if tile is on the specified edge
            switch (edge) {
                case 'left':
                    return Math.abs(tile.x) < 0.01;
                case 'right':
                    return Math.abs(tile.x + tile.width - 1) < 0.01;
                case 'top':
                    return Math.abs(tile.y) < 0.01;
                case 'bottom':
                    return Math.abs(tile.y + tile.height - 1) < 0.01;
            }
            return false;
        });

        return tiles;
    }

    private _findExactTileAtEdge(
        edge: 'left' | 'right' | 'top' | 'bottom',
        pointerPos: { x: number; y: number },
    ): Tile | null {
        const edgeTiles = this._findTilesAtEdge(edge);
        if (edgeTiles.length === 0) return null;

        // Convert pointer position to relative coordinates (0-1)
        const relativeX =
            (pointerPos.x - this._workArea.x) / this._workArea.width;
        const relativeY =
            (pointerPos.y - this._workArea.y) / this._workArea.height;

        // Find the tile that contains the pointer position
        for (const tile of edgeTiles) {
            const tileMinY = tile.y;
            const tileMaxY = tile.y + tile.height;
            const tileMinX = tile.x;
            const tileMaxX = tile.x + tile.width;

            // Check if pointer is within this tile's vertical/horizontal range based on edge
            if (edge === 'left' || edge === 'right') {
                if (relativeY >= tileMinY && relativeY <= tileMaxY) return tile;
            } else if (relativeX >= tileMinX && relativeX <= tileMaxX) {
                // top or bottom
                return tile;
            }
        }

        // If no tile directly contains the point, find the closest one
        return this._findClosestTileToPosition(pointerPos, edgeTiles);
    }
}
