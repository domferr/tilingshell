import { registerGObjectClass } from "@/utils/gjs";
import { Rectangle } from "@gi-types/meta10";
import { Actor, Margin } from '@gi-types/clutter10';
import { TilePreview } from "./tilePreview";

@registerGObjectClass
export class SelectionTilePreview extends TilePreview {

  constructor(parent: Actor, rect?: Rectangle, margins?: Margin) {
    super(parent, rect, margins);

    const color = this.get_theme_node().get_background_color();
    //debug(`tile color is ${color.red} ${color.green} ${color.blue} ${color.alpha}`)
    let newAlpha = Math.min(color.alpha + 35, 255);
    // since an alpha value lower than 160 is not so much visible, enforce a minimum value of 160
    if (newAlpha < 160) newAlpha = 160;
    // The final alpha value is divided by 255 since CSS needs a value from 0 to 1, but ClutterColor expresses alpha from 0 to 255
    this.set_style(`
        background-color: rgba(${color.red}, ${color.green}, ${color.blue}, ${newAlpha / 255});
    `);
    this.remove_style_class_name("tile-preview");
    this.ensure_style();
  }
}