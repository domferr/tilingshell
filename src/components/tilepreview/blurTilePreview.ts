import { registerGObjectClass } from "@/utils/gjs";
import { BlurEffect } from "@gi-types/shell0";
import { TilePreview } from "./tilePreview";

@registerGObjectClass
export class BlurTilePreview extends TilePreview {
  _init() {
    super._init();
    this.add_effect(
      new BlurEffect({
        sigma: 4,
        brightness: 1,
        mode: 1, // blur the background of the widget
      }),
    );
  }
}