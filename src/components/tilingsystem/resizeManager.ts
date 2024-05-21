import Meta from "gi://Meta";
import Mtk from "gi://Mtk";
import St from "gi://St";
import Shell from "gi://Shell";
import Clutter from "gi://Clutter";
import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import { logger } from "@/utils/shell";
import SignalHandling from "@signalHandling";
import Settings from "@settings";
import ExtendedWindow from "./extendedWindow";
import { registerGObjectClass } from "@utils/gjs";
import { buildRectangle } from "@utils/ui";

const debug = logger(`ResizingManager`);

const WINDOW_CLONE_RESIZE_ANIMATION_TIME = 150;
const APP_ICON_SIZE = 96;

@registerGObjectClass
class WindowClone extends St.Widget {
    private _clone: Clutter.Actor;
    //private _blurWidget: St.Widget;

    constructor(window: Meta.Window) {
        super({ layoutManager: new Clutter.BinLayout(), styleClass: "custom-tile-preview" });
        global.windowGroup.add_child(this);
        
        this._clone = this._createWindowClone(window);
        this.add_child(this._clone);
        const sigma = 36;
        this._clone.add_effect_with_name('blur', new Shell.BlurEffect({
            //@ts-ignore
            sigma: sigma,
            //radius: sigma * 2,
            brightness: 1,
            mode: Shell.BlurMode.ACTOR, // blur the widget
        }));
        /*const windowContainer = new Clutter.Actor({
            //@ts-ignore
            pivotPoint: new Graphene.Point({ x: 0.5, y: 0.5 }),
        });
        windowContainer.layoutManager = new Shell.WindowPreviewLayout();
        this.add_child(windowContainer);
        //@ts-ignore
        this._clone = windowContainer.layoutManager.add_window(window);
        const sigma = 36;
        windowContainer.add_effect(
            new Shell.BlurEffect({
                //@ts-ignore
                sigma: sigma,
                //radius: sigma * 2,
                brightness: 1,
                mode: Shell.BlurMode.ACTOR, // blur the widget
            }),
        );*/

        /*this._clone.add_effect(
            new Shell.BlurEffect({
                //@ts-ignore
                sigma: sigma,
                //radius: sigma * 2,
                brightness: 1,
                mode: Shell.BlurMode.ACTOR, // blur the widget
            }),
        );*/
        
        /*this._blurWidget = new St.Widget({ width: this._clone.width, height: this._clone.height });
        this.add_child(this._blurWidget);
        this._blurWidget.add_effect_with_name('blur', new Shell.BlurEffect({
            //@ts-ignore
            sigma: sigma,
            //radius: sigma * 2,
            brightness: 1,
            mode: Shell.BlurMode.BACKGROUND, // blur the widget
        }));
        this._blurWidget.add_style_class_name("custom-tile-preview");*/
        /*this._blurWidget.set_style("border: 2px solid white");*/
        
        const box = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            xExpand: true,
            yExpand: true,
            vertical: true,
            style: "spacing: 16px;"
        });
        box.add_child(this._createAppIcon(window, APP_ICON_SIZE));
        box.add_child(new St.Label({
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            text: window.get_title(),
            style: "color: white;"
        }));
        this.add_child(box);

        const windowRect = window.get_frame_rect();
        this.set_position(windowRect.x, windowRect.y);
        this.set_size(windowRect.width, windowRect.height);

        //this.updateEffect();
    }

    private _createWindowClone(window: Meta.Window) {
        /*//@ts-ignore
        const actor: Clutter.Actor = window.get_compositor_private();
        return new Clutter.Clone({
            source: actor
        });*/
        //@ts-ignore
        const actor: Clutter.Actor = window.get_compositor_private();
        
        //@ts-ignore
        let actorContent = actor.paint_to_content(window.get_frame_rect());
        let actorClone = new St.Widget({ 
            content: actorContent,
            width: window.get_frame_rect().width,
            height: window.get_frame_rect().height,
            xExpand: true, 
            yExpand: true 
        });
        actorClone.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);
        return actorClone;
    }

    private _createAppIcon(window: Meta.Window, size: number) {
        let tracker = Shell.WindowTracker.get_default();
        const app = tracker.get_window_app(window);
        let appIcon = app
            ? app.create_icon_texture(size)
            : new St.Icon({ iconName: 'application-x-executable', iconSize: size });
        appIcon.xExpand = appIcon.yExpand = true;
        appIcon.xAlign = appIcon.yAlign = Clutter.ActorAlign.CENTER;

        return appIcon;
    }
}

export class ResizingManager {
    private readonly _signals: SignalHandling;

    //private _windowToClone: Map<Meta.Window, WindowClone>;

    constructor() {
        this._signals = new SignalHandling();
        //this._windowToClone = new Map();
    }

    public destroy() {
        this._signals.disconnect();
        /*this._windowToClone.forEach((windowClone) => windowClone.destroy());
        this._windowToClone.clear();*/
    }

    /** From Gnome Shell: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/altTab.js#L53
     */
    private _getWindows(): Meta.Window[] {
        const workspace = global.workspaceManager.get_active_workspace();
        // We ignore skip-taskbar windows in switchers, but if they are attached
        // to their parent, their position in the MRU list may be more appropriate
        // than the parent; so start with the complete list ...
        let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace);
        // ... map windows to their parent where appropriate ...
        //@ts-ignore
        return windows.map(w => {
            return w.is_attached_dialog() ? w.get_transient_for() : w;
        // ... and filter out skip-taskbar windows and duplicates
        }).filter((w, i, a) => w !== null && !w.skipTaskbar && a.indexOf(w) === i);
    }

    public onWindowResizingBegin(window: Meta.Window, grabOp: Meta.GrabOp) {
        if (!Settings.get_resize_complementing_windows()) return;
        if (!window || !(window as ExtendedWindow).isTiled) return;

        const verticalSide: [boolean, St.Side] = [false, 0];
        const horizontalSide: [boolean, St.Side] = [false, 0];
        switch (grabOp) {
            case Meta.GrabOp.RESIZING_N:
            case Meta.GrabOp.RESIZING_NE:
            case Meta.GrabOp.RESIZING_NW:
                verticalSide[0] = true;
                verticalSide[1] = St.Side.TOP;
                break;
            case Meta.GrabOp.RESIZING_S:
            case Meta.GrabOp.RESIZING_SE:
            case Meta.GrabOp.RESIZING_SW:
                verticalSide[0] = true;
                verticalSide[1] = St.Side.BOTTOM;
                break;
        }
        switch (grabOp) {
            case Meta.GrabOp.RESIZING_E:
            case Meta.GrabOp.RESIZING_NE:
            case Meta.GrabOp.RESIZING_SE:
                horizontalSide[0] = true;
                horizontalSide[1] = St.Side.RIGHT;
                break;
            case Meta.GrabOp.RESIZING_W:
            case Meta.GrabOp.RESIZING_NW:
            case Meta.GrabOp.RESIZING_SW:
                horizontalSide[0] = true;
                horizontalSide[1] = St.Side.LEFT;
                break;
        }
        if (!verticalSide[0] && !horizontalSide[0]) return;
        
        const otherTiledWindows = this._getWindows().filter(otherWindow => 
            otherWindow && (otherWindow as ExtendedWindow).isTiled && otherWindow !== window && !otherWindow.minimized);
        if (otherTiledWindows.length === 0) return;
        
        const verticalAdjacentWindows = verticalSide[0] ? this._findAdjacent(window, verticalSide[1], new Set(otherTiledWindows)):[];
        const horizontalAdjacentWindows = horizontalSide[0] ? this._findAdjacent(window, horizontalSide[1], new Set(otherTiledWindows)):[];
        
        const windowsMap: Map<Meta.Window, [Meta.Window, Mtk.Rectangle, number, number]> = new Map();
        
        verticalAdjacentWindows.forEach(([otherWin, sideOtherWin]) => {
            windowsMap.set(otherWin, [
                otherWin, 
                otherWin.get_frame_rect().copy(),
                sideOtherWin, // resize vertically
                -1, // resize horizontally
            ]);
        });

        horizontalAdjacentWindows.forEach(([otherWin, sideOtherWin]) => {
            const val = windowsMap.get(otherWin);
            if (val) {
                val[3] = sideOtherWin;
            } else {
                windowsMap.set(otherWin, [
                    otherWin, 
                    otherWin.get_frame_rect().copy(),
                    -1, // resize vertically
                    sideOtherWin, // resize horizontally
                ]);
            }
        });

        const windowsToResize = Array.from(windowsMap.values());

        this._signals.connect(
            window, 
            "size-changed", 
            this._onResizingWindow.bind(this, window, window.get_frame_rect().copy(), verticalSide[1], horizontalSide[1], windowsToResize)
        );
    }

    /*private _createWindowClone(window: Meta.Window) {
        if (this._windowToClone.has(window)) return;

        const windowClone = new WindowClone(window);
        this._windowToClone.set(window, windowClone);
        windowClone.set_opacity(0);
        windowClone.hide();
    }*/

    private _oppositeSide(side: St.Side): St.Side {
        switch(side) {
            case St.Side.TOP:
                return St.Side.BOTTOM;
            case St.Side.BOTTOM:
                return St.Side.TOP;
            case St.Side.LEFT:
                return St.Side.RIGHT;
            case St.Side.RIGHT:
                return St.Side.LEFT;
        }
    }

    private _findAdjacent(window: Meta.Window, side: St.Side, remainingWindows: Set<Meta.Window>): [Meta.Window, St.Side][] {
        const result: [Meta.Window, St.Side][] = []
        const adjacentWindows: Meta.Window[] = [];
        const windowRect = window.get_frame_rect();
        const borderRect = windowRect.copy();
        const innerGaps = Settings.get_inner_gaps();
        const errorFactor = 4;
        switch(side) {
            case St.Side.TOP:
                borderRect.height = innerGaps.top + errorFactor;
                borderRect.y -= innerGaps.top + errorFactor;
                break;
            case St.Side.BOTTOM:
                borderRect.y = borderRect.y + borderRect.height;
                borderRect.height = innerGaps.bottom + errorFactor
                break;
            case St.Side.LEFT:
                borderRect.width = innerGaps.left + errorFactor
                borderRect.x -= innerGaps.left + errorFactor;
                break;
            case St.Side.RIGHT:
                borderRect.x = borderRect.x + borderRect.width;
                borderRect.width = innerGaps.right + errorFactor;
                break;
        }

        /*let debugWidget = new St.Widget({ style: "border: solid 1px red; border-radius: 2px; background-color: rgba(255, 255, 255, 0.2);"});
        debugWidget.set_size(borderRect.width, borderRect.height);
        debugWidget.set_position(borderRect.x, borderRect.y);
        debugWidget.show();
        global.windowGroup.add_child(debugWidget);*/
        
        const oppositeSide = this._oppositeSide(side);
        const newRemainingWindows: Set<Meta.Window> = new Set();
        remainingWindows.forEach(otherWin => {
            const otherWinRect = otherWin.get_frame_rect();
            let [hasIntersection, intersection] = otherWin.get_frame_rect().intersect(borderRect);
            switch (side) {
                case St.Side.RIGHT:
                    hasIntersection &&= intersection.x <= otherWinRect.x;
                    break;
                case St.Side.LEFT:
                    hasIntersection &&= intersection.x + intersection.width >= otherWinRect.x + otherWinRect.width;
                    break;
                case St.Side.BOTTOM:
                    hasIntersection &&= intersection.y <= otherWinRect.y;
                    break;
                case St.Side.TOP:
                    hasIntersection &&= intersection.y + intersection.height >= otherWinRect.y + otherWinRect.height;
                    break;
            }
            
            if (hasIntersection) {
                result.push([otherWin, oppositeSide]);
                adjacentWindows.push(otherWin);
            } else {
                newRemainingWindows.add(otherWin);
            }
        });

        adjacentWindows.forEach(otherWin => {
            this._findAdjacent(otherWin, oppositeSide, newRemainingWindows).forEach(recursionResult => {
                result.push(recursionResult);
                newRemainingWindows.delete(recursionResult[0]);
            });
        })
        return result;
    }

    public onWindowResizingEnd(window: Meta.Window) {
        this._signals.disconnect(window);
        /*//@ts-ignore
        window.get_compositor_private().get_first_child().set_opacity(255);
        
        this._windowToClone.forEach((windowClone, otherWindow) => {
            //@ts-ignore
            otherWindow.get_compositor_private().show();
            otherWindow.move_resize_frame(
                false,
                windowClone.x,
                windowClone.y,
                windowClone.width,
                windowClone.height
            );

            //@ts-ignore
            windowClone.ease({
                opacity: 0,
                duration: WINDOW_CLONE_RESIZE_ANIMATION_TIME,
                onComplete: () => {
                    windowClone.destroy();
                }
            });
        });
        this._windowToClone.clear();*/
    }

    private _onResizingWindow(
        window: Meta.Window, 
        startingRect: Mtk.Rectangle,
        resizeVerticalSide: number,
        resizeHorizontalSide: number,
        windowsToResize: [Meta.Window, Mtk.Rectangle, number, number][]
    ) {
        const currentRect = window.get_frame_rect();
        /*if (this._windowToClone.has(window)) {
            this._windowToClone.get(window)?.show();

            this._windowToClone.get(window)?.set_opacity(255);
            this._windowToClone.get(window)?.set_position(currentRect.x, currentRect.y);
            this._windowToClone.get(window)?.set_size(currentRect.width, currentRect.height);
        }*/

        const resizedRect = {
            x: (currentRect.x - startingRect.x),
            y: (currentRect.y - startingRect.y),
            width: (currentRect.width - startingRect.width),
            height: (currentRect.height - startingRect.height)
        };

        windowsToResize.forEach(([otherWindow, otherWindowRect, verticalSide, horizontalSide]) => {
            const isSameVerticalSide = verticalSide !== -1 && verticalSide === resizeVerticalSide;
            const isSameHorizontalSide = horizontalSide !== -1 && horizontalSide === resizeHorizontalSide;

            const rect = [otherWindowRect.x, otherWindowRect.y, otherWindowRect.width, otherWindowRect.height];
            if (horizontalSide === St.Side.LEFT) {
                // update width and x
                rect[2] = otherWindowRect.width - (isSameHorizontalSide ? resizedRect.x:resizedRect.width);
                rect[0] = otherWindowRect.x + (isSameHorizontalSide ? resizedRect.x:resizedRect.width);
            } else if (horizontalSide === St.Side.RIGHT) {
                // update width
                rect[2] = otherWindowRect.width + (isSameHorizontalSide ? resizedRect.width:resizedRect.x);
            }

            if (verticalSide === St.Side.TOP) {
                // update height and y
                rect[3] = otherWindowRect.height - (isSameVerticalSide ? resizedRect.y:resizedRect.height)
                rect[1] = otherWindowRect.y + (isSameVerticalSide ? resizedRect.y:resizedRect.height);
            } else if (verticalSide === St.Side.BOTTOM) {
                // update height
                rect[3] = otherWindowRect.height + (isSameVerticalSide ? resizedRect.height:resizedRect.y);
            }
            
            /*if (this._windowToClone.has(otherWindow)) {
                this._windowToClone.get(otherWindow)?.show();
                
                this._windowToClone.get(otherWindow)?.set_opacity(255);
                this._windowToClone.get(otherWindow)?.set_position(Math.max(0, rect[0]), Math.max(0, rect[1]));
                this._windowToClone.get(otherWindow)?.set_size(Math.max(1, rect[2]), Math.max(1, rect[3]));
            }
            //@ts-ignore
            otherWindow.get_compositor_private().hide();*/
            otherWindow.move_resize_frame(
                false,
                Math.max(0, rect[0]),
                Math.max(0, rect[1]),
                Math.max(0, rect[2]),
                Math.max(0, rect[3])
            );
        });
    }
}