import { Display, Rectangle, SizeChange, Window, GrabOp } from '@gi-types/meta10';
import { logger } from "@/utils/shell";
import { buildTileMargin, global, isPointInsideRect, Main } from "@/utils/ui";
import { TilingLayout } from "@/components/tilingLayout";
import { Margin, ModifierType } from "@gi-types/clutter10";
import { PRIORITY_DEFAULT_IDLE, Source, SOURCE_CONTINUE, SOURCE_REMOVE, timeout_add } from "@gi-types/glib2";
import { SNAP_ASSIST_SIGNAL, SnapAssist } from './snapassist/snapAssist';
import { SelectionTilePreview } from './tilepreview/selectionTilePreview';
import { ThemeContext } from '@gi-types/st1';
import Settings from '@/settings';
import SignalHandling from '@/signalHandling';
import { Layout } from './layout/Layout';
import Tile from './layout/Tile';
import TileUtils from './layout/TileUtils';

const SIGNAL_GRAB_OP_BEGIN = 'grab-op-begin';
const SIGNAL_GRAB_OP_END = 'grab-op-end';

export class TilingManager {
    private readonly _monitor: Monitor;

    private _selectedTilesPreview: SelectionTilePreview;
    private _snapAssist: SnapAssist;
    private _tilingLayout: TilingLayout;

    private _workArea: Rectangle;
    private _scaleFactor: number;
    private _innerGaps: Margin;
    private _outerGaps: Margin;

    private _isGrabbingWindow: boolean;
    private _movingWindowTimerDuration: number = 15;
    private _lastCursorPos: {x: number, y: number} | null = null;
    private _wasAltPressed: boolean;
    private _wasCtrlPressed: boolean;
    private _isSnapAssisting: boolean;

    private _movingWindowTimerId: number | null = null;

    private readonly _signals: SignalHandling;
    private readonly _debug: (msg: string) => void;

    /**
     * Constructs a new TilingManager instance.
     * @param monitor The monitor to manage tiling for.
     * @param layouts Available tiling layouts.
     * @param selectedLayout Index of the selected layout.
     * @param innerMargin Inner margin for tiling.
     * @param outerMargin Outer margin for tiling.
     */
    constructor(monitor: Monitor) {
        this._monitor = monitor;
        this._signals = new SignalHandling();
        this._debug = logger(`TilingManager ${monitor.index}`);
        const layout: Layout = Settings.get_layouts()[Settings.get_selected_layouts()[monitor.index]];

        // handle scale factor of the monitor
        this._scaleFactor = ThemeContext.get_for_stage(global.get_stage()).get_scale_factor();
        if (this._scaleFactor === 1) this._scaleFactor = global.display.get_monitor_scale(monitor.index);
        this._debug(`monitor ${monitor.index} scale factor is ${global.display.get_monitor_scale(monitor.index)} and ThemeContext scale factor is ${ThemeContext.get_for_stage(global.get_stage()).get_scale_factor()}`);
        
        this._innerGaps = new Margin(Settings.get_inner_gaps(this._scaleFactor));
        this._outerGaps = new Margin(Settings.get_outer_gaps(this._scaleFactor));

        // get the monitor's workarea
        this._workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitor.index);
        this._debug(`Work area for monitor ${this._monitor.index}: ${this._workArea.x} ${this._workArea.y} ${this._workArea.width}x${this._workArea.height}`);

        // build the tiling layout
        this._tilingLayout = new TilingLayout(layout, this._innerGaps, this._outerGaps, this._workArea);
        
        // build the snap assistant
        this._snapAssist = new SnapAssist(global.window_group, this._workArea, this._scaleFactor);

        // build the selection tile
        this._selectedTilesPreview = new SelectionTilePreview({ parent: global.window_group });
    }

    /**
     * Enables tiling manager by setting up event listeners:
     *  - handle any window's grab begin.
     *  - handle any window's grab end.
     *  - handle grabbed window's movement.
     */
    public enable() {
        this._signals.connect(Settings, Settings.SETTING_SELECTED_LAYOUTS, () => {
            const layout: Layout = Settings.get_layouts()[Settings.get_selected_layouts()[this._monitor.index]];
            this._tilingLayout.relayout({ layout });
        });
        
        this._signals.connect(Settings, Settings.SETTING_INNER_GAPS, () => {
            this._innerGaps = new Margin(Settings.get_inner_gaps(this._scaleFactor));
            this._tilingLayout.relayout({ innerMargin: this._innerGaps });
        });
        this._signals.connect(Settings, Settings.SETTING_OUTER_GAPS, () => {
            this._outerGaps = new Margin(Settings.get_outer_gaps(this._scaleFactor));
            this._tilingLayout.relayout({ outerMargin: this._outerGaps });
        });

        this._signals.connect(global.display, SIGNAL_GRAB_OP_BEGIN, (_display: Display, window: Window, grabOp: GrabOp) => {
            if (grabOp != GrabOp.MOVING) return;

            this._onWindowGrabBegin(window);
        });

        this._signals.connect(global.display, SIGNAL_GRAB_OP_END, (_display: Display, window: Window, grabOp: GrabOp) => {
            if (grabOp != GrabOp.MOVING) return;
            if (!window.allows_resize() || !window.allows_move()) return;

            this._onWindowGrabEnd(window);
        });

        this._signals.connect(this._snapAssist, SNAP_ASSIST_SIGNAL,
            (_: SnapAssist, tile: Tile) => this._onSnapAssist(tile)
        );
    }

    /**
     * Destroys the tiling manager and cleans up resources.
     */
    public destroy() {
        if (this._movingWindowTimerId) {
            Source.remove(this._movingWindowTimerId);
            this._movingWindowTimerId = null;
        }
        this._signals.disconnect();
        this._isGrabbingWindow = false;
        this._isSnapAssisting = false;
        this._tilingLayout.destroy();
        this._snapAssist.destroy();
        this._selectedTilesPreview.destroy();
    }

    public set workArea(newWorkArea: Rectangle) {
        if (newWorkArea.equal(this._workArea)) return;

        this._workArea = newWorkArea;
        this._debug(`new work area for monitor ${this._monitor.index}: ${newWorkArea.x} ${newWorkArea.y} ${newWorkArea.width}x${newWorkArea.height}`);

        // notify the tiling layout that the workarea changed and trigger a new relayout
        // so we will have the layout already computed to be shown quickly when needed
        this._tilingLayout.relayout({ containerRect: this._workArea });
        this._snapAssist.workArea = this._workArea;
    }

    private _onWindowGrabBegin(window: Window) {
        this._isGrabbingWindow = true;
        this._movingWindowTimerId = timeout_add(
            PRIORITY_DEFAULT_IDLE,
            this._movingWindowTimerDuration,
            this._onMovingWindow.bind(this, window)
        );

        this._onMovingWindow(window);
    }

    private _onMovingWindow(window: Window) {
        // if the window is no longer grabbed, disable handler
        if (!this._isGrabbingWindow) {
            this._movingWindowTimerId = null;
            return SOURCE_REMOVE;
        }

        // if the window was moved into another monitor and it is still grabbed
        if (!window.allows_resize() || !window.allows_move() || !this._isPointerInsideThisMonitor()) {
            this._tilingLayout.close();
            this._selectedTilesPreview.close();
            this._snapAssist.close();
            this._isSnapAssisting = false;
            
            return SOURCE_CONTINUE;
        }

        const [x, y, modifier] = global.get_pointer();
        const currPointerPos = { x, y };
        const isAltPressed = (modifier & ModifierType.MOD1_MASK) != 0;
        const isCtrlPressed = (modifier & ModifierType.CONTROL_MASK) != 0;
        const allowSpanMultipleTiles = Settings.get_span_multiple_tiles() && isAltPressed;
        const showTilingSystem = Settings.get_tiling_system_enabled() && isCtrlPressed;
        // ensure we handle window movement only when needed
        // if the ALT key status is not changed and the mouse is on the same position as before
        // and the CTRL key status is not changed, we have nothing to do
        const changedSpanMultipleTiles = Settings.get_span_multiple_tiles() && isAltPressed !== this._wasAltPressed;
        const changedShowTilingSystem = Settings.get_tiling_system_enabled() && isCtrlPressed !== this._wasCtrlPressed;
        if (!changedSpanMultipleTiles && !changedShowTilingSystem && currPointerPos.x === this._lastCursorPos?.x && currPointerPos.y === this._lastCursorPos?.y) {
            return SOURCE_CONTINUE;
        }

        this._lastCursorPos = currPointerPos;
        this._wasCtrlPressed = isCtrlPressed;
        this._wasAltPressed = isAltPressed;

        // layout must not be shown if it was disabled or if it is enabled but CTRL key is not pressed
        // then close it and open snap assist (if enabled)
        if (!showTilingSystem) {
            if (this._tilingLayout.showing) {
                //this._debug("hide layout");
                this._tilingLayout.close();
                this._selectedTilesPreview.close();
            }
            if (Settings.get_snap_assist_enabled()) {
                this._snapAssist.onMovingWindow(window, true, currPointerPos);
            }

            return SOURCE_CONTINUE;
        }

        // we know that the layout must be shown, snap assistant must be closed
        if (!this._tilingLayout.showing) {
            //this._debug("open layout below grabbed window");
            this._tilingLayout.openAbove(window);
            this._snapAssist.close();
        }
        // if it was snap assisting then close the selection tile preview. We may reopen it if that's the case
        if (this._isSnapAssisting) {
            this._selectedTilesPreview.close();
            this._isSnapAssisting = false;
        }

        // if the pointer is inside the current selection and ALT key status is not changed, then there is nothing to do 
        if (!changedSpanMultipleTiles && isPointInsideRect(currPointerPos, this._selectedTilesPreview.rect)) {
            return SOURCE_CONTINUE;
        }
        //this._debug("update selection tile");
        
        let selectionRect = this._tilingLayout.getTileBelow(currPointerPos);
        if (!selectionRect) return SOURCE_CONTINUE;

        selectionRect = selectionRect.copy();
        if (allowSpanMultipleTiles) {
            selectionRect = selectionRect.union(this._selectedTilesPreview.rect);
        }
        this._tilingLayout.hoverTilesInRect(selectionRect);

        this._selectedTilesPreview.gaps = buildTileMargin(selectionRect, this._innerGaps, this._outerGaps, this._workArea);
        this._selectedTilesPreview.openAbove(
            window,
            true,
            selectionRect,
        );
        
        return SOURCE_CONTINUE;
    }

    private _onWindowGrabEnd(window: Window) {
        this._isGrabbingWindow = false;
        this._tilingLayout.close();
        const selectionRect = new Rectangle({
            x: this._selectedTilesPreview.innerX,
            y: this._selectedTilesPreview.innerY,
            width: this._selectedTilesPreview.innerWidth,
            height: this._selectedTilesPreview.innerHeight
        });
        this._selectedTilesPreview.close();
        this._snapAssist.close();
        this._lastCursorPos = null;
        
        const isCtrlPressed = (global.get_pointer()[2] & ModifierType.CONTROL_MASK);
        if (!isCtrlPressed && !this._isSnapAssisting) return;
        
        // disable snap assistance
        this._isSnapAssisting = false;

        // abort if the pointer is moving on another monitor: the user moved
        // the window to another monitor not handled by this tiling manager
        if (!this._isPointerInsideThisMonitor()) return;
        
        // abort if there is an invalid selection
        if (this._selectedTilesPreview.innerWidth === 0 || this._selectedTilesPreview.innerHeight === 0) {
            return;
        }
        
        // apply animations when moving the window
        const windowActor = window.get_compositor_private();
        // @ts-ignore
        windowActor.remove_all_transitions();
        Main.wm._prepareAnimationInfo(
            global.window_manager,
            windowActor,
            window.get_frame_rect().copy(),
            SizeChange.MAXIMIZE
        );
        
        // move and resize the window to the current selection
        window.move_to_monitor(this._monitor.index);
        window.move_frame(true, selectionRect.x, selectionRect.y);
        window.move_resize_frame(
            true,
            selectionRect.x,
            selectionRect.y,
            selectionRect.width,
            selectionRect.height
        );
    }

    private _onSnapAssist(tile: Tile) {
        // if there isn't a tile hovered, then close selection
        if (tile.width === 0 || tile.height === 0) {
            this._selectedTilesPreview.close();
            this._isSnapAssisting = false;
            return;
        }

        // We apply the proportions to get tile size and position relative to the work area 
        const scaledRect = TileUtils.apply_props(tile, this._workArea);
        // ensure the rect doesn't go horizontally beyond the workarea
        if (scaledRect.x + scaledRect.width > this._workArea.width) {
            scaledRect.width -= scaledRect.x + scaledRect.width - this._workArea.x - this._workArea.width;
        }
        // ensure the rect doesn't go vertically beyond the workarea
        if (scaledRect.y + scaledRect.height > this._workArea.height) {
            scaledRect.height -= scaledRect.y + scaledRect.height - this._workArea.y - this._workArea.height;
        }
        
        this._selectedTilesPreview.gaps = buildTileMargin(scaledRect, this._innerGaps, this._outerGaps, this._workArea);
        this._selectedTilesPreview.open(true, scaledRect);
        // if it is the first time snap assisting
        // then ensure the snap assistant is on top of the selection tile preview 
        if (!this._isSnapAssisting) {
            const parent = this._snapAssist.get_parent();
            if (parent && parent === this._selectedTilesPreview.get_parent()) {
                parent.set_child_above_sibling(this._snapAssist, this._selectedTilesPreview);
            }
        }
        this._isSnapAssisting = true;
    }

    /**
     * Checks if pointer is inside the current monitor
     * @returns true if the pointer is inside the current monitor, false otherwise
     */
    private _isPointerInsideThisMonitor() : boolean {
        const [x, y] = global.get_pointer();
        return x >= this._monitor.x && x <= this._monitor.x + this._monitor.width
            && y >= this._monitor.y && y <= this._monitor.y + this._monitor.height;
    }
}