import { registerGObjectClass } from "@/utils/gjs";
import Clutter from "gi://Clutter";
import Meta from "gi://Meta";
import Mtk from "gi://Mtk";
import St from "gi://St";
import { logger } from "@/utils/shell";
import { MetaInfo } from "gi://GObject";
import SnapAssistTile from "./snapAssistTile";
import SnapAssistLayout from "./snapAssistLayout";
import Layout from "../layout/Layout";
import Tile from "../layout/Tile";
import Settings from "@/settings";
import GlobalState from "@/globalState";
import SignalHandling from "@/signalHandling";
import { buildMargin } from "@utils/ui";

export const SNAP_ASSIST_SIGNAL = 'snap-assist';
export const SNAP_ASSIST_ANIMATION_TIME = 180;

const debug = logger("snapAssist");

@registerGObjectClass
export class SnapAssist extends St.BoxLayout {
    static metaInfo: MetaInfo = {
        Signals: {
            "snap-assist": { 
                param_types: [ Tile.$gtype ]
            },
        },
        GTypeName: "SnapAssist"
    }

    // distance from top when the snap assistant is enlarged
    private readonly _enlargedVerticalDistance = 24;
    // cursor's max distance from the snap assistant to enlarge it 
    private readonly _activationAreaOffset = 4;
    // distance between layouts
    private readonly _separatorSize = 12;
    private readonly _gaps = 3;

    private readonly _container: St.Widget;
    
    private _showing: boolean;
    private _signals: SignalHandling;
    private _snapAssistLayouts: SnapAssistLayout[];
    private _isEnlarged = false;
    private _hoveredTile: SnapAssistTile | undefined;
    private _scaleFactor: number;
    private _bottomPadding: number;

    constructor(parent: Clutter.Actor, workArea: Mtk.Rectangle, scaleFactor: number, styleScaleFactor: number) {
        super({
            name: 'snap_assist',
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            vertical: false,
            reactive: true,
            styleClass: "popup-menu-content snap-assistant",
        });
        this._signals = new SignalHandling();
        this._scaleFactor = scaleFactor;
        this._snapAssistLayouts = [];
        this._isEnlarged = false;
        this._container = new St.Widget();
        this.workArea = workArea;
        this._showing = true;

        this._container.add_child(this);
        this._container.set_clip(0, 0, workArea.width, workArea.height);
        parent.add_child(this._container);

        this._setLayouts(GlobalState.get().layouts, scaleFactor);
        this._signals.connect(GlobalState.get(), GlobalState.SIGNAL_LAYOUTS_CHANGED, () => {
            this._setLayouts(GlobalState.get().layouts, scaleFactor);
        });

        this.connect("destroy", this._onDestroy.bind(this));
        
        // scale padding if it is not already scaled
        this._bottomPadding = this.get_theme_node().get_padding(St.Side.BOTTOM) * styleScaleFactor;
        debug("bottom padding is", this._bottomPadding);
        this.set_style(`
            padding: ${this._bottomPadding}px !important;
        `);

        this.close(false);
    }

    public set workArea(newWorkArea: Mtk.Rectangle) {
        this._container.set_position(newWorkArea.x, newWorkArea.y);
        this._container.set_width(newWorkArea.width);
        this._container.set_clip(0, 0, newWorkArea.width, newWorkArea.height);
        this.set_x((newWorkArea.width / 2) - (this.width / 2));
    }

    public close(ease: boolean = false) {
        if (!this._showing) return;

        this._showing = false;
        this._isEnlarged = false;
        this.set_x((this._container.width / 2) - (this.width / 2));
        
        // @ts-ignore
        this.ease({
            y: this._desiredY,
            opacity: 0,
            duration: ease ? SNAP_ASSIST_ANIMATION_TIME : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.hide();
            }
        });
    }

    private get _desiredY() : number {
        return (this._isEnlarged ? this._enlargedVerticalDistance:-this.height + this._bottomPadding);
    }

    private open(ease: boolean = false) {
        // if it is the first time showing the snap assistant
        // then ensure the snap assistant is the topmost widget
        if (!this._showing) this.get_parent()?.set_child_above_sibling(this, null);
        
        this.set_x((this._container.width / 2) - (this.width / 2));
        this.show();
        
        this._showing = true;
        // @ts-ignore
        this.ease({
            y: this._desiredY,
            opacity: 255,
            duration: ease ? SNAP_ASSIST_ANIMATION_TIME : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    private _setLayouts(layouts: Layout[], scaleFactor: number) {
        this._snapAssistLayouts.forEach(lay => lay.destroy());
        this.remove_all_children();

        const inner_gaps = Settings.get_inner_gaps(scaleFactor);
        const layoutGaps = buildMargin({
            top: inner_gaps.top === 0 ? 0:this._gaps,
            bottom: inner_gaps.bottom === 0 ? 0:this._gaps,
            left: inner_gaps.left === 0 ? 0:this._gaps,
            right: inner_gaps.right === 0 ? 0:this._gaps,
        });

        // build the layouts inside the snap assistant. Place a spacer between each layout
        this._snapAssistLayouts = layouts.map((lay, ind) => {
            const saLay = new SnapAssistLayout(this, lay, layoutGaps, this._scaleFactor);
            // build and place a spacer
            if (ind < layouts.length -1) {
                this.add_child(new St.Widget({width: this._scaleFactor * this._separatorSize, height: 1}));
            }
            return saLay;
        });
        this.ensure_style();
        this.set_x((this._container.width / 2) - (this.width / 2));
    }

    public onMovingWindow(window: Meta.Window, ease: boolean = false, currPointerPos: {x: number, y: number}) {
        const wasEnlarged = this._isEnlarged;      
        this.handleOpening(window, ease, currPointerPos);
        if (!this._showing || !this._isEnlarged) {
            if (this._hoveredTile) {
                this._hoveredTile.set_hover(false);
            }
            this._hoveredTile = undefined;
            if (wasEnlarged) this.emit(SNAP_ASSIST_SIGNAL, new Tile({x:0, y:0, width: 0, height: 0, groups: []}));
            return;
        }
        
        const changed = this.handleTileHovering(currPointerPos);
        if (changed) {
            const tile = this._hoveredTile?.tile || new Tile({x:0,y:0,width:0,height:0, groups: []});
            this.emit(SNAP_ASSIST_SIGNAL, tile);
        }
    }

    private handleOpening(window: Meta.Window, ease: boolean = false, currPointerPos: {x: number, y: number}) {      
        if (!this._showing) {
            if (this.get_parent() === global.windowGroup) {
                let windowActor = window.get_compositor_private();
                if (!windowActor) return;
                global.windowGroup.set_child_above_sibling(this, windowActor as any);
            }
        }

        const size = this._isEnlarged ? this.height:(this.height/2);
        const isNear = this.isBetween(this._container.x + this.x - this._activationAreaOffset, currPointerPos.x, this._container.x + this.x + this.width + this._activationAreaOffset)
            && this.isBetween(this._container.y - this._activationAreaOffset, currPointerPos.y, this._container.y + this._enlargedVerticalDistance + size + this._activationAreaOffset);
        
        if (this._showing && this._isEnlarged === isNear) return;

        this._isEnlarged = isNear;
        this.open(ease);
    }

    private handleTileHovering(currPointerPos: {x: number, y: number}) : boolean {
        if (!this._isEnlarged) {
            const changed = this._hoveredTile !== undefined;
            if (this._hoveredTile) {
                this._hoveredTile.set_hover(false);
            }
            this._hoveredTile = undefined;
            return changed;
        }

        var newTileHovered: SnapAssistTile | undefined = undefined;
        for (let index = 0; index < this._snapAssistLayouts.length; index++) {
            const snapAssistLay = this._snapAssistLayouts[index];
            newTileHovered = snapAssistLay.getTileBelow(currPointerPos);
            if (newTileHovered) {
                break;
            }   
        }
        const tileChanged = newTileHovered !== this._hoveredTile;
        if (tileChanged) {
            this._hoveredTile?.set_hover(false);
            this._hoveredTile = newTileHovered;
        }
        if (this._hoveredTile) this._hoveredTile.set_hover(true);

        return tileChanged;
    }

    private isBetween(min: number, num: number, max: number): boolean {
        return min <= num && num <= max;
    }

    private _onDestroy() {
        this._signals.disconnect();
    }
}