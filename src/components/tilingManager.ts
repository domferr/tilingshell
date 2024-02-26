import { Display, Rectangle, SizeChange, Window } from '@gi-types/meta10';
import { logger } from "@/utils/shell";
import { TileGroup } from "@/components/tileGroup";
import { buildTileMargin, global, isPointInsideRect, Main } from "@/utils/ui";
import { TilingLayout } from "@/components/tilingLayout";
import { Margin, ModifierType } from "@gi-types/clutter10";
import { PRIORITY_DEFAULT_IDLE, Source, SOURCE_CONTINUE, SOURCE_REMOVE, timeout_add } from "@gi-types/glib2";
import { SNAP_ASSIST_SIGNAL, SnapAssist } from './snapassist/snapAssist';
import { SelectionTilePreview } from './tilepreview/selectionTilePreview';
import { TilePreview } from './tilepreview/tilePreview';
import { ThemeContext } from '@gi-types/st1';

const SIGNAL_GRAB_OP_BEGIN = 'grab-op-begin';
const SIGNAL_GRAB_OP_END = 'grab-op-end';

export class TilingManager {
    private readonly _monitor: Monitor;

    private _selectedTilesPreview: TilePreview;
    private _snapAssist: SnapAssist;
    private _tilingLayout: TilingLayout;

    private _workArea: Rectangle;
    private _innerMargin: Margin;
    private _outerMargin: Margin;

    private _isGrabbingWindow: boolean;
    private _movingWindowTimerDuration: number = 15;
    private _lastCursorPos: {x: number, y: number} | null = null;
    private _wasAltPressed: boolean;
    private _wasCtrlPressed: boolean;
    private _isSnapAssisting: boolean;

    private _movingWindowTimerId: number | null = null;
    private _signalsIds: {[key: string]: number} = {};

    private readonly _debug: (msg: string) => void;

    /**
     * Constructs a new TilingManager instance.
     * @param monitor The monitor to manage tiling for.
     * @param layouts Available tiling layouts.
     * @param selectedLayout Index of the selected layout.
     * @param innerMargin Inner margin for tiling.
     * @param outerMargin Outer margin for tiling.
     */
    constructor(monitor: Monitor, layouts: TileGroup[], selectedLayout: number, innerMargin: Margin, outerMargin: Margin) {
        this._monitor = monitor;
        this._debug = logger(`TilingManager ${monitor.index}`);

        // handle scale factor of the monitor
        var scaleFactor = ThemeContext.get_for_stage(global.get_stage()).get_scale_factor();
        if (scaleFactor === 1) scaleFactor = global.display.get_monitor_scale(monitor.index);
        this._debug(`monitor ${monitor.index} scale factor is ${global.display.get_monitor_scale(monitor.index)} and ThemeContext scale factor is ${ThemeContext.get_for_stage(global.get_stage()).get_scale_factor()}`);
        
        // scale margins by scale factor
        this._innerMargin = innerMargin.copy();
        this._innerMargin.top *= scaleFactor;
        this._innerMargin.bottom *= scaleFactor;
        this._innerMargin.left *= scaleFactor;
        this._innerMargin.right *= scaleFactor;
        this._outerMargin = outerMargin.copy();
        this._outerMargin.top *= scaleFactor;
        this._outerMargin.bottom *= scaleFactor;
        this._outerMargin.left *= scaleFactor;
        this._outerMargin.right *= scaleFactor;

        // get the monitor's workarea
        this._workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        this._debug(`Work area for monitor ${monitor.index}: ${this._workArea.x} ${this._workArea.y} ${this._workArea.width}x${this._workArea.height}`);

        // build the tiling layout
        this._tilingLayout = new TilingLayout(layouts[selectedLayout], this._innerMargin, this._outerMargin, this._workArea);
        
        // build the snap assistant
        this._snapAssist = new SnapAssist(global.window_group, layouts, this._innerMargin, this._workArea, scaleFactor);

        // build the selection tile
        this._selectedTilesPreview = new SelectionTilePreview(global.window_group);
        this._selectedTilesPreview.margins = this._innerMargin.copy();
    }

    /**
     * Enables tiling manager by setting up event listeners:
     *  - handle any window's grab begin.
     *  - handle any window's grab end.
     *  - handle grabbed window's movement.
     */
    public enable() {
        if (!this._signalsIds[SIGNAL_GRAB_OP_BEGIN]) {
            this._signalsIds[SIGNAL_GRAB_OP_BEGIN] = global.display.connect(SIGNAL_GRAB_OP_BEGIN, (_display: Display, window: Window) => {
                this._onWindowGrabBegin(window);
            });
        }

        if (!this._signalsIds[SIGNAL_GRAB_OP_END]) {
            this._signalsIds[SIGNAL_GRAB_OP_END] = global.display.connect(SIGNAL_GRAB_OP_END, (_display: Display, window: Window) => {
                if (!window.allows_resize() || !window.allows_move()) return;

                this._onWindowGrabEnd(window);
            });
        }

        if (!this._signalsIds[SNAP_ASSIST_SIGNAL]) {
            this._signalsIds[SNAP_ASSIST_SIGNAL] = this._snapAssist.connect(SNAP_ASSIST_SIGNAL, 
                (_: SnapAssist, rect: Rectangle, w: number, h: number) => this._onSnapAssist(rect, w, h)
            );
        }
    }

    /**
     * Destroys the tiling manager and cleans up resources.
     */
    public destroy() {
        if (this._movingWindowTimerId) {
            Source.remove(this._movingWindowTimerId);
            this._movingWindowTimerId = null;
        }
        if (this._signalsIds[SIGNAL_GRAB_OP_BEGIN]) {
            global.display.disconnect(this._signalsIds[SIGNAL_GRAB_OP_BEGIN]);
            delete this._signalsIds[SIGNAL_GRAB_OP_BEGIN];
        }
        if (this._signalsIds[SIGNAL_GRAB_OP_END]) {
            global.display.disconnect(this._signalsIds[SIGNAL_GRAB_OP_END]);
            delete this._signalsIds[SIGNAL_GRAB_OP_END];
        }
        if (this._signalsIds[SNAP_ASSIST_SIGNAL]) {
            this._snapAssist.disconnect(this._signalsIds[SNAP_ASSIST_SIGNAL]);
            delete this._signalsIds[SNAP_ASSIST_SIGNAL];
        }
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

    /**
     * Sets the active tiling layout.
     * @param layout The layout to set as active.
     */
    public setActiveLayout(layout: TileGroup) {
        this._tilingLayout.relayout({ layout });
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
        if (!this._isGrabbingWindow) {
            this._movingWindowTimerId = null;
            return SOURCE_REMOVE;
        }

        if (!window.allows_resize() || !window.allows_move() || !this._isPointerInsideThisMonitor()) {
            this._tilingLayout.close();
            this._selectedTilesPreview.close();
            this._snapAssist.close();
            this._isSnapAssisting = false;
            
            return SOURCE_CONTINUE;
        }

        const [x, y] = global.get_pointer();
        const currPointerPos = { x, y };

        // ensure we handle window movement only when needed
        // if the ALT key status is not changed and the mouse is on the same position as before
        // and the CTRL key status is not changed, we have nothing to do
        const isAltPressed = (global.get_pointer()[2] & ModifierType.MOD1_MASK) != 0;
        const isCtrlPressed = (global.get_pointer()[2] & ModifierType.CONTROL_MASK) != 0;
        if (this._lastCursorPos !== null && isAltPressed == this._wasAltPressed && 
            currPointerPos.x === this._lastCursorPos.x && currPointerPos.y === this._lastCursorPos.y
            && isCtrlPressed == this._wasCtrlPressed) {
            return SOURCE_CONTINUE;
        }

        this._lastCursorPos = currPointerPos;
        this._wasCtrlPressed = isCtrlPressed;

        if (!isCtrlPressed) {
            this._snapAssist.onMovingWindow(window, true, currPointerPos);

            // if CTRL is no longer pressed but the layout is still visible, then close it and close the selection
            if (this._tilingLayout.showing) {
                this._tilingLayout.close();
                this._selectedTilesPreview.close();
                this._selectedTilesPreview.rect = new Rectangle({ width: 0 });
                this._debug("hide layout");
            }
            return SOURCE_CONTINUE;
        } else {
            // CTRL is pressed, close snap assistance
            this._snapAssist.close();
            if (this._isSnapAssisting) this._selectedTilesPreview.close();
            this._isSnapAssisting = false;
        }

        if (!this._tilingLayout.showing) {
            this._debug("open layout below grabbed window");
            this._tilingLayout.openAbove(window);
        }

        // if the pointer is inside the current selection and alt key status is not changed, then there is nothing to do 
        if (isAltPressed == this._wasAltPressed && isPointInsideRect(currPointerPos, this._selectedTilesPreview.rect)) {
            return SOURCE_CONTINUE;
        }
        this._wasAltPressed = isAltPressed;

        const tileBelow = this._tilingLayout.getTileBelow(currPointerPos);
        if (!tileBelow) return SOURCE_CONTINUE;

        let selectionRect = tileBelow.rect.copy();
        if (isAltPressed) {
            selectionRect = selectionRect.union(this._selectedTilesPreview.rect);
        }
        this._selectedTilesPreview.margins = buildTileMargin(selectionRect, this._innerMargin, this._outerMargin, this._workArea);
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
        window.move_frame(
            true,
            this._selectedTilesPreview.innerX,
            this._selectedTilesPreview.innerY
        );
        window.move_resize_frame(
            true,
            this._selectedTilesPreview.innerX,
            this._selectedTilesPreview.innerY,
            this._selectedTilesPreview.innerWidth,
            this._selectedTilesPreview.innerHeight
        );

        this._selectedTilesPreview.rect = new Rectangle({ width: 0 });
    }

    private _onSnapAssist(hoveredTileRect: Rectangle, widthReference: number, heightReference: number) {
        this._debug(`snap assistant hovered tile: x:${hoveredTileRect.x} y:${hoveredTileRect.y} width:${hoveredTileRect.width} height:${hoveredTileRect.height}`);
        
        // if the mouse is still on the snap assist's layout then do not close selection
        // if there isn't a tile hovered, then close selection
        const noTileIsHovered = !hoveredTileRect || hoveredTileRect.width === 0 || hoveredTileRect.height === 0;
        if (!this._snapAssist.isEnlarged && noTileIsHovered) {
            this._selectedTilesPreview.close();
            this._isSnapAssisting = false;
            return;
        }
        // the mouse is still on the snap assist's layout then keep the selection as it was
        if (noTileIsHovered) return;

        // apply proportions. We have the tile size and position relative to the snap layout. We apply
        // the proportions to get tile size and position relative to the work area 
        const scaledRect = new Rectangle({
            // hoveredTile.x:layoutContainerReference.width = scaledRect.x:workArea.width
            x: this._workArea.x + ((hoveredTileRect.x * this._workArea.width) / widthReference),
            y: this._workArea.y + ((hoveredTileRect.y * this._workArea.height) / heightReference),
            // hoveredTile:layoutContainerReference = scaledRect:workArea
            width: (hoveredTileRect.width * this._workArea.width) / widthReference,
            height: (hoveredTileRect.height * this._workArea.height) / heightReference,
        });
        // ensure the rect doesn't go horizontally beyond the workarea
        if (scaledRect.x + scaledRect.width > this._workArea.width) {
            scaledRect.width -= scaledRect.x + scaledRect.width - this._workArea.x - this._workArea.width;
        }
        // ensure the rect doesn't go vertically beyond the workarea
        if (scaledRect.y + scaledRect.height > this._workArea.height) {
            scaledRect.height -= scaledRect.y + scaledRect.height - this._workArea.y - this._workArea.height;
        }
        
        this._selectedTilesPreview.margins = buildTileMargin(scaledRect, this._innerMargin, this._outerMargin, this._workArea);
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