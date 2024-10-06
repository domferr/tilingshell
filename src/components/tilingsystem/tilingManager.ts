import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { logger } from '@/utils/shell';
import {
    buildMargin,
    buildRectangle,
    buildTileGaps,
    getMonitorScalingFactor,
    getScalingFactorOf,
    isPointInsideRect,
    squaredEuclideanDistance,
} from '@/utils/ui';
import TilingLayout from '@/components/tilingsystem/tilingLayout';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import SnapAssist from '../snapassist/snapAssist';
import SelectionTilePreview from '../tilepreview/selectionTilePreview';
import Settings, { ActivationKey } from '@settings/settings';
import SignalHandling from '@utils/signalHandling';
import Layout from '../layout/Layout';
import Tile from '../layout/Tile';
import TileUtils from '../layout/TileUtils';
import GlobalState from '@utils/globalState';
import { Monitor } from 'resource:///org/gnome/shell/ui/layout.js';
import ExtendedWindow from './extendedWindow';
import EdgeTilingManager from './edgeTilingManager';
import TouchPointer from './touchPointer';

const MINIMUM_DISTANCE_TO_RESTORE_ORIGINAL_SIZE = 90;

export class TilingManager {
    private readonly _monitor: Monitor;

    private _selectedTilesPreview: SelectionTilePreview;
    private _snapAssist: SnapAssist;
    private _tilingLayout: TilingLayout;
    private _edgeTilingManager: EdgeTilingManager;

    private _workArea: Mtk.Rectangle;
    private _enableScaling: boolean;

    private _isGrabbingWindow: boolean;
    private _movingWindowTimerDuration: number = 15;
    private _lastCursorPos: { x: number; y: number } | null = null;
    private _grabStartPosition: { x: number; y: number } | null = null;
    private _wasSpanMultipleTilesActivated: boolean;
    private _wasTilingSystemActivated: boolean;
    private _isSnapAssisting: boolean;

    private _movingWindowTimerId: number | null = null;

    private readonly _signals: SignalHandling;
    private readonly _debug: (...content: unknown[]) => void;

    /**
     * Constructs a new TilingManager instance.
     * @param monitor The monitor to manage tiling for.
     */
    constructor(monitor: Monitor, enableScaling: boolean) {
        this._isGrabbingWindow = false;
        this._wasSpanMultipleTilesActivated = false;
        this._wasTilingSystemActivated = false;
        this._isSnapAssisting = false;
        this._enableScaling = enableScaling;
        this._monitor = monitor;
        this._signals = new SignalHandling();

        this._debug = logger(`TilingManager ${monitor.index}`);
        const layout: Layout = GlobalState.get().getSelectedLayoutOfMonitor(
            monitor.index,
        );

        // get the monitor's workarea
        this._workArea = Main.layoutManager.getWorkAreaForMonitor(
            this._monitor.index,
        );
        this._debug(
            `Work area for monitor ${this._monitor.index}: ${this._workArea.x} ${this._workArea.y} ${this._workArea.width}x${this._workArea.height}`,
        );
        this._edgeTilingManager = new EdgeTilingManager(this._workArea);

        // handle scale factor of the monitor
        const innerGaps = buildMargin(Settings.get_inner_gaps());
        const outerGaps = buildMargin(Settings.get_outer_gaps());
        const monitorScalingFactor = this._enableScaling
            ? getMonitorScalingFactor(monitor.index)
            : undefined;

        // build the tiling layout
        this._tilingLayout = new TilingLayout(
            layout,
            innerGaps,
            outerGaps,
            this._workArea,
            monitorScalingFactor,
        );

        // build the selection tile
        this._selectedTilesPreview = new SelectionTilePreview({
            parent: global.windowGroup,
        });

        // build the snap assistant
        this._snapAssist = new SnapAssist(
            Main.uiGroup,
            this._workArea,
            this._monitor.index,
            monitorScalingFactor,
        );
    }

    /**
     * Enables tiling manager by setting up event listeners:
     *  - handle any window's grab begin.
     *  - handle any window's grab end.
     *  - handle grabbed window's movement.
     */
    public enable() {
        this._signals.connect(
            Settings,
            Settings.SETTING_SELECTED_LAYOUTS,
            () => {
                const layout = GlobalState.get().getSelectedLayoutOfMonitor(
                    this._monitor.index,
                );
                this._tilingLayout.relayout({ layout });
            },
        );
        this._signals.connect(
            GlobalState.get(),
            GlobalState.SIGNAL_LAYOUTS_CHANGED,
            () => {
                const layout = GlobalState.get().getSelectedLayoutOfMonitor(
                    this._monitor.index,
                );
                this._tilingLayout.relayout({ layout });
            },
        );

        this._signals.connect(Settings, Settings.SETTING_INNER_GAPS, () => {
            const innerGaps = buildMargin(Settings.get_inner_gaps());
            this._tilingLayout.relayout({ innerGaps });
        });
        this._signals.connect(Settings, Settings.SETTING_OUTER_GAPS, () => {
            const outerGaps = buildMargin(Settings.get_outer_gaps());
            this._tilingLayout.relayout({ outerGaps });
        });

        this._signals.connect(
            global.display,
            'grab-op-begin',
            (
                _display: Meta.Display,
                window: Meta.Window,
                grabOp: Meta.GrabOp,
            ) => {
                const moving = (grabOp & ~1024) === 1;
                if (!moving) return;

                this._onWindowGrabBegin(window, grabOp);
            },
        );

        this._signals.connect(
            global.display,
            'grab-op-end',
            (_display: Meta.Display, window: Meta.Window) => {
                if (!this._isGrabbingWindow) return;

                this._onWindowGrabEnd(window);
            },
        );

        this._signals.connect(
            this._snapAssist,
            'snap-assist',
            this._onSnapAssist.bind(this),
        );
    }

    public onUntileWindow(window: Meta.Window, force: boolean): void {
        const destination = (window as ExtendedWindow).originalSize;
        if (!destination) return;

        this._easeWindowRect(window, destination, false, force);

        (window as ExtendedWindow).originalSize = undefined;
    }

    public onKeyboardMoveWindow(
        window: Meta.Window,
        direction: Meta.DisplayDirection | undefined, // direction is undefined -> move to the center of the screen
        force: boolean,
        spanFlag: boolean,
    ): boolean {
        let destination: { rect: Mtk.Rectangle; tile: Tile } | undefined;
        if (window.get_maximized()) {
            if (spanFlag) return false;

            switch (direction) {
                case undefined:
                    window.unmaximize(Meta.MaximizeFlags.BOTH);
                    break;
                case Meta.DisplayDirection.DOWN:
                    window.unmaximize(Meta.MaximizeFlags.BOTH);
                    return true;
                case Meta.DisplayDirection.UP:
                    return false;
                case Meta.DisplayDirection.LEFT:
                    destination = this._tilingLayout.getLeftmostTile();
                    break;
                case Meta.DisplayDirection.RIGHT:
                    destination = this._tilingLayout.getRightmostTile();
                    break;
            }
        }

        // find the nearest tile
        const windowRectCopy = window.get_frame_rect().copy();
        if (!destination) {
            // if the window is not tiled, find the nearest tile in any direction
            if (!direction) {
                // direction is undefined -> move to the center of the screen
                const rect = buildRectangle({
                    x:
                        this._workArea.x +
                        this._workArea.width / 2 -
                        windowRectCopy.width / 2,
                    y:
                        this._workArea.y +
                        this._workArea.height / 2 -
                        windowRectCopy.height / 2,
                    width: windowRectCopy.width,
                    height: windowRectCopy.height,
                });
                destination = {
                    rect,
                    tile: TileUtils.build_tile(rect, this._workArea),
                };
            } else if (!(window as ExtendedWindow).assignedTile) {
                destination =
                    this._tilingLayout.findNearestTile(windowRectCopy);
            } else {
                destination = this._tilingLayout.findNearestTileDirection(
                    windowRectCopy,
                    direction,
                );
            }
        }

        // there isn't a tile near the window
        if (!destination) {
            if (spanFlag) return false;

            // handle maximize of window
            if (
                direction === Meta.DisplayDirection.UP &&
                window.can_maximize()
            ) {
                window.maximize(Meta.MaximizeFlags.BOTH);
                return true;
            }
            return false;
        }

        if (!(window as ExtendedWindow).assignedTile && !window.get_maximized())
            (window as ExtendedWindow).originalSize = windowRectCopy;

        if (spanFlag) {
            destination.rect = destination.rect.union(windowRectCopy);
            destination.tile = TileUtils.build_tile(
                destination.rect,
                this._workArea,
            );
        }

        // ensure the assigned tile is a COPY
        (window as ExtendedWindow).assignedTile = new Tile({
            ...destination.tile,
        });

        if (window.get_maximized()) window.unmaximize(Meta.MaximizeFlags.BOTH);

        this._easeWindowRect(window, destination.rect, false, force);
        return true;
    }

    /**
     * Destroys the tiling manager and cleans up resources.
     */
    public destroy() {
        if (this._movingWindowTimerId) {
            GLib.Source.remove(this._movingWindowTimerId);
            this._movingWindowTimerId = null;
        }
        this._signals.disconnect();
        this._isGrabbingWindow = false;
        this._isSnapAssisting = false;
        this._edgeTilingManager.abortEdgeTiling();
        this._tilingLayout.destroy();
        this._snapAssist.destroy();
        this._selectedTilesPreview.destroy();
    }

    public set workArea(newWorkArea: Mtk.Rectangle) {
        if (newWorkArea.equal(this._workArea)) return;

        this._workArea = newWorkArea;
        this._debug(
            `new work area for monitor ${this._monitor.index}: ${newWorkArea.x} ${newWorkArea.y} ${newWorkArea.width}x${newWorkArea.height}`,
        );

        // notify the tiling layout that the workarea changed and trigger a new relayout
        // so we will have the layout already computed to be shown quickly when needed
        this._tilingLayout.relayout({ containerRect: this._workArea });
        this._snapAssist.workArea = this._workArea;
        this._edgeTilingManager.workarea = this._workArea;
    }

    private _onWindowGrabBegin(window: Meta.Window, grabOp: number) {
        if (this._isGrabbingWindow) return;

        TouchPointer.get().updateWindowPosition(window.get_frame_rect());
        this._signals.connect(
            global.stage,
            'touch-event',
            (_source, event: Clutter.Event) => {
                const [x, y] = event.get_coords();
                TouchPointer.get().onTouchEvent(x, y);
            },
        );

        // workaround for gnome-shell bug https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/2857
        if (
            Settings.get_enable_blur_snap_assistant() ||
            Settings.get_enable_blur_selected_tilepreview()
        ) {
            this._signals.connect(window, 'position-changed', () => {
                if (Settings.get_enable_blur_selected_tilepreview()) {
                    this._selectedTilesPreview
                        .get_effect('blur')
                        ?.queue_repaint();
                }
                if (Settings.get_enable_blur_snap_assistant()) {
                    this._snapAssist
                        .get_first_child()
                        ?.get_effect('blur')
                        ?.queue_repaint();
                }
            });
        }

        this._isGrabbingWindow = true;
        this._movingWindowTimerId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            this._movingWindowTimerDuration,
            this._onMovingWindow.bind(this, window, grabOp),
        );

        this._onMovingWindow(window, grabOp);
    }

    private _activationKeyStatus(
        modifier: number,
        key: ActivationKey,
    ): boolean {
        if (key === ActivationKey.NONE) return true;

        let val = 2;
        switch (key) {
            case ActivationKey.CTRL:
                val = 2; // Clutter.ModifierType.CONTROL_MASK
                break;
            case ActivationKey.ALT:
                val = 3; // Clutter.ModifierType.MOD1_MASK
                break;
            case ActivationKey.SUPER:
                val = 6; // Clutter.ModifierType.SUPER_MASK
                break;
        }
        return (modifier & (1 << val)) !== 0;
    }

    private _onMovingWindow(window: Meta.Window, grabOp: number) {
        // if the window is no longer grabbed, disable handler
        if (!this._isGrabbingWindow) {
            this._movingWindowTimerId = null;
            return GLib.SOURCE_REMOVE;
        }

        // if the window was moved into another monitor and it is still grabbed
        if (
            !window.allows_resize() ||
            !window.allows_move() ||
            !this._isPointerInsideThisMonitor(window)
        ) {
            this._tilingLayout.close();
            this._selectedTilesPreview.close(true);
            this._snapAssist.close(true);
            this._isSnapAssisting = false;
            this._edgeTilingManager.abortEdgeTiling();

            return GLib.SOURCE_CONTINUE;
        }

        const [x, y, modifier] = TouchPointer.get().isTouchDeviceActive()
            ? TouchPointer.get().get_pointer(window)
            : global.get_pointer();
        const extWin = window as ExtendedWindow;
        extWin.assignedTile = undefined;
        const currPointerPos = { x, y };
        if (this._grabStartPosition === null)
            this._grabStartPosition = { x, y };

        // if there is "originalSize" attached, it means the window were tiled and
        // it is the first time the window is moved. If that's the case, change
        // window's size to the size it had before it were tiled (the originalSize)
        if (
            extWin.originalSize &&
            squaredEuclideanDistance(currPointerPos, this._grabStartPosition) >
                MINIMUM_DISTANCE_TO_RESTORE_ORIGINAL_SIZE
        ) {
            if (Settings.get_restore_window_original_size()) {
                const windowRect = window.get_frame_rect();
                const offsetX = (x - windowRect.x) / windowRect.width;
                const offsetY = (y - windowRect.y) / windowRect.height;

                const newSize = buildRectangle({
                    x: x - extWin.originalSize.width * offsetX,
                    y: y - extWin.originalSize.height * offsetY,
                    width: extWin.originalSize.width,
                    height: extWin.originalSize.height,
                });

                // restart grab for GNOME 42
                const restartGrab =
                    // @ts-expect-error "grab is available on GNOME 42"
                    global.display.end_grab_op && global.display.begin_grab_op;
                if (restartGrab) {
                    // @ts-expect-error "grab is available on GNOME 42"
                    global.display.end_grab_op(global.get_current_time());
                }
                // if we restarted the grab, we need to force window movement and to
                // perform user operation
                this._easeWindowRect(window, newSize, restartGrab, restartGrab);
                TouchPointer.get().updateWindowPosition(newSize);

                if (restartGrab) {
                    // must be done now, before begin_grab_op, because begin_grab_op will trigger
                    // _onMovingWindow again, so we will go into infinite loop on restoring the window size
                    extWin.originalSize = undefined;
                    // @ts-expect-error "grab is available on GNOME 42"
                    global.display.begin_grab_op(
                        window,
                        grabOp,
                        true, // pointer already grabbed
                        true, // frame action
                        -1, // Button
                        modifier,
                        global.get_current_time(),
                        x,
                        y,
                    );
                }
            }
            extWin.originalSize = undefined;
            this._grabStartPosition = null;
        }

        const isSpanMultiTilesActivated = this._activationKeyStatus(
            modifier,
            Settings.get_span_multiple_tiles_activation_key(),
        );
        const isTilingSystemActivated = this._activationKeyStatus(
            modifier,
            Settings.get_tiling_system_activation_key(),
        );
        const allowSpanMultipleTiles =
            Settings.get_span_multiple_tiles() && isSpanMultiTilesActivated;
        const showTilingSystem =
            Settings.get_tiling_system_enabled() && isTilingSystemActivated;
        // ensure we handle window movement only when needed
        // if the snap assistant activation key status is not changed and the mouse is on the same position as before
        // and the tiling system activation key status is not changed, we have nothing to do
        const changedSpanMultipleTiles =
            Settings.get_span_multiple_tiles() &&
            isSpanMultiTilesActivated !== this._wasSpanMultipleTilesActivated;
        const changedShowTilingSystem =
            Settings.get_tiling_system_enabled() &&
            isTilingSystemActivated !== this._wasTilingSystemActivated;
        if (
            !changedSpanMultipleTiles &&
            !changedShowTilingSystem &&
            currPointerPos.x === this._lastCursorPos?.x &&
            currPointerPos.y === this._lastCursorPos?.y
        )
            return GLib.SOURCE_CONTINUE;

        this._lastCursorPos = currPointerPos;
        this._wasTilingSystemActivated = isTilingSystemActivated;
        this._wasSpanMultipleTilesActivated = isSpanMultiTilesActivated;

        // layout must not be shown if it was disabled or if it is enabled but tiling system activation key is not pressed
        // then close it and open snap assist (if enabled)
        if (!showTilingSystem) {
            if (this._tilingLayout.showing) {
                this._tilingLayout.close();
                this._selectedTilesPreview.close(true);
            }

            if (
                Settings.get_active_screen_edges() &&
                !this._isSnapAssisting &&
                this._edgeTilingManager.canActivateEdgeTiling(currPointerPos)
            ) {
                const { changed, rect } =
                    this._edgeTilingManager.startEdgeTiling(currPointerPos);
                if (changed) this._showEdgeTiling(window, rect, x, y);
                this._snapAssist.close(true);
            } else {
                if (this._edgeTilingManager.isPerformingEdgeTiling()) {
                    this._selectedTilesPreview.close(true);
                    this._edgeTilingManager.abortEdgeTiling();
                }

                if (Settings.get_snap_assist_enabled()) {
                    this._snapAssist.onMovingWindow(
                        window,
                        true,
                        currPointerPos,
                    );
                }
            }

            return GLib.SOURCE_CONTINUE;
        }

        // we know that the layout must be shown, snap assistant must be closed
        if (!this._tilingLayout.showing) {
            // this._debug("open layout below grabbed window");
            this._tilingLayout.openAbove(window);
            this._snapAssist.close(true);
            // close selection tile if we were performing edge-tiling
            if (this._edgeTilingManager.isPerformingEdgeTiling()) {
                this._selectedTilesPreview.close(true);
                this._edgeTilingManager.abortEdgeTiling();
            }
        }
        // if it was snap assisting then close the selection tile preview. We may reopen it if that's the case
        if (this._isSnapAssisting) {
            this._selectedTilesPreview.close(true);
            this._isSnapAssisting = false;
        }

        // if the pointer is inside the current selection and ALT key status is not changed, then there is nothing to do
        if (
            !changedSpanMultipleTiles &&
            isPointInsideRect(currPointerPos, this._selectedTilesPreview.rect)
        )
            return GLib.SOURCE_CONTINUE;

        let selectionRect = this._tilingLayout.getTileBelow(
            currPointerPos,
            changedSpanMultipleTiles && !allowSpanMultipleTiles,
        );
        if (!selectionRect) return GLib.SOURCE_CONTINUE;

        selectionRect = selectionRect.copy();
        if (allowSpanMultipleTiles && this._selectedTilesPreview.showing) {
            selectionRect = selectionRect.union(
                this._selectedTilesPreview.rect,
            );
        }
        this._tilingLayout.hoverTilesInRect(
            selectionRect,
            !allowSpanMultipleTiles,
        );

        this._selectedTilesPreview.gaps = buildTileGaps(
            selectionRect,
            this._tilingLayout.innerGaps,
            this._tilingLayout.outerGaps,
            this._workArea,
            this._enableScaling
                ? getScalingFactorOf(this._tilingLayout)[1]
                : undefined,
        );
        this._selectedTilesPreview.openAbove(window, true, selectionRect);

        return GLib.SOURCE_CONTINUE;
    }

    private _onWindowGrabEnd(window: Meta.Window) {
        this._isGrabbingWindow = false;
        this._grabStartPosition = null;

        this._signals.disconnect(window);
        TouchPointer.get().reset();
        this._tilingLayout.close();
        const desiredWindowRect = buildRectangle({
            x: this._selectedTilesPreview.innerX,
            y: this._selectedTilesPreview.innerY,
            width: this._selectedTilesPreview.innerWidth,
            height: this._selectedTilesPreview.innerHeight,
        });
        const selectedTilesRect = this._selectedTilesPreview.rect.copy();
        this._selectedTilesPreview.close(true);
        this._snapAssist.close(true);
        this._lastCursorPos = null;

        const isTilingSystemActivated = this._activationKeyStatus(
            global.get_pointer()[2],
            Settings.get_tiling_system_activation_key(),
        );
        if (
            !isTilingSystemActivated &&
            !this._isSnapAssisting &&
            !this._edgeTilingManager.isPerformingEdgeTiling()
        )
            return;

        // disable snap assistance
        this._isSnapAssisting = false;

        if (
            this._edgeTilingManager.isPerformingEdgeTiling() &&
            this._edgeTilingManager.needMaximize() &&
            window.can_maximize()
        )
            window.maximize(Meta.MaximizeFlags.BOTH);

        // disable edge-tiling
        this._edgeTilingManager.abortEdgeTiling();

        // abort if the pointer is moving on another monitor: the user moved
        // the window to another monitor not handled by this tiling manager
        if (!this._isPointerInsideThisMonitor(window)) return;

        // abort if there is an invalid selection
        if (desiredWindowRect.width <= 0 || desiredWindowRect.height <= 0)
            return;

        if (window.get_maximized()) return;

        (window as ExtendedWindow).originalSize = window
            .get_frame_rect()
            .copy();
        (window as ExtendedWindow).assignedTile = new Tile({
            ...TileUtils.build_tile(selectedTilesRect, this._workArea),
        });
        this._easeWindowRect(window, desiredWindowRect);
    }

    private _easeWindowRect(
        window: Meta.Window,
        destRect: Mtk.Rectangle,
        user_op: boolean = false,
        force: boolean = false,
    ) {
        const windowActor = window.get_compositor_private() as Clutter.Actor;

        const beforeRect = window.get_frame_rect();
        // do not animate the window if it will not move or scale
        if (
            destRect.x === beforeRect.x &&
            destRect.y === beforeRect.y &&
            destRect.width === beforeRect.width &&
            destRect.height === beforeRect.height
        )
            return;

        // apply animations when tiling the window
        windowActor.remove_all_transitions();
        // @ts-expect-error "Main.wm has the private function _prepareAnimationInfo"
        Main.wm._prepareAnimationInfo(
            global.windowManager,
            windowActor,
            beforeRect.copy(),
            Meta.SizeChange.UNMAXIMIZE,
        );

        // move and resize the window to the current selection
        window.move_to_monitor(this._monitor.index);
        if (force) window.move_frame(user_op, destRect.x, destRect.y);
        window.move_resize_frame(
            user_op,
            destRect.x,
            destRect.y,
            destRect.width,
            destRect.height,
        );
    }

    private _onSnapAssist(_: SnapAssist, tile: Tile) {
        // if there isn't a tile hovered, then close selection
        if (tile.width === 0 || tile.height === 0) {
            this._selectedTilesPreview.close(true);
            this._isSnapAssisting = false;
            return;
        }

        // We apply the proportions to get tile size and position relative to the work area
        const scaledRect = TileUtils.apply_props(tile, this._workArea);
        // ensure the rect doesn't go horizontally beyond the workarea
        if (
            scaledRect.x + scaledRect.width >
            this._workArea.x + this._workArea.width
        ) {
            scaledRect.width -=
                scaledRect.x +
                scaledRect.width -
                this._workArea.x -
                this._workArea.width;
        }
        // ensure the rect doesn't go vertically beyond the workarea
        if (
            scaledRect.y + scaledRect.height >
            this._workArea.y + this._workArea.height
        ) {
            scaledRect.height -=
                scaledRect.y +
                scaledRect.height -
                this._workArea.y -
                this._workArea.height;
        }

        this._selectedTilesPreview.gaps = buildTileGaps(
            scaledRect,
            this._tilingLayout.innerGaps,
            this._tilingLayout.outerGaps,
            this._workArea,
            this._enableScaling
                ? getScalingFactorOf(this._tilingLayout)[1]
                : undefined,
        );
        this._selectedTilesPreview
            .get_parent()
            ?.set_child_above_sibling(this._selectedTilesPreview, null);
        this._selectedTilesPreview.open(true, scaledRect);
        this._isSnapAssisting = true;
    }

    /**
     * Checks if pointer is inside the current monitor
     * @returns true if the pointer is inside the current monitor, false otherwise
     */
    private _isPointerInsideThisMonitor(window: Meta.Window): boolean {
        const [x, y] = TouchPointer.get().isTouchDeviceActive()
            ? TouchPointer.get().get_pointer(window)
            : global.get_pointer();
        return (
            x >= this._monitor.x &&
            x <= this._monitor.x + this._monitor.width &&
            y >= this._monitor.y &&
            y <= this._monitor.y + this._monitor.height
        );
    }

    private _showEdgeTiling(
        window: Meta.Window,
        edgeTile: Mtk.Rectangle,
        pointerX: number,
        pointerY: number,
    ) {
        this._selectedTilesPreview.gaps = buildTileGaps(
            edgeTile,
            this._tilingLayout.innerGaps,
            this._tilingLayout.outerGaps,
            this._workArea,
            this._enableScaling
                ? getScalingFactorOf(this._tilingLayout)[1]
                : undefined,
        );

        if (!this._selectedTilesPreview.showing) {
            const { left, right, top, bottom } =
                this._selectedTilesPreview.gaps;
            const initialRect = buildRectangle({
                x: pointerX,
                y: pointerY,
                width: left + right + 8, // width without gaps will be 8
                height: top + bottom + 8, // height without gaps will be 8
            });
            initialRect.x -= initialRect.width / 2;
            initialRect.y -= initialRect.height / 2;
            this._selectedTilesPreview.open(false, initialRect);
        }

        this._selectedTilesPreview.openAbove(window, true, edgeTile);
    }

    private _easeWindowRectFromTile(tile: Tile, window: Meta.Window) {
        // We apply the proportions to get tile size and position relative to the work area
        const scaledRect = TileUtils.apply_props(tile, this._workArea);
        // ensure the rect doesn't go horizontally beyond the workarea
        if (
            scaledRect.x + scaledRect.width >
            this._workArea.x + this._workArea.width
        ) {
            scaledRect.width -=
                scaledRect.x +
                scaledRect.width -
                this._workArea.x -
                this._workArea.width;
        }
        // ensure the rect doesn't go vertically beyond the workarea
        if (
            scaledRect.y + scaledRect.height >
            this._workArea.y + this._workArea.height
        ) {
            scaledRect.height -=
                scaledRect.y +
                scaledRect.height -
                this._workArea.y -
                this._workArea.height;
        }

        const gaps = buildTileGaps(
            scaledRect,
            this._tilingLayout.innerGaps,
            this._tilingLayout.outerGaps,
            this._workArea,
            this._enableScaling
                ? getScalingFactorOf(this._tilingLayout)[1]
                : undefined,
        );

        const destinationRect = buildRectangle({
            x: scaledRect.x + gaps.left,
            y: scaledRect.y + gaps.top,
            width: scaledRect.width - gaps.left - gaps.right,
            height: scaledRect.height - gaps.top - gaps.bottom,
        });

        // abort if there is an invalid selection
        if (destinationRect.width <= 0 || destinationRect.height <= 0) return;

        const rememberOriginalSize = !window.get_maximized();
        if (window.get_maximized()) window.unmaximize(Meta.MaximizeFlags.BOTH);

        if (rememberOriginalSize && !(window as ExtendedWindow).assignedTile) {
            (window as ExtendedWindow).originalSize = window
                .get_frame_rect()
                .copy();
        }
        (window as ExtendedWindow).assignedTile = TileUtils.build_tile(
            buildRectangle({
                x: scaledRect.x,
                y: scaledRect.y,
                width: scaledRect.width,
                height: scaledRect.height,
            }),
            this._workArea,
        );
        this._easeWindowRect(window, destinationRect);
    }

    public onTileFromWindowMenu(tile: Tile, window: Meta.Window) {
        this._easeWindowRectFromTile(tile, window);
    }

    public onSpanAllTiles(window: Meta.Window) {
        this._easeWindowRectFromTile(
            new Tile({
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                groups: [],
            }),
            window,
        );
    }
}
