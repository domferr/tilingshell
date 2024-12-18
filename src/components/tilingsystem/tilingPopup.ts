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
const MASONRY_ROW_MIN_HEIGHT_PERCENTAGE = 0.3;

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
    private _rowCount: number;
    private _spacing: number;
    private _maxRowHeight: number;
    private _rowHeight: number;

    constructor(spacing: number, rowHeight: number, maxRowHeight: number) {
        super();
        this._rowCount = 0; // Number of rows
        this._spacing = spacing; // Spacing between items
        this._maxRowHeight = maxRowHeight;
        this._rowHeight = rowHeight;
    }

    vfunc_allocate(container: Clutter.Actor, box: Clutter.ActorBox) {
        const children = container.get_children();
        if (children.length === 0) return;

        this._rowCount = Math.ceil(Math.sqrt(children.length)) + 1;
        let rowHeight = 0;
        while (
            this._rowCount > 1 &&
            rowHeight < box.get_height() * MASONRY_ROW_MIN_HEIGHT_PERCENTAGE
        ) {
            this._rowCount--;
            rowHeight =
                (box.get_height() - this._spacing * (this._rowCount - 1)) /
                this._rowCount;
        }
        rowHeight = Math.min(rowHeight, this._maxRowHeight);
        rowHeight = this._rowHeight;
        const rowWidths = Array(this._rowCount).fill(0); // Tracks the width of each row

        // Calculate total content height and width
        const contentHeight =
            rowHeight * this._rowCount + this._spacing * (this._rowCount - 1);

        // Store placements and cache
        const placements = [];
        const allocationCache =
            (container as ContainerWithAllocationCache)._allocationCache ??
            new Map();

        for (const child of children) {
            // Retrieve the preferred height and width to calculate the aspect ratio
            const [minHeight, naturalHeight] = child.get_preferred_height(-1);
            const [minWidth, naturalWidth] =
                child.get_preferred_width(naturalHeight);

            // Maintain the aspect ratio
            const aspectRatio = naturalWidth / naturalHeight;
            const width = rowHeight * aspectRatio;

            // Find the shortest row
            const shortestRow = rowWidths.indexOf(Math.min(...rowWidths));
            placements.push({
                child,
                row: shortestRow,
                width,
                x: rowWidths[shortestRow],
                rowWidth: 0,
            });

            // Update row height
            rowWidths[shortestRow] += width + this._spacing;
        }
        for (const placement of placements)
            placement.rowWidth = rowWidths[placement.row];

        const sortedRowWidths: number[][] = [...rowWidths].map((v, i) => [
            v,
            i,
        ]);
        sortedRowWidths.sort((a, b) => b[0] - a[0]);
        const rowsOrdering = new Map<number, number>();
        sortedRowWidths.forEach((row, newIndex) => {
            const index = row[1];
            rowsOrdering.set(
                index,
                (newIndex + Math.floor(this._rowCount / 2)) % this._rowCount,
            );
        });
        for (const placement of placements)
            placement.row = rowsOrdering.get(placement.row) ?? placement.row;

        // Calculate offsets for centering the entire grid within the available space
        const verticalOffset = (box.get_height() - contentHeight) / 2;
        // Determine the largest row and center the content around it
        const largestRowWidth = sortedRowWidths[0][0];
        const horizontalOffset = (box.get_width() - largestRowWidth) / 2;

        // Reset row heights for actual allocation
        rowWidths.fill(0);

        // Allocate children with preserved proportions
        for (const placement of placements) {
            const { child, row, width, x, rowWidth } = placement;
            const y =
                box.y1 + row * (rowHeight + this._spacing) + verticalOffset;
            const rowOffset = (largestRowWidth - rowWidth) / 2;
            const xPosition =
                box.x1 + x + horizontalOffset + rowOffset + this._spacing / 2;

            // Check if this child has a cached allocation
            const cachedAlloc = allocationCache.get(child);
            if (cachedAlloc) {
                child.allocate(
                    new Clutter.ActorBox({
                        x1: cachedAlloc.x,
                        y1: cachedAlloc.y,
                        x2: cachedAlloc.x + width,
                        y2: cachedAlloc.y + rowHeight,
                    }),
                );
                continue; // Skip reallocation
            }

            // If the allocation has changed or no cache exists, perform new allocation
            child.allocate(
                new Clutter.ActorBox({
                    x1: xPosition,
                    y1: y,
                    x2: xPosition + width,
                    y2: y + rowHeight,
                }),
            );

            // Update cache with the new allocation
            allocationCache.set(child, {
                x: xPosition,
                y,
                height: rowHeight,
                width,
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

        const rowWidths = Array(this._rowCount).fill(0);
        const rowWidth =
            (forHeight - this._spacing * (this._rowCount - 1)) / this._rowCount;

        for (const child of children) {
            const preferredWidth = child.get_preferred_width(rowWidth)[1];
            const shortestRow = rowWidths.indexOf(Math.min(...rowWidths));
            rowWidths[shortestRow] += preferredWidth + this._spacing;
        }

        const totalWidth = Math.max(...rowWidths);
        return [totalWidth, totalWidth];
    }

    vfunc_get_preferred_height(
        container: Clutter.Actor,
        forWidth: number,
    ): [number, number] {
        const children = container.get_children();
        if (children.length === 0) return [0, 0];

        const childHeights = children.map(
            (child) => child.get_preferred_height(forWidth)[1],
        );
        const maxChildHeights = Math.max(...childHeights);

        const totalHeight =
            this._rowCount * maxChildHeights +
            (this._rowCount - 1) * this._spacing;
        return [totalHeight, totalHeight];
    }
}

@registerGObjectClass
export default class TilingPopup extends LayoutWidget<TilePreview> {
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
        this.canFocus = true;
        this.reactive = true;
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
        // TODO: let's make this available in the future
        const enabled = false;
        if (nontiledWindows.length === 0 || !enabled) {
            this.destroy();
            return;
        }

        this._relayoutVacantTiles(layout, tiledWindows, window);

        this.show();
        this._recursivelyShowPopup(nontiledWindows, window.get_monitor());

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
        this._signals.connect(
            global.stage,
            'key-press-event',
            (_: Clutter.Actor, event: Clutter.Event) => {
                const symbol = event.get_key_symbol();
                if (symbol === Clutter.KEY_Escape) this.close();

                return Clutter.EVENT_PROPAGATE;
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
            this._containerRect.height * 0.2,
            this._containerRect.height * 0.3,
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

    private _recursivelyShowPopup(
        nontiledWindows: Meta.Window[],
        monitorIndex: number,
    ): void {
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
                        this._recursivelyShowPopup(
                            nontiledWindows,
                            monitorIndex,
                        );
                    },
                });
                const user_op = false;
                nonTiledWin.move_to_monitor(monitorIndex);
                nonTiledWin.move_frame(user_op, preview.innerX, preview.innerY);
                nonTiledWin.move_resize_frame(
                    user_op,
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
