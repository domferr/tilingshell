import { registerGObjectClass } from '@/utils/gjs';
import { Clutter, Mtk, Meta, St, Graphene } from '@gi.ext';
import Layout from '../layout/Layout';
import { getWindows } from '@utils/ui';
import TileUtils from '@components/layout/TileUtils';
import { logger } from '@utils/logger';
import GlobalState from '@utils/globalState';
import ExtendedWindow from './extendedWindow';
import PopupWindowPreview from './popupWindowPreview';
import Tile from '@components/layout/Tile';
import TilePreview from '@components/tilepreview/tilePreview';
import LayoutWidget from '@components/layout/LayoutWidget';
import SignalHandling from '@utils/signalHandling';
import PopupTilePreview from '@components/tilepreview/popupTilePreview';

const debug = logger('TilingPopup');

const MASONRY_LAYOUT_SPACING = 32;
const ANIMATION_SPEED = 200;
const MASONRY_COLUMN_MIN_WIDTH_PERCENTAGE = 0.3;

interface ContainerWithAllocationCache extends Clutter.Actor {
    _allocationCache:
        | Map<
              Clutter.Actor,
              { x: number; y: number; width: number; height: number }
          >
        | undefined;
}

@registerGObjectClass
class MasonryLayout extends Clutter.LayoutManager {
    private _columnCount: number;
    private _spacing: number;
    private _maxColumnWidth: number;
    private _columnWidth: number;

    constructor(spacing: number, columnWidth: number, maxColumnWidth: number) {
        super();
        this._columnCount = 0; // Number of columns
        this._spacing = spacing; // Spacing between items
        this._maxColumnWidth = maxColumnWidth;
        this._columnWidth = columnWidth;
    }

    vfunc_allocate(container: Clutter.Actor, box: Clutter.ActorBox) {
        const children = container.get_children();
        if (children.length === 0) return;

        this._columnCount = Math.ceil(Math.sqrt(children.length)) + 1;
        let columnWidth = 0;
        while (
            this._columnCount > 1 &&
            columnWidth < box.get_width() * MASONRY_COLUMN_MIN_WIDTH_PERCENTAGE
        ) {
            this._columnCount--;
            columnWidth =
                (box.get_width() - this._spacing * (this._columnCount - 1)) /
                this._columnCount;
        }
        columnWidth = Math.min(columnWidth, this._maxColumnWidth);
        columnWidth = this._columnWidth;
        const columnHeights = Array(this._columnCount).fill(0); // Tracks the height of each column

        // Calculate total content width and height
        const contentWidth =
            columnWidth * this._columnCount +
            this._spacing * (this._columnCount - 1);

        // Store placements and cache
        const placements = [];
        const allocationCache =
            (container as ContainerWithAllocationCache)._allocationCache ??
            new Map();

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
        const horizontalOffset = (box.get_width() - contentWidth) / 2;
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
            const cachedAlloc = allocationCache.get(child);
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
            allocationCache.set(child, {
                x,
                y: yPosition,
                width: columnWidth,
                height,
            });
        }

        // Store the updated cache for future allocation passes
        (container as ContainerWithAllocationCache)._allocationCache =
            allocationCache;
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

@registerGObjectClass
export default class TilingPopup extends LayoutWidget<TilePreview> {
    private _keyPressEvent: number | undefined;
    private _signals: SignalHandling;
    private _lastTiledWindow: Meta.Window | null;
    private _showing: boolean;

    constructor(
        layout: Layout,
        innerGaps: Clutter.Margin,
        outerGaps: Clutter.Margin,
        workarea: Mtk.Rectangle,
        scalingFactor: number,
        window: ExtendedWindow,
    ) {
        super({
            containerRect: workarea,
            parent: global.windowGroup,
            layout: new Layout([], ''),
            innerGaps,
            outerGaps,
            scalingFactor,
        });
        this._signals = new SignalHandling();
        this._lastTiledWindow = global.display.focusWindow;
        this._showing = true;
        const tiledWindows: ExtendedWindow[] = [];
        const nontiledWindows: Meta.Window[] = [];
        getWindows().forEach((extWin) => {
            if (
                extWin &&
                !extWin.minimized &&
                (extWin as ExtendedWindow).assignedTile
            )
                tiledWindows.push(extWin as ExtendedWindow);
            else nontiledWindows.push(extWin);
        });
        if (nontiledWindows.length === 0) {
            this.destroy();
            return;
        }

        this._relayoutVacantTiles(layout, tiledWindows, window);

        this.canFocus = true;
        this.reactive = true;

        this.show();
        this._recursivelyShowPopup(nontiledWindows);

        this.connect('key-focus-out', () => this.close());

        this._signals.connect(
            global.stage,
            'button-press-event',
            (_: Clutter.Actor, event: Clutter.Event) => {
                const isDescendant = this.contains(event.get_source());
                if (
                    !isDescendant ||
                    event.get_source() === this ||
                    event.get_source().get_layout_manager() instanceof
                        MasonryLayout
                )
                    this.close();
            },
        );
        this.connect('destroy', () => this._signals.disconnect());
    }

    private _relayoutVacantTiles(
        layout: Layout,
        tiledWindows: ExtendedWindow[],
        window: ExtendedWindow,
    ) {
        const tiles = layout.tiles;
        const windowDesiredRect = window.assignedTile
            ? TileUtils.apply_props(window.assignedTile, this._containerRect)
            : window.get_frame_rect();
        const vacantTiles = tiles.filter((t) => {
            if (
                window.assignedTile &&
                t.x === window.assignedTile.x &&
                t.y === window.assignedTile.y &&
                t.width === window.assignedTile.width &&
                t.height === window.assignedTile.height
            )
                return false;
            const tileRect = TileUtils.apply_props(t, this._containerRect);
            return !tiledWindows.find((win) =>
                tileRect.overlap(
                    win !== window ? win.get_frame_rect() : windowDesiredRect,
                ),
            );
        });
        this.relayout({ layout: new Layout(vacantTiles, 'popup') });
    }

    protected override buildTile(
        parent: Clutter.Actor,
        rect: Mtk.Rectangle,
        gaps: Clutter.Margin,
        tile: Tile,
    ): TilePreview {
        const preview = new PopupTilePreview({ parent, rect, gaps, tile });

        const layoutManager = new MasonryLayout(
            MASONRY_LAYOUT_SPACING,
            this._containerRect.width * 0.08,
            this._containerRect.width * 0.15,
        );
        const container = new St.Widget({
            reactive: true,
            x_expand: true,
            y_expand: true,
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            layout_manager: layoutManager,
            style: 'padding: 32px;',
        });
        preview.layout_manager = new Clutter.BinLayout();
        preview.add_child(container);

        return preview;
    }

    private _recursivelyShowPopup(nontiledWindows: Meta.Window[]): void {
        if (this._previews.length === 0 || nontiledWindows.length === 0) {
            this.close();
            return;
        }

        // find the leftmost preview
        let preview = this._previews[0];
        let container = this._previews[0].firstChild;
        this._previews.forEach((prev) => {
            if (prev.x < container.x) {
                container = prev.firstChild;
                preview = prev;
            }
        });

        nontiledWindows.forEach((nonTiledWin) => {
            const winClone = new PopupWindowPreview(nonTiledWin);
            const winActor =
                nonTiledWin.get_compositor_private() as Meta.WindowActor;

            container.add_child(winClone);
            // fade out and unscale by 10% the window actor
            winActor.set_pivot_point(0.5, 0.5);
            winActor.ease({
                opacity: 0,
                duration: ANIMATION_SPEED,
                scaleX: 0.9,
                scaleY: 0.9,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    winActor.hide();
                    winActor.set_pivot_point(0, 0);
                },
            });
            // fade in and upscale by 3% the window preview (i.e. the clone)
            winClone.set_opacity(0);
            winClone.set_pivot_point(0.5, 0.5);
            winClone.set_scale(0.6, 0.6);
            winClone.ease({
                opacity: 255,
                duration: Math.floor(ANIMATION_SPEED * 1.8),
                scaleX: 1.03,
                scaleY: 1.03,
                mode: Clutter.AnimationMode.EASE_IN_OUT,
                onComplete: () => {
                    // scale back to 100% the window preview (i.e the clone)
                    winClone.ease({
                        delay: 60,
                        duration: Math.floor(ANIMATION_SPEED * 2.1),
                        scaleX: 1,
                        scaleY: 1,
                        mode: Clutter.AnimationMode.EASE_IN_OUT,
                        // finally hide the window actor when the whole animation completes
                        onComplete: () => winActor.hide(),
                    });
                },
            });

            // when the clone is destroyed, fade in the window actor
            winClone.connect('destroy', () => {
                if (winActor.visible) return;

                winActor.set_pivot_point(0.5, 0.5);
                winActor.show();
                winActor.ease({
                    opacity: 255,
                    duration: ANIMATION_SPEED,
                    scaleX: 1,
                    scaleY: 1,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onStopped: () => winActor.set_pivot_point(0, 0),
                });
            });

            // when the clone is selected by the user
            winClone.connect('button-press-event', () => {
                // finally move the window
                // the actor has opacity = 0, so this is not seen by the user
                // place the actor with a scale 4% lower, to perform scaling and fading animation later
                winActor.set_pivot_point(0.5, 0.5);
                winActor.set_scale(0.96, 0.96);
                winActor.set_position(preview.innerX, preview.innerY);
                winActor.set_size(preview.innerWidth, preview.innerHeight);

                this._lastTiledWindow = nonTiledWin;
                // place this window on TOP of everyone (we will focus it later, after the animation)
                global.windowGroup.set_child_above_sibling(
                    this._lastTiledWindow.get_compositor_private(),
                    null,
                );
                if (
                    nonTiledWin.maximizedHorizontally ||
                    nonTiledWin.maximizedVertically
                )
                    nonTiledWin.unmaximize(Meta.MaximizeFlags.BOTH);
                if (nonTiledWin.is_fullscreen())
                    nonTiledWin.unmake_fullscreen();
                if (nonTiledWin.minimized) nonTiledWin.unminimize();

                (nonTiledWin as ExtendedWindow).originalSize = nonTiledWin
                    .get_frame_rect()
                    .copy();

                // create a static clone and hide the live clone
                // then we can change the actual window size
                // without showing that to the user
                /* const staticClone = new Clutter.Clone({
                    source: winClone,
                    reactive: false,
                });*/
                // hide the live clone, so we can change the actual window size
                // without showing that to the user
                winClone.opacity = 0;
                preview.ease({
                    opacity: 0,
                    duration: ANIMATION_SPEED,
                    onStopped: () => {
                        this._previews.splice(
                            this._previews.indexOf(preview),
                            1,
                        );
                        preview.destroy();
                        nontiledWindows.splice(
                            nontiledWindows.indexOf(nonTiledWin),
                            1,
                        );
                        this._recursivelyShowPopup(nontiledWindows);
                    },
                });
                nonTiledWin.move_resize_frame(
                    false,
                    preview.innerX,
                    preview.innerY,
                    preview.innerWidth,
                    preview.innerHeight,
                );
                (nonTiledWin as ExtendedWindow).assignedTile = new Tile({
                    ...preview.tile,
                });
                // while we hide the preview, show the actor to the new position,
                // fade in and scale back to 100% size
                winActor.show();
                winActor.ease({
                    opacity: 255,
                    scaleX: 1,
                    scaleY: 1,
                    duration: ANIMATION_SPEED * 0.8,
                    delay: 100,
                    onStopped: () => {
                        winActor.set_pivot_point(0, 0);
                        if (
                            this._previews.length === 0 &&
                            this._lastTiledWindow
                        ) {
                            this._lastTiledWindow.focus(
                                global.get_current_time(),
                            );
                        }
                    },
                });
            });
        });

        this.grab_key_focus();
    }

    public close() {
        if (!this._showing) return;

        this._showing = false;
        this.ease({
            opacity: 0,
            duration: GlobalState.get().tilePreviewAnimationTime,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                this.destroy();
            },
        });
    }
}
