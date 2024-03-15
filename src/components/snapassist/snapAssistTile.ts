import { registerGObjectClass } from "@/utils/gjs";
import { TilePreview } from "../tilepreview/tilePreview";

@registerGObjectClass
export class SnapAssistTile extends TilePreview {
    _init() {
        super._init();
        this.set_style_class_name('snap-assist-tile');
    }

    public get tile() {
        return this._tile;
    }
}