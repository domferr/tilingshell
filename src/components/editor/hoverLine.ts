import { registerGObjectClass } from "@/utils/gjs";
import St from 'gi://St';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Mtk from 'gi://Mtk';
import Clutter from "gi://Clutter";
import EditableTilePreview from "./editableTilePreview";
import { logger } from "@/utils/shell";

const debug = logger("HoverLine");

@registerGObjectClass
export default class HoverLine extends St.Widget {

    private readonly _hoverTimer: number;
    private readonly _size: number;
    private readonly _workArea: Mtk.Rectangle;

    private _hoveredTile: EditableTilePreview | null;

    constructor(workArea: Mtk.Rectangle, scalingFactor: number) {
        super({ styleClass: "hover-line"});
        
        this._hoveredTile = null;
        this._size = 16 * scalingFactor;
        this._workArea = workArea;

        this.hide();

        this._hoverTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            100,
            this._handleModifierChange.bind(this)
        );
        
        this.connect("destroy", this._onDestroy.bind(this));
    }

    public handleTileDestroy(tile: EditableTilePreview) {
        if (this._hoveredTile === tile) {
            this._hoveredTile = null;
            this.hide();
        }
    }

    public handleMouseMove(tile: EditableTilePreview, x: number, y: number) {
        this._hoveredTile = tile;

        const modifier = Shell.Global.get().get_pointer()[2];
        // split horizontally when CTRL is NOT pressed, split vertically instead
        const splitHorizontally = (modifier & Clutter.ModifierType.CONTROL_MASK) == 0;
        this._drawLine(splitHorizontally, x, y);
    }

    private _handleModifierChange(): boolean {
        if (!this._hoveredTile) return GLib.SOURCE_CONTINUE;

        // if the button is not hovered, remove this timer
        if (!this._hoveredTile.hover) {
            this.hide();
            return GLib.SOURCE_CONTINUE;
        }
        
        const [x, y, modifier] = global.get_pointer();
        // split horizontally when CTRL is NOT pressed, split vertically instead
        const splitHorizontally = (modifier & Clutter.ModifierType.CONTROL_MASK) == 0;
        
        this._drawLine(splitHorizontally, x, y);

        return GLib.SOURCE_CONTINUE;
    }

    private _drawLine(splitHorizontally: boolean, x: number, y: number) {
        if (!this._hoveredTile) return;

        if (splitHorizontally) {
            const newX = x - (this._size/2) - this._workArea.x;
            if (newX < this._hoveredTile.x
                || newX + this._size > this._hoveredTile.x + this._hoveredTile.width) {
                return;
            }
            this.set_size(this._size, this._hoveredTile.height);
            this.set_position(newX, this._hoveredTile.y);
        } else {
            const newY = y - (this._size/2) - this._workArea.y;
            if (newY < this._hoveredTile.y
                || newY + this._size > this._hoveredTile.y + this._hoveredTile.height) {
                return;
            }
            this.set_size(this._hoveredTile.width, this._size);
            this.set_position(this._hoveredTile.x, newY);
        }
        
        this.show();
    }

    private _onDestroy() {
        GLib.Source.remove(this._hoverTimer);
    }
}