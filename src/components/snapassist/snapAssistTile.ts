import { registerGObjectClass } from "@/utils/gjs";
import { Rectangle } from "@gi-types/meta10";
import { Actor, Margin } from '@gi-types/clutter10';
import { TilePreview } from "../tilepreview/tilePreview";

@registerGObjectClass
export class SnapAssistTile extends TilePreview {
    constructor(parent: Actor, rect?: Rectangle, margins?: Margin) {
        super(parent, rect, margins);
    }
    
    _init() {
        super._init();
        this.set_style_class_name('snap-assist-tile');
    }
}