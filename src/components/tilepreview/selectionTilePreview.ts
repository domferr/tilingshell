import { registerGObjectClass } from "@/utils/gjs";
import { Rectangle, Window } from "@gi-types/meta10";
import { Actor, Color, Margin } from '@gi-types/clutter10';
import { TilePreview } from "./tilePreview";
import { logger } from "@/utils/shell";

const debug = logger("SelectionTilePreview");

@registerGObjectClass
export class SelectionTilePreview extends TilePreview {
  private _backgroundColor: Color | null = null;

  constructor(parent: Actor, rect?: Rectangle, margins?: Margin) {
    super(parent, rect, margins);
  }

  private _ensureBackgroundIsSet() {
    // delay setting up the background color so we are sure that the gnome shell theme was applied
    if (this._backgroundColor !== null) return;

    this._backgroundColor = this.get_theme_node().get_background_color();
    //debug(`constructor, tile color is ${this._backgroundColor.red} ${this._backgroundColor.green} ${this._backgroundColor.blue} ${this._backgroundColor.alpha}`);
    
    // since an alpha value lower than 160 is not so much visible, enforce a minimum value of 160
    let newAlpha = Math.max(Math.min(this._backgroundColor.alpha + 35, 255), 160);
    // The final alpha value is divided by 255 since CSS needs a value from 0 to 1, but ClutterColor expresses alpha from 0 to 255
    this.set_style(`
      background-color: rgba(${this._backgroundColor.red}, ${this._backgroundColor.green}, ${this._backgroundColor.blue}, ${newAlpha / 255}) !important;
    `);
    this.remove_style_class_name("tile-preview");
  }

  open(ease: boolean = false, position?: Rectangle) {
    this._ensureBackgroundIsSet();
    super.open(ease, position);
  }

  openBelow(window: Window, ease: boolean = false, position?: Rectangle) {
    this._ensureBackgroundIsSet();
    super.openBelow(window, ease, position);
  }

  openAbove(window: Window, ease: boolean = false, position?: Rectangle) {
    this._ensureBackgroundIsSet();
    super.openAbove(window, ease, position);
  }
}