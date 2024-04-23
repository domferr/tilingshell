import { registerGObjectClass } from "@/utils/gjs";
import Mtk from 'gi://Mtk';
import Clutter from 'gi://Clutter';
import TilePreview from "./tilePreview";
import { logger } from "@/utils/shell";

const debug = logger("SelectionTilePreview");

@registerGObjectClass
export default class SelectionTilePreview extends TilePreview {
  private _backgroundColor: Clutter.Color | null = null;
  private _styleChangedSignalID: number | null = null;

  constructor(params: {
    parent?: Clutter.Actor,
    rect?: Mtk.Rectangle,
    gaps?: Clutter.Margin,
  }) {
    super({ name:"SelectionTilePreview", ...params });

    this._recolor();
    this._styleChangedSignalID = this.connect("style-changed", () => {
      const { red, green, blue } = this.get_theme_node().get_background_color();
      
      if (this._backgroundColor?.red !== red || this._backgroundColor?.green !== green || this._backgroundColor?.blue !== blue) {
        this._recolor();
      }
    });
  }

  _init() {
    super._init();
    this.add_style_class_name("selection-tile-preview");
  }

  _recolor() {
    this._backgroundColor = this.get_theme_node().get_background_color().copy();
    
    // since an alpha value lower than 160 is not so much visible, enforce a minimum value of 160
    let newAlpha = Math.max(Math.min(this._backgroundColor.alpha + 35, 255), 160);
    // The final alpha value is divided by 255 since CSS needs a value from 0 to 1, but ClutterColor expresses alpha from 0 to 255
    this.set_style(`
      background-color: rgba(${this._backgroundColor.red}, ${this._backgroundColor.green}, ${this._backgroundColor.blue}, ${newAlpha / 255}) !important;
    `);
  }

  close() {
    if (!this._showing) return;

    this._rect.width = 0;
    this._rect.height = 0;
    super.close();
  }

  destroy() {
    if (this._styleChangedSignalID) this.disconnect(this._styleChangedSignalID);
    this._styleChangedSignalID = null;
    super.destroy();
  }
}