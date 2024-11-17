import { registerGObjectClass } from '@/utils/gjs';
import { Clutter, Mtk, Meta, St, Graphene } from '@gi.ext';
import TilePreview, {
    TilePreviewConstructorProperties,
} from '../tilepreview/tilePreview';
import LayoutWidget from '../layout/LayoutWidget';
import Layout from '../layout/Layout';
import Tile from '../layout/Tile';
import {
    buildRectangle,
    buildTileGaps,
    getWindows,
    isPointInsideRect,
} from '@utils/ui';
import TileUtils from '@components/layout/TileUtils';
import { logger } from '@utils/logger';
import GlobalState from '@utils/globalState';
import { KeyBindingsDirection } from '@keybindings';
import TilingLayout from './tilingLayout';
import ExtendedWindow from './extendedWindow';
import * as workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as overviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import PopupWindowPreview from './popupWindowPreview';

const debug = logger('TilingPopup');

@registerGObjectClass
class PopupTilingLayout extends TilingLayout {
    public override open(): void {
        super.open();
    }
}

@registerGObjectClass
class MasonryLayout extends Clutter.LayoutManager {
    private _columnCount: number;
    private _spacing: number;
    constructor(columnCount = 3, spacing = 10) {
        super();
        this._columnCount = columnCount; // Number of columns
        this._spacing = spacing; // Spacing between items
    }

    vfunc_allocate(container: Clutter.Actor, box: Clutter.ActorBox) {
        const children = container.get_children();
        if (children.length === 0) return;

        this._columnCount = Math.ceil(Math.sqrt(children.length));
        const columnHeights = Array(this._columnCount).fill(0); // Tracks the height of each column
        const columnWidth =
            (box.get_width() - this._spacing * (this._columnCount - 1)) /
            this._columnCount;

        // Calculate total content width and height
        const contentWidth =
            columnWidth * this._columnCount +
            this._spacing * (this._columnCount - 1);

        // Store placements and cache
        const placements = [];
        const allocationCache = container._allocationCache || {};

        for (const child of children) {
            // Retrieve the preferred width and height to calculate the aspect ratio
            const [minWidth, naturalWidth] = child.get_preferred_width(-1);
            const [minHeight, naturalHeight] =
                child.get_preferred_height(naturalWidth);

            // Maintain the aspect ratio
            const aspectRatio = naturalHeight / naturalWidth;
            const height = columnWidth * aspectRatio;

            // Find the shortest column
            const shortestColumn = columnHeights.indexOf(
                Math.min(...columnHeights),
            );
            placements.push({
                child,
                column: shortestColumn,
                height,
                y: columnHeights[shortestColumn],
                columnHeight: 0,
            });

            // Update column height
            columnHeights[shortestColumn] += height + this._spacing;
        }
        for (const placement of placements)
            placement.columnHeight = columnHeights[placement.column];

        const sortedColumnHeights: number[][] = [...columnHeights].map(
            (v, i) => [v, i],
        );
        sortedColumnHeights.sort((a, b) => b[0] - a[0]);
        const columnsOrdering = new Map<number, number>();
        sortedColumnHeights.forEach((col, newIndex) => {
            const index = col[1];
            columnsOrdering.set(
                index,
                (newIndex + Math.floor(this._columnCount / 2)) %
                    this._columnCount,
            );
        });
        for (const placement of placements) {
            placement.column =
                columnsOrdering.get(placement.column) ?? placement.column;
        }

        // Calculate offsets for centering the entire grid within the available space
        const horizontalOffset = Math.max(
            0,
            (box.get_width() - contentWidth) / 2,
        );
        // Determine the tallest column and center the content around it
        const tallestColumnHeight = sortedColumnHeights[0][0];
        const verticalOffset = Math.max(
            0,
            (box.get_height() - tallestColumnHeight) / 2,
        );

        // Reset column heights for actual allocation
        columnHeights.fill(0);

        // Allocate children with preserved proportions
        for (const placement of placements) {
            const { child, column, height, y, columnHeight } = placement;
            const x =
                box.x1 +
                column * (columnWidth + this._spacing) +
                horizontalOffset;
            const columnOffset = (tallestColumnHeight - columnHeight) / 2;
            const yPosition = box.y1 + y + verticalOffset + columnOffset;

            // Check if this child has a cached allocation
            const cachedAlloc = allocationCache[child];
            if (cachedAlloc) {
                child.allocate(
                    new Clutter.ActorBox({
                        x1: cachedAlloc.x,
                        y1: cachedAlloc.y,
                        x2: cachedAlloc.x + columnWidth,
                        y2: cachedAlloc.y + height,
                    }),
                );
                continue; // Skip reallocation
            }

            // If the allocation has changed or no cache exists, perform new allocation
            child.allocate(
                new Clutter.ActorBox({
                    x1: x,
                    y1: yPosition,
                    x2: x + columnWidth,
                    y2: yPosition + height,
                }),
            );

            // Update cache with the new allocation
            allocationCache[child] = {
                x,
                y: yPosition,
                width: columnWidth,
                height,
            };
        }

        // Store the updated cache for future allocation passes
        container._allocationCache = allocationCache;
    }

    vfunc_get_preferred_width(
        container: Clutter.Actor,
        forHeight: number,
    ): [number, number] {
        const children = container.get_children();
        if (children.length === 0) return [0, 0];

        const childWidths = children.map(
            (child) => child.get_preferred_width(forHeight)[1],
        );
        const maxChildWidth = Math.max(...childWidths);

        const totalWidth =
            this._columnCount * maxChildWidth +
            (this._columnCount - 1) * this._spacing;
        return [totalWidth, totalWidth];
    }

    vfunc_get_preferred_height(
        container: Clutter.Actor,
        forWidth: number,
    ): [number, number] {
        const children = container.get_children();
        if (children.length === 0) return [0, 0];

        const columnHeights = Array(this._columnCount).fill(0);
        const columnWidth =
            (forWidth - this._spacing * (this._columnCount - 1)) /
            this._columnCount;

        for (const child of children) {
            const preferredHeight = child.get_preferred_height(columnWidth)[1];
            const shortestColumn = columnHeights.indexOf(
                Math.min(...columnHeights),
            );
            columnHeights[shortestColumn] += preferredHeight + this._spacing;
        }

        const totalHeight = Math.max(...columnHeights);
        return [totalHeight, totalHeight];
    }
}

export default class TilingPopup {
    private _tilingLayout: TilingLayout;
    private _keyPressEvent: number | undefined;

    constructor(tilingLayout: TilingLayout) {
        this._tilingLayout = tilingLayout;
    }

    public open(
        window: ExtendedWindow,
        monitorIndex: number,
        workarea: Mtk.Rectangle,
    ): void {
        const tiledWindows: ExtendedWindow[] = [];
        const nontiledWindow: Meta.Window[] = [];
        getWindows().forEach((extWin) => {
            if (
                extWin &&
                !extWin.minimized &&
                (extWin as ExtendedWindow).assignedTile
            )
                tiledWindows.push(extWin as ExtendedWindow);
            else nontiledWindow.push(extWin);
        });
        const tiles = GlobalState.get().getSelectedLayoutOfMonitor(
            monitorIndex,
            global.workspaceManager.get_active_workspace_index(),
        ).tiles;
        const vacantTiles = tiles.filter((t) => {
            if (t === window.assignedTile) return false;
            const tileRect = TileUtils.apply_props(t, workarea);
            return !tiledWindows.find((win) => {
                const winRect =
                    win === window && window.assignedTile
                        ? TileUtils.apply_props(window.assignedTile, workarea)
                        : win.get_frame_rect();
                return tileRect.overlap(winRect);
            });
        });

        const tl = new PopupTilingLayout(
            new Layout(vacantTiles, 'popup'),
            this._tilingLayout.innerGaps,
            this._tilingLayout.outerGaps,
            workarea,
            this._tilingLayout.scalingFactor,
        );
        tl.open();
        if (this._keyPressEvent) global.stage.disconnect(this._keyPressEvent);
        this._keyPressEvent = global.stage.connect_after(
            'key-press-event',
            (_, event) => {
                const symbol = event.get_key_symbol();
                if (symbol === Clutter.KEY_Escape) {
                    if (this._keyPressEvent)
                        global.stage.disconnect(this._keyPressEvent);
                    this._keyPressEvent = undefined;
                    tl.destroy();
                }

                return Clutter.EVENT_PROPAGATE;
            },
        );
        const loc = TileUtils.apply_props(vacantTiles[0], workarea);
        const outer_container = new St.Widget({
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            layout_manager: new Clutter.BinLayout(),
            x: loc.x,
            y: loc.y,
            width: loc.width,
            height: loc.height,
            style: 'background-color: rgba(0,0,0,0.2); padding: 16px;',
        });
        const layoutManager = new MasonryLayout(3, 32);
        const container = new Clutter.Actor({
            reactive: true,
            x_expand: true,
            y_expand: true,
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            layout_manager: layoutManager,
        });
        outer_container.add_child(container);
        Main.uiGroup.add_child(outer_container);
        nontiledWindow.forEach((nonTiledWin) => {
            const winClone = new PopupWindowPreview(nonTiledWin);
            const winActor =
                nonTiledWin.get_compositor_private() as Meta.WindowActor;
            if (!winActor) return;

            container.add_child(winClone);
            winActor.set_pivot_point(0.5, 0.5);
            const animation_speed = 400;
            winActor.ease({
                opacity: 0,
                duration: animation_speed,
                scaleX: 0,
                scaleY: 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => winActor.hide(),
            });
            winClone.set_opacity(0);
            winClone.set_pivot_point(0.5, 0.5);
            winClone.set_scale(0, 0);
            winClone.ease({
                opacity: 255,
                duration: animation_speed,
                scaleX: 1,
                scaleY: 1,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => winActor.hide(),
            });
        });
    }
}
