import GObject from "@gi-types/gobject2";
import Clutter from "@gi-types/clutter10";
import St from "@gi-types/st1";
import Meta from "@gi-types/meta10";

export class LayoutManager extends GObject.Object {
    monitors: Monitor[];
    /// The primary monitor. Can be null if there are no monitors.
    primaryMonitor: Monitor | null;
    get currentMonitor(): Monitor;
    get keyboardMonitor(): Monitor;
    // Note: can be -1
    get focusIndex(): number;
    get focusMonitor(): Monitor | null;
    primaryIndex: number;
    hotCorners: any[];
    _startingUp: boolean;
    overviewGroup: St.Widget;

    //uiGroup: UiActor;

    removeChrome(actor: Clutter.Actor): void;
    addChrome(actor: Clutter.Actor): void;
    _findActor(actor: Clutter.Actor): number;
    _trackActor(
        actor: Clutter.Actor,
        params: {
            trackFullscreen?: boolean;
            affectsStruts?: boolean;
            affectsInputRegion?: boolean;
        }
    ): void;
    _untrackActor(actor: Clutter.Actor): void;
    getWorkAreaForMonitor(monitorIndex: number): Meta.Rectangle;
    findMonitorForActor(actor: Clutter.Actor): Monitor | null;
    showOverview(): void;
}