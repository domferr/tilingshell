import { registerGObjectClass } from "@/utils/gjs";
import Clutter from "gi://Clutter";
import Meta from "gi://Meta";
import Mtk from "gi://Mtk";
import St from "gi://St";
import Shell from "gi://Shell";
import { logger } from "@/utils/shell";
import { MetaInfo } from "gi://GObject";
import SnapAssistTile from "./snapAssistTile";
import SnapAssistLayout from "./snapAssistLayout";
import Layout from "../layout/Layout";
import Tile from "../layout/Tile";
import Settings from "@/settings";
import GlobalState from "@/globalState";
import SignalHandling from "@/signalHandling";
import { buildMargin, enableScalingFactorSupport, getScalingFactorOf } from "@utils/ui";

export const SNAP_ASSIST_SIGNAL = 'snap-assist';
export const SNAP_ASSIST_ANIMATION_TIME = 180;

const debug = logger("snapAssist");

@registerGObjectClass
class SnapAssistContent extends St.BoxLayout {
    // distance from top when the snap assistant is enlarged
    private readonly _enlargedVerticalDistance = 24;
    // cursor's max distance from the snap assistant to enlarge it 
    private readonly _activationAreaOffset = 4;
    private readonly _gaps = 4;

    private readonly _container: St.Widget;
    
    private _showing: boolean;
    private _signals: SignalHandling;
    private _snapAssistLayouts: SnapAssistLayout[];
    private _isEnlarged = false;
    private _hoveredTile: SnapAssistTile | undefined;
    private _bottomPadding: number;

    constructor(container: St.Widget) {
        super({
            name: 'snap_assist_content',
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            vertical: false,
            reactive: true,
            styleClass: "popup-menu-content snap-assistant"
        });
        this._container = container;
        this._container.add_child(this);

        this._signals = new SignalHandling();
        this._snapAssistLayouts = [];
        this._isEnlarged = false;
        this._showing = true;
        this._bottomPadding = 0;

        /*this._recolor();
        this._signals.connect(St.ThemeContext.get_for_stage(global.get_stage()), "changed", () => {
            this.set_style(null);
            this._recolor();
        });*/
        const [alreadyScaled, finalScalingFactor] = getScalingFactorOf(this);
        this._bottomPadding = (alreadyScaled ? 1:finalScalingFactor) * (this.get_theme_node().get_padding(St.Side.BOTTOM) / (alreadyScaled ? finalScalingFactor:1));
        this.set_style(`
            padding: ${this._bottomPadding}px !important;
        `);

        this._setLayouts(GlobalState.get().layouts);
        this._signals.connect(GlobalState.get(), GlobalState.SIGNAL_LAYOUTS_CHANGED, () => {
            this._setLayouts(GlobalState.get().layouts);
        });

        this.connect("destroy", () => this._signals.disconnect());

        this.close(false);
    }
    
    /*_init() {
        super._init();

        // changes in GNOME 46+
        // The sigma in Shell.BlurEffect should be replaced by radius. Since the sigma value 
        // is radius / 2.0, the radius value will be sigma * 2.0.
        const sigma = 36;
        this.add_effect(
            new Shell.BlurEffect({
                //@ts-ignore
                sigma: sigma,
                //radius: sigma * 2,
                brightness: 1,
                mode: Shell.BlurMode.BACKGROUND, // blur what is behind the widget
            }),
        );
        this.add_style_class_name("popup-menu-content snap-assistant");
    }

    private _recolor() {
        const [alreadyScaled, finalScalingFactor] = getScalingFactorOf(this);
        this._bottomPadding = (alreadyScaled ? 1:finalScalingFactor) * (this.get_theme_node().get_padding(St.Side.BOTTOM) / (alreadyScaled ? finalScalingFactor:1));
        const backgroundColor = this.get_theme_node().get_background_color().copy();
        const alpha = 0.6;
        this.set_style(`
            padding: ${this._bottomPadding}px !important;
            background-color: rgba(${backgroundColor.red}, ${backgroundColor.green}, ${backgroundColor.blue}, ${alpha}) !important;
        `);
    }*/

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

    private _setLayouts(layouts: Layout[]) {
        this._snapAssistLayouts.forEach(lay => lay.destroy());
        this.remove_all_children();

        const [_, scalingFactor] = getScalingFactorOf(this);

        const inner_gaps = Settings.get_inner_gaps(scalingFactor);
        const layoutGaps = buildMargin({
            top: inner_gaps.top === 0 ? 0:this._gaps,
            bottom: inner_gaps.bottom === 0 ? 0:this._gaps,
            left: inner_gaps.left === 0 ? 0:this._gaps,
            right: inner_gaps.right === 0 ? 0:this._gaps,
        });

        // build the layouts inside the snap assistant. Place a spacer between each layout
        this._snapAssistLayouts = layouts.map((lay, ind) => {
            const saLay = new SnapAssistLayout(this, lay, layoutGaps);
            // build and place a spacer
            if (ind < layouts.length -1) {
                this.add_child(new St.Widget({ width: this._bottomPadding, height: 1 }));
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
            if (wasEnlarged) this._container.emit(SNAP_ASSIST_SIGNAL, new Tile({x:0, y:0, width: 0, height: 0, groups: []}));
            return;
        }
        
        const changed = this.handleTileHovering(currPointerPos);
        if (changed) {
            const tile = this._hoveredTile?.tile || new Tile({x:0,y:0,width:0,height:0, groups: []});
            this._container.emit(SNAP_ASSIST_SIGNAL, tile);
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

        const distanceWhenOpen = 8;
        const size = this._isEnlarged ? (this.height + distanceWhenOpen):(this.height/2);
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
}

@registerGObjectClass
export default class SnapAssist extends St.Widget {
    static metaInfo: MetaInfo = {
        Signals: {
            "snap-assist": { 
                param_types: [ Tile.$gtype ]
            },
        },
        GTypeName: "SnapAssist"
    }

    private readonly _content: SnapAssistContent;

    constructor(parent: Clutter.Actor, workArea: Mtk.Rectangle, scalingFactor?: number) {
        super();
        parent.add_child(this);
        this.workArea = workArea;
        this.set_clip(0, 0, workArea.width, workArea.height);
        if (scalingFactor) enableScalingFactorSupport(this, scalingFactor);
        this._content = new SnapAssistContent(this);
    }


    public set workArea(newWorkArea: Mtk.Rectangle) {
        this.set_position(newWorkArea.x, newWorkArea.y);
        this.set_width(newWorkArea.width);
        this.set_clip(0, 0, newWorkArea.width, newWorkArea.height);
    }

    public onMovingWindow(window: Meta.Window, ease: boolean = false, currPointerPos: {x: number, y: number}) {
        this._content.onMovingWindow(window, ease, currPointerPos);
    }

    public close(ease: boolean = false) {
        this._content.close(ease);
    }
}