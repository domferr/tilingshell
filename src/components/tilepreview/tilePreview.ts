import St from "@gi-types/st1";
import Meta from "@gi-types/meta10";
import { registerGObjectClass } from "@/utils/gjs";
import { logger } from "@/utils/shell";
import { global } from "@/utils/ui";
import Clutter from '@gi-types/clutter10';

export const WINDOW_ANIMATION_TIME = 100;

const debug = logger('tilePreview');

export module TilePreview {
  export interface ConstructorProperties 
    extends St.Widget.ConstructorProperties {
        parent: Clutter.Actor;
        rect: Meta.Rectangle;
        gaps: Clutter.Margin;
  }
}

@registerGObjectClass
export default class TilePreview extends St.Widget {
  protected _rect: Meta.Rectangle;
  protected _showing: boolean;
  
  private _gaps: Clutter.Margin;

  constructor(params: Partial<TilePreview.ConstructorProperties>) {
    super(params);
    this._rect = params.rect || new Meta.Rectangle({ width: 0 });
    this._gaps = params.gaps || new Clutter.Margin();
    if (params.parent) params.parent.add_child(this);
  }

  public set gaps(gaps: Clutter.Margin) {
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

  public get rect(): Meta.Rectangle {
    return this._rect;
  }

  public get showing(): boolean {
    return this._showing;
  }

  public open(ease: boolean = false, position?: Meta.Rectangle) {
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
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    } else {
      this.set_position(this.innerX, this.innerY);
      this.set_size(this.innerWidth, this.innerHeight);
      // @ts-ignore
      this.ease({
        opacity: 255,
        duration: ease ? WINDOW_ANIMATION_TIME : 0,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    }
  }

  public openBelow(window: Meta.Window, ease: boolean = false, position?: Meta.Rectangle) {
    if (this.get_parent() === global.window_group) {
      let windowActor = window.get_compositor_private();
      if (!windowActor) return;
      global.window_group.set_child_below_sibling(this, windowActor as any);
    }

    this.open(ease, position);
  }

  public openAbove(window: Meta.Window, ease: boolean = false, position?: Meta.Rectangle) {
    if (this.get_parent() === global.window_group) {
      let windowActor = window.get_compositor_private();
      if (!windowActor) return;
      global.window_group.set_child_above_sibling(this, windowActor as any);
    }

    this.open(ease, position);
  }

  public close() {
    if (!this._showing) return;

    this._showing = false;
    // @ts-ignore
    this.ease({
      opacity: 0,
      duration: WINDOW_ANIMATION_TIME,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      onComplete: () => this.hide(),
    });
  }
}
