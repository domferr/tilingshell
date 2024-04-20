import { registerGObjectClass } from "@/utils/gjs";
import Shell from "@gi-types/shell0";
import TilePreview from "./tilePreview";

@registerGObjectClass
export default class BlurTilePreview extends TilePreview {
  _init() {
    super._init();
    this.add_effect(
      new Shell.BlurEffect({
        sigma: 12,
        brightness: 1,
        mode: Shell.BlurMode.BACKGROUND, // blur what is behind the widget
      }),
    );
    this.add_style_class_name("blur-tile-preview");
  }
}