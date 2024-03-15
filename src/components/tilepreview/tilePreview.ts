import {Widget} from "@gi-types/st1";
import {Rectangle, Window} from "@gi-types/meta10";
import {registerGObjectClass} from "@/utils/gjs";
import {logger} from "@/utils/shell";
import {global} from "@/utils/ui";
import { Actor, AnimationMode, Margin } from '@gi-types/clutter10';
import { Tile } from "../layout/Tile";

export const WINDOW_ANIMATION_TIME = 100;

const debug = logger('tilePreview');

@registerGObjectClass
export class TilePreview extends Widget {
  private _gaps: Margin;
  protected _rect: Rectangle;
  protected _showing: boolean;
  protected _tile: Tile;

  constructor(params: {
    parent?: Actor,
    rect?: Rectangle,
    gaps?: Margin,
    tile: Tile
  }) {
    super();
    this._rect = params.rect || new Rectangle({ width: 0 });
    this._gaps = params.gaps || new Margin();
    if (params.parent) params.parent.add_child(this);
    this._tile = params.tile;
  }

  public set gaps(gaps: Margin) {
    this._gaps = gaps;
  }

  _init() {
    super._init();
    this.set_style_class_name('tile-preview custom-tile-preview');
    this.hide();
    this._showing = false;
  }

  public get innerX(): number {
    return this._rect.x + this._gaps.left;
  }

  public get innerY(): number {
    return this._rect.y + this._gaps.top;
  }

  public get innerWidth(): number {
    return this._rect.width - this._gaps.right - this._gaps.left;
  }

  public get innerHeight(): number {
    return this._rect.height - this._gaps.top - this._gaps.bottom;
  }

  public get rect(): Rectangle {
    return this._rect;
  }

  public get showing(): boolean {
    return this._showing;
  }

  /*public set rect(newRect: Rectangle) {
    this._rect = newRect;
    this.set_size(this._rect.width, this._rect.height);
    this.set_position(this._rect.x, this._rect.y);
  }*/

  open(ease: boolean = false, position?: Rectangle) {
    if (position) this._rect = position;
    
    /*debug(
      `open tile -> x: ${this._rect.x}, y: ${this._rect.y}, width: ${this._rect.width}, height: ${this._rect.height}`,
    );*/
    const fadeInMove = this._showing;
    this._showing = true;
    this.show();
    if (fadeInMove) {
      // @ts-ignore
      this.ease({
        x: this.innerX,
        y: this.innerY,
        width: this.innerWidth,
        height: this.innerHeight,
        opacity: 255,
        duration: ease ? WINDOW_ANIMATION_TIME : 0,
        mode: AnimationMode.EASE_OUT_QUAD,
      });
    } else {
      this.set_position(this.innerX, this.innerY);
      this.set_size(this.innerWidth, this.innerHeight);
      // @ts-ignore
      this.ease({
        opacity: 255,
        duration: ease ? WINDOW_ANIMATION_TIME : 0,
        mode: AnimationMode.EASE_OUT_QUAD,
      });
    }
  }

  openBelow(window: Window, ease: boolean = false, position?: Rectangle) {
    if (this.get_parent() === global.window_group) {
      let windowActor = window.get_compositor_private();
      if (!windowActor) return;
      global.window_group.set_child_below_sibling(this, windowActor as any);
    }

    this.open(ease, position);
  }

  openAbove(window: Window, ease: boolean = false, position?: Rectangle) {
    if (this.get_parent() === global.window_group) {
      let windowActor = window.get_compositor_private();
      if (!windowActor) return;
      global.window_group.set_child_above_sibling(this, windowActor as any);
    }

    this.open(ease, position);
  }

  close() {
    if (!this._showing) return;

    this._showing = false;
    // @ts-ignore
    this.ease({
      opacity: 0,
      duration: WINDOW_ANIMATION_TIME,
      mode: AnimationMode.EASE_OUT_QUAD,
      onComplete: () => this.hide(),
    });
  }

  destroy() {
    //debug(`destroy tile at position { x: ${this.x}, y: ${this.y} }`);
    super.destroy();
  }
}
