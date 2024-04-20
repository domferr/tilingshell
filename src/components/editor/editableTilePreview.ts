import { registerGObjectClass } from "@/utils/gjs";
import TilePreview from "../tilepreview/tilePreview";
import St from "@gi-types/st1";
import Clutter from "@gi-types/clutter10";
import Meta from "@gi-types/meta10";
import Tile from "../layout/Tile";
import Slider from "./slider";
import TileUtils from "../layout/TileUtils";
import { logger } from "@/utils/shell";
import GObject from "@gi-types/gobject2";
import HoverLine from "./hoverLine";

const debug = logger("EditableTilePreview");

@registerGObjectClass
export default class EditableTilePreview extends TilePreview {
    static metaInfo: GObject.MetaInfo = {
        Signals: {
            "size-changed": { 
                param_types: [ Meta.Rectangle.$gtype, Meta.Rectangle.$gtype ] // oldSize, newSize
            },
        },
        GTypeName: "EditableTilePreview"
    }

    public static MIN_TILE_SIZE: number = 140;

    private readonly _btn: St.Button;
    private readonly _tile: Tile;
    private readonly _containerRect: Meta.Rectangle;

    private _sliders: (Slider | null)[];
    private _signals: (number | null)[];

    constructor(params: {
        tile: Tile,
        containerRect: Meta.Rectangle,
        parent?: Clutter.Actor,
        rect?: Meta.Rectangle,
        gaps?: Clutter.Margin
    }) {
        super(params);
        this.add_style_class_name("editable-tile-preview");
        this._tile = params.tile;
        this._containerRect = params.containerRect;
        this._sliders = [null, null, null, null];
        this._signals = [null, null, null, null];
        this._btn = new St.Button({
            style_class: "editable-tile-preview-button",
            x_expand: true,
            track_hover: true
        });
        this.add_child(this._btn);
        this._btn.set_size(this.innerWidth, this.innerHeight);
        // handle both left and right clicks
        this._btn.set_button_mask(St.ButtonMask.ONE | St.ButtonMask.THREE);
        this._updateLabelText();

        this.connect("destroy", this._onDestroy.bind(this));
    }

    public get tile() : Tile {
        return this._tile;
    }

    public getSlider(side: St.Side): (Slider | null) {
        return this._sliders[side];
    }

    public getAllSliders(): (Slider | null)[] {
        return [...this._sliders];
    }

    public get hover(): boolean {
        return this._btn.hover;
    }

    public addSlider(slider: Slider, side: St.Side) {
        // if there were another slider on that side, disconnect the signal        
        const sig = this._signals[side];
        if (sig) this._sliders[side]?.disconnect(sig);

        // add this slider
        this._sliders[side] = slider;
        this._signals[side] = slider.connect("slide", () => this._onSliderMove(side));

        // update tile's groups
        this._tile.groups = [];
        this._sliders.forEach(sl => sl && this._tile.groups.push(sl.groupId));
    }

    public removeSlider(side: St.Side) {
        if (this._sliders[side] === null) return;

        // disconnect signals
        const sig = this._signals[side];
        if (sig) this._sliders[side]?.disconnect(sig);

        // remove slider
        this._sliders[side] = null;

        // update tile's groups
        this._tile.groups = [];
        this._sliders.forEach(sl => sl && this._tile.groups.push(sl.groupId));
    }

    public updateTile({x, y, width, height}:{ x: number, y: number, width: number, height: number }) {
        const oldSize = this._rect.copy();
        this._tile.x = x;
        this._tile.y = y;
        this._tile.width = width;
        this._tile.height = height;
        this._rect = TileUtils.apply_props(this._tile, this._containerRect);
        
        this.set_size(this.innerWidth, this.innerHeight);
        this.set_position(this.innerX, this.innerY);

        this._btn.set_size(this.width, this.height);
        this._updateLabelText();

        const newSize = this._rect.copy();
        this.emit("size-changed", oldSize, newSize);
    }

    public connect(id: string, callback: (...args: any[]) => any): number;
    public connect(signal: "size-changed", callback: (_source: this, oldSize: Meta.Rectangle, newSize: Meta.Rectangle) => void): number;
    public connect(signal: "notify::hover", callback: (_source: this) => void): number;
    public connect(signal: "clicked", callback: (_source: this, clicked_button: number) => void): number;
    public connect(signal: string, callback: any): number {
        if (signal === "clicked" || signal === "notify::hover" || signal === "motion-event") return this._btn.connect(signal, callback);
        return super.connect(signal, callback);
    }

    private _updateLabelText() {
        this._btn.label = `${this.innerWidth}x${this.innerHeight}`;
    }

    private _onSliderMove(side: St.Side) {
        const slider = this._sliders[side];
        if (slider === null) return;

        const posHoriz = (slider.x + (slider.width/2) - this._containerRect.x) / this._containerRect.width;
        const posVert = (slider.y + (slider.height/2) - this._containerRect.y) / this._containerRect.height;
        switch(side) {
            case St.Side.TOP:
                this._tile.height += this._tile.y - posVert;
                this._tile.y = posVert;
                break;
            case St.Side.RIGHT:
                this._tile.width = posHoriz - this._tile.x;
                break;
            case St.Side.BOTTOM:
                this._tile.height = posVert - this._tile.y;
                break;
            case St.Side.LEFT:
                this._tile.width += this._tile.x - posHoriz;
                this._tile.x = posHoriz;
                break;
        }

        this.updateTile({...this._tile});
    }

    private _onDestroy(): void {
        this._signals.forEach((id, side) => id && this._sliders[side]?.disconnect(id));
    }
}