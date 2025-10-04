import { registerGObjectClass } from '@/utils/gjs';
import { Clutter, Mtk, Meta, St } from '@gi.ext';
import Layout from '../layout/Layout';
import { buildRectangle } from '@utils/ui';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { logger } from '@utils/logger';
import GlobalState from '@utils/globalState';
import ExtendedWindow from '../tilingsystem/extendedWindow';
import SuggestedWindowPreview from './suggestedWindowPreview';
import Tile from '@components/layout/Tile';
import LayoutWidget from '@components/layout/LayoutWidget';
import SignalHandling from '@utils/signalHandling';
import SuggestionsTilePreview from '@components/windowsSuggestions/suggestionsTilePreview';
import TilingShellWindowManager from '@components/windowManager/tilingShellWindowManager';
import { unmaximizeWindow } from '@utils/gnomesupport';

const debug = logger('TilingLayoutWithSuggestions');

const ANIMATION_SPEED = 200;
const MASONRY_LAYOUT_ROW_HEIGHT = 0.31;

@registerGObjectClass
export default class TilingLayoutWithSuggestions extends LayoutWidget<SuggestionsTilePreview> {
    private _signals: SignalHandling;
    private _lastTiledWindow: Meta.Window | null;
    private _showing: boolean;
    private _oldPreviews: SuggestionsTilePreview[];

    constructor(
        innerGaps: Clutter.Margin,
        outerGaps: Clutter.Margin,
        containerRect: Mtk.Rectangle,
        scalingFactor?: number,
    ) {
        super({
            containerRect,
            parent: global.windowGroup,
            layout: new Layout([], ''),
            innerGaps,
            outerGaps,
            scalingFactor,
        });
        this.canFocus = true;
        this.reactive = true;
        this._signals = new SignalHandling();
        this._lastTiledWindow = null;
        this._showing = false;
        this._oldPreviews = [];
        this.connect('destroy', () => this._signals.disconnect());
    }

    protected override buildTile(
        parent: Clutter.Actor,
        rect: Mtk.Rectangle,
        gaps: Clutter.Margin,
        tile: Tile,
    ): SuggestionsTilePreview {
        return new SuggestionsTilePreview({
            parent,
            rect,
            gaps,
            tile,
        });
    }

    public open(
        tiledWindows: ExtendedWindow[],
        nontiledWindows: Meta.Window[],
        window: Meta.Window,
        windowDesiredRect: Mtk.Rectangle,
        monitorIndex: number,
    ) {
        if (this._showing) return;
        this._showing = true;

        this._lastTiledWindow = global.display.focusWindow;
        this._showVacantPreviewsOnly(tiledWindows, windowDesiredRect, window);

        this.show();
        this._recursivelyShowPopup(nontiledWindows, monitorIndex);

        this._signals.disconnect();
        this._signals.connect(this, 'key-focus-out', () => this.close());
        this._signals.connect(this, 'button-press-event', () => {
            // if a window clone is pressed by a button, it will stop propagating the event
            // then if this is called it is not a window clone that was pressed
            this.close();
        });
        this._signals.connect(
            global.stage,
            'key-press-event',
            (_: Clutter.Actor, event: Clutter.Event) => {
                const symbol = event.get_key_symbol();
                if (symbol === Clutter.KEY_Escape) this.close();

                return Clutter.EVENT_PROPAGATE;
            },
        );
    }

    private _showVacantPreviewsOnly(
        tiledWindows: ExtendedWindow[],
        windowDesiredRect: Mtk.Rectangle,
        window: Meta.Window,
    ) {
        const vacantPreviews = this._previews.map((prev) => {
            const previewRect = buildRectangle({
                x: prev.innerX,
                y: prev.innerY,
                width: prev.innerWidth,
                height: prev.innerHeight,
            });
            return !tiledWindows.find((win) =>
                previewRect.overlap(
                    win === window ? windowDesiredRect : win.get_frame_rect(),
                ),
            );
        });
        const newPreviews = [];
        for (let index = 0; index < this._previews.length; index++) {
            if (vacantPreviews[index]) {
                this._previews[index].open();
                newPreviews.push(this._previews[index]);
            } else {
                this._previews[index].close();
                this._oldPreviews.push(this._previews[index]);
            }
        }
        this._previews = newPreviews;
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
        this._previews.forEach((prev) => {
            if (prev.x < preview.x) preview = prev;
        });

        const clones = nontiledWindows.map((nonTiledWin) => {
            const winClone = new SuggestedWindowPreview(nonTiledWin);
            const winActor =
                nonTiledWin.get_compositor_private() as Meta.WindowActor;

            // fade out and unscale by 10% the window actor
            winActor.set_pivot_point(0.5, 0.5);
            if (!nonTiledWin.minimized) {
                // we don't need to hide the actor if the window is minimized
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
            }

            // when the clone is destroyed, fade in the window actor
            winClone.connect('destroy', () => {
                if (nonTiledWin.minimized) {
                    // we don't need to show the actor if the window is minimized
                    winActor.set_pivot_point(0, 0);
                    return;
                }
                if (winActor.visible) return;

                // animate scale back (from the center of the actor)
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
                // we will focus it later, after the animation and if any other window is tiled
                this._lastTiledWindow = nonTiledWin;
                // place this window on TOP of everyone ()
                if (
                    nonTiledWin.maximizedHorizontally ||
                    nonTiledWin.maximizedVertically
                )
                    unmaximizeWindow(nonTiledWin);

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
                TilingShellWindowManager.easeMoveWindow({
                    window: nonTiledWin,
                    from: buildRectangle({
                        x,
                        y,
                        width: allocation.x2 - allocation.x1,
                        height: allocation.y2 - allocation.y1,
                    }),
                    to: buildRectangle({
                        x: preview.innerX,
                        y: preview.innerY,
                        width: preview.innerWidth,
                        height: preview.innerHeight,
                    }),
                    duration: ANIMATION_SPEED * 1.8,
                    monitorIndex,
                });
                // finally assign the tile to the window
                (nonTiledWin as ExtendedWindow).assignedTile = new Tile({
                    ...preview.tile,
                });
                // hide the live clone, since we have a clone animating on top of it
                winClone.opacity = 0;
                // begin hiding the preview. Destroy it when it is hidden
                // and recursively show popup on the next vacant tile
                const removed = this._previews.splice(
                    this._previews.indexOf(preview),
                    1,
                );
                this._oldPreviews.push(...removed);
                nontiledWindows.splice(nontiledWindows.indexOf(nonTiledWin), 1);
                preview.close(true);
                this._recursivelyShowPopup(nontiledWindows, monitorIndex);
                return Clutter.EVENT_STOP; // Blocca la propagazione
            });
            return winClone;
        });

        preview.addWindows(
            clones,
            this._containerRect.height * MASONRY_LAYOUT_ROW_HEIGHT,
        );

        // show every clone with a fade in and scaling animation
        clones.forEach((winClone) => {
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
                    });
                },
            });
        });

        this.grab_key_focus();
    }

    public close() {
        if (!this._showing) return;
        this._showing = false;
        // we need to disconnect because we will lose focus and
        // the signal key-focus-out will be triggered
        this._signals.disconnect();

        if (this._lastTiledWindow) Main.activateWindow(this._lastTiledWindow);

        this._previews.push(...this._oldPreviews);
        this._oldPreviews = [];
        this._previews.forEach((prev) => prev.removeAllWindows());

        this.ease({
            opacity: 0,
            duration: GlobalState.get().tilePreviewAnimationTime,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                this.hide();
                this._previews.forEach((prev) => prev.open());
            },
        });
    }
}
