import { registerGObjectClass } from '@/utils/gjs';
import { Clutter, Mtk, Meta, Graphene } from '@gi.ext';
import Layout from '../layout/Layout';
import { getWindows } from '@utils/ui';
import TileUtils from '@components/layout/TileUtils';
import { logger } from '@utils/logger';
import GlobalState from '@utils/globalState';
import ExtendedWindow from '../tilingsystem/extendedWindow';
import PopupWindowPreview from './popupWindowPreview';
import Tile from '@components/layout/Tile';
import TilePreview from '@components/tilepreview/tilePreview';
import LayoutWidget from '@components/layout/LayoutWidget';
import SignalHandling from '@utils/signalHandling';
import PopupTilePreview from '@components/tilingPopup/popupTilePreview';
import MasonryLayoutManager from './masonryLayoutManager';

const debug = logger('TilingPopup');

const ANIMATION_SPEED = 200;
const MASONRY_LAYOUT_ROW_HEIGHT = 0.35;

@registerGObjectClass
export default class TilingLayoutWithPopup extends LayoutWidget<PopupTilePreview> {
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

        if (nontiledWindows.length === 0) {
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
                        MasonryLayoutManager
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
    ): PopupTilePreview {
        return new PopupTilePreview({
            parent,
            rect,
            gaps,
            tile,
            maxRowHeight:
                this._containerRect.height * MASONRY_LAYOUT_ROW_HEIGHT,
        });
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
        let container = this._previews[0].container;
        this._previews.forEach((prev) => {
            if (prev.x < preview.x) {
                container = prev.container;
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

                const winRect = nonTiledWin.get_frame_rect();
                (nonTiledWin as ExtendedWindow).originalSize = winRect.copy();

                // create a static clone and hide the live clone
                // then we can change the actual window size
                // without showing that to the user
                const cl = winClone.get_window_clone() ?? winClone;
                const [x, y] = cl.get_transformed_position();
                const allocation = cl.get_allocation_box();
                const xExcludingShadow = winRect.x - winActor.get_x();
                const yExcludingShadow = winRect.y - winActor.get_y();
                const staticClone = new Clutter.Clone({
                    source: winActor,
                    reactive: false,
                    scale_x: 1,
                    scale_y: 1,
                    x,
                    y,
                    width: allocation.x2 - allocation.x1,
                    height: allocation.y2 - allocation.y1,
                    pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
                });
                global.windowGroup.add_child(staticClone);
                staticClone.ease({
                    x: preview.innerX - xExcludingShadow,
                    y: preview.innerY - yExcludingShadow,
                    width: preview.innerWidth + 2 * yExcludingShadow,
                    height: preview.innerHeight + 2 * xExcludingShadow,
                    duration: ANIMATION_SPEED * 1.8,
                    onStopped: () => {
                        winActor.opacity = 255;
                        winActor.set_scale(1, 1);
                        if (
                            this._previews.length === 0 &&
                            this._lastTiledWindow
                        ) {
                            this._lastTiledWindow.focus(
                                global.get_current_time(),
                            );
                        }
                        staticClone.destroy();
                    },
                });
                // hide the live clone, since we have a clone animating on top of it
                winClone.opacity = 0;
                // begin hiding the preview. Destroy it when it is hidden
                // and recursively show popup on the next vacant tile
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
                // finally move the window
                // the actor has opacity = 0, so this is not seen by the user
                winActor.set_pivot_point(0, 0);
                winActor.set_position(preview.innerX, preview.innerY);
                winActor.set_size(preview.innerWidth, preview.innerHeight);
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
                // this has opacity of 0 so it is hidden. Later we immediately swap
                // the animating actor with this
                winActor.show();
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
