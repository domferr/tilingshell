import { registerGObjectClass } from "@/utils/gjs";
import { Actor, AnimationMode, ActorAlign, Margin } from '@gi-types/clutter10';
import { Rectangle, Window } from "@gi-types/meta10";
import { BoxLayout, Side, ThemeContext, Widget } from "@gi-types/st1";
import { TileGroup } from "../layout/tileGroup";
import { logger } from "@/utils/shell";
import { MetaInfo, TYPE_DOUBLE } from "@gi-types/gobject2";
import { SnapAssistTile } from "./snapAssistTile";
import { SnapAssistLayout } from "./snapAssistLayout";

export const SNAP_ASSIST_SIGNAL = 'snap-assist';
export const SNAP_ASSIST_ANIMATION_TIME = 180;

const debug = logger("snapAssist");

@registerGObjectClass
export class SnapAssist extends BoxLayout {
    static metaInfo: MetaInfo = {
        Signals: {
            "snap-assist": { 
                param_types: [Rectangle.$gtype, TYPE_DOUBLE, TYPE_DOUBLE] 
            },
        },
        GTypeName: "SnapAssist"
    }

    // distance from top when the snap assistant is enlarged
    private readonly _enlargedVerticalDistance = 32;
    // cursor's max distance from the snap assistant to enlarge it 
    private readonly _activationAreaOffset = 4;
    // height when it is not enlarged (shrinked)
    private _shrinkHeight = 16;
    // distance between layouts
    private readonly _separatorSize = 8;
    
    private _showing: boolean;
    private _snapAssistLayouts: SnapAssistLayout[];
    private _isEnlarged = false;
    private _rect: Rectangle = new Rectangle();
    private _enlargedRect: Rectangle = new Rectangle();
    private _workArea: Rectangle = new Rectangle();
    private _hoveredTile: SnapAssistTile | undefined;

    constructor(parent: Actor, layouts: TileGroup[], margin: Margin, workArea: Rectangle, scaleFactor: number) {
        super({
            name: 'snap_assist',
            x_align: ActorAlign.CENTER,
            y_align: ActorAlign.CENTER,
            vertical: false,
            reactive: true,
            style_class: "popup-menu-content snap-assistant",
        });
        this._workArea = workArea;

        if (parent) parent.add_child(this);
        
        this._shrinkHeight *= scaleFactor;

        const gap = 3;
        const layoutGaps = new Margin({
            top: margin.top === 0 ? 0:gap,
            bottom: margin.bottom === 0 ? 0:gap,
            left: margin.left === 0 ? 0:gap,
            right: margin.right === 0 ? 0:gap,
        })
        // build the layouts inside the snap assistant. Place a spacer between each layout
        this._snapAssistLayouts = layouts.map((lay, ind) => {
            const saLay = new SnapAssistLayout(this, lay, layoutGaps, scaleFactor);
            // build and place a spacer
            if (ind < layouts.length -1) {
                this.add_child(new Widget({width: scaleFactor * this._separatorSize, height: 1}));
            }
            return saLay;
        });
        // ensure the style is applied on all the children such that we can 
        // know the correct size of the entire box layout 
        this._snapAssistLayouts.forEach(lay => lay.ensure_style());
        this.ensure_style();

        const padding = this.get_theme_node().get_padding(Side.BOTTOM);
        const scaledPadding = ThemeContext.get_for_stage(global.get_stage()).get_scale_factor() === 1 ?
            padding * scaleFactor:padding;
        this.set_style(`
            padding: ${scaledPadding}px !important;
        `);
        /*const color = this.get_theme_node().get_background_color();
        const newAlpha = 220;
        background-color: rgba(${color.red}, ${color.green}, ${color.blue}, ${newAlpha / 255}) !important;
        */
        
        this.ensure_style();
        this._enlargedRect.height = this.size.height;
        this._enlargedRect.width = this.size.width;
        this._snapAssistLayouts.forEach(lay => lay.hide());
        this.set_opacity(0);
        this.hide();
        this._showing = false;
        this.enlarged = false;
        this.set_position(this._rect.x, this._rect.y);
    }

    public set workArea(newWorkArea: Rectangle) {
        this._workArea = newWorkArea;
        this.enlarged = this._isEnlarged;
        this.set_position(this._rect.x, this._rect.y);
    }

    private set enlarged(newVal: boolean) {
        this._isEnlarged = newVal;
        
        this._rect.width = this._enlargedRect.width;
        this._rect.height = this._isEnlarged ? this._enlargedRect.height:this._shrinkHeight;
        this._rect.x = this._workArea.x + (this._workArea.width / 2) - (this._rect.width / 2);
        this._rect.y = this._workArea.y + (this._isEnlarged ? this._enlargedVerticalDistance:0);
    }

    public get isEnlarged() {
        return this._isEnlarged;
    }

    public close() {
        if (!this._showing) return;

        this._showing = false;
        this.enlarged = false;

        if (!this._isEnlarged) {
            this._snapAssistLayouts.forEach(lay => lay.easeHide({
                duration: SNAP_ASSIST_ANIMATION_TIME/2, 
                mode: AnimationMode.EASE_OUT_QUINT,
            }));
        }
        // @ts-ignore
        this.ease({
            x: this._rect.x, 
            y: this._rect.y,
            height: this._rect.height,
            opacity: 0,
            duration: SNAP_ASSIST_ANIMATION_TIME,
            delay: SNAP_ASSIST_ANIMATION_TIME,
            mode: AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.enlarged = false;
                this.hide();
                if (this._isEnlarged) {
                    this.add_style_class_name("enlarged");
                } else {
                    this.remove_style_class_name("enlarged");
                }
            }
        });
    }

    private open(ease: boolean = false) {
        this.show();
        
        if (!this._showing) {
            this._snapAssistLayouts.forEach(lay => lay.hide());
        } else if (!this._isEnlarged) {
            this._snapAssistLayouts.forEach(lay => lay.easeHide({
                duration: SNAP_ASSIST_ANIMATION_TIME/2, 
                mode: AnimationMode.EASE_OUT_QUINT
            }));
        }
        this._showing = true;
        // @ts-ignore
        this.ease({
            x: this._rect.x, 
            y: this._rect.y,
            height: this._rect.height,
            opacity: 255,
            duration: ease ? SNAP_ASSIST_ANIMATION_TIME : 0,
            mode: AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._isEnlarged) {
                    this._snapAssistLayouts.forEach(lay => lay.easeShow({
                        duration: SNAP_ASSIST_ANIMATION_TIME, 
                        mode: AnimationMode.EASE_OUT_CUBIC
                    }));
                    this.add_style_class_name("enlarged");
                } else {
                    this.remove_style_class_name("enlarged");
                }
            }
        });
    }

    public onMovingWindow(window: Window, ease: boolean = false, currPointerPos: {x: number, y: number}) {
        const wasEnlarged = this._isEnlarged;      
        this.handleOpening(window, ease, currPointerPos);
        if (!this._showing || !this._isEnlarged) {
            if (this._hoveredTile) {
                this._hoveredTile.set_hover(false);
            }
            this._hoveredTile = undefined;
            if (wasEnlarged) this.emit(SNAP_ASSIST_SIGNAL, new Rectangle(), 0, 0);
            return;
        }
        
        const {changed, layout} = this.handleTileHovering(currPointerPos);
        if (changed) {
            const tileRect = this._hoveredTile ? this._hoveredTile.rect:new Rectangle();
            const layoutRect = this._hoveredTile ? new Rectangle({x: layout?.x, y: layout?.y, width: layout?.width, height: layout?.height}):new Rectangle();
            this.emit(SNAP_ASSIST_SIGNAL, tileRect, layoutRect.width, layoutRect.height);
        }
    }

    private handleOpening(window: Window, ease: boolean = false, currPointerPos: {x: number, y: number}) {      
        if (!this._showing) {
            if (this.get_parent() === global.window_group) {
                let windowActor = window.get_compositor_private();
                if (!windowActor) return;
                global.window_group.set_child_above_sibling(this, windowActor as any);
            }
        }

        const isNear = this.isBetween(this._rect.x - this._activationAreaOffset, currPointerPos.x, this._rect.x + this.width + this._activationAreaOffset)
            && this.isBetween(this._workArea.y - this._activationAreaOffset, currPointerPos.y, this._workArea.y + this._enlargedVerticalDistance + this.height + this._activationAreaOffset);
        
        if (this._showing && this._isEnlarged === isNear) return;

        this.enlarged = isNear;
        this.open(ease);
    }

    private handleTileHovering(currPointerPos: {x: number, y: number}) : { changed: boolean, layout: SnapAssistLayout | undefined} {
        if (!this._isEnlarged) {
            const changed = this._hoveredTile !== undefined;
            if (this._hoveredTile) {
                this._hoveredTile.set_hover(false);
            }
            this._hoveredTile = undefined;
            return {
                changed: changed,
                layout: undefined
            };
        }

        var newTileHovered: SnapAssistTile | undefined = undefined;
        var newTileLayout: SnapAssistLayout | undefined = undefined;
        for (let index = 0; index < this._snapAssistLayouts.length; index++) {
            const snapAssistLay = this._snapAssistLayouts[index];
            newTileHovered = snapAssistLay.getTileBelow(currPointerPos);
            if (newTileHovered) {
                newTileLayout = snapAssistLay;
                break;
            }   
        }
        const tileChanged = newTileHovered !== this._hoveredTile;
        if (tileChanged) {
            this._hoveredTile?.set_hover(false);
            this._hoveredTile = newTileHovered;
        }
        if (this._hoveredTile) this._hoveredTile.set_hover(true);

        return {
            changed: tileChanged,
            layout: newTileLayout
        };
    }

    private isBetween(min: number, num: number, max: number): boolean {
        return min <= num && num <= max;
    }
}