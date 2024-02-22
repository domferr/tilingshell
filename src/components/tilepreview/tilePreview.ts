import {Widget} from "@gi-types/st1";
import {Rectangle, Window} from "@gi-types/meta10";
import {registerGObjectClass} from "@/utils/gjs";
import {logger} from "@/utils/shell";
import {global} from "@/utils/ui";
import { Actor, AnimationMode, Margin } from '@gi-types/clutter10';

export const WINDOW_ANIMATION_TIME = 100;

const debug = logger('tilePreview');

@registerGObjectClass
export class TilePreview extends Widget {
  private _margins: Margin;
  private _showing: boolean;
  private _rect: Rectangle;

  constructor(parent: Actor, rect?: Rectangle, margins?: Margin) {
    super();
    this._rect = rect ? rect : new Rectangle({ width: 0 });
    this._margins = margins ? margins : new Margin();
    parent.add_child(this);
  }

  public set margins(margins: Margin) {
    this._margins = margins;
  }

  _init() {
    super._init();
    this.set_style_class_name('tile-preview custom-tile-preview');
    this.hide();
    this._showing = false;
  }

  public get innerX(): number {
    return this._rect.x + this._margins.left;
  }

  public get innerY(): number {
    return this._rect.y + this._margins.top;
  }

  public get innerWidth(): number {
    return this._rect.width - this._margins.right - this._margins.left;
  }

  public get innerHeight(): number {
    return this._rect.height - this._margins.top - this._margins.bottom;
  }

  public get rect(): Rectangle {
    return this._rect;
  }

  public set rect(newRect: Rectangle) {
    this._rect = newRect;
    this.set_size(this._rect.width, this._rect.height);
    this.set_position(this._rect.x, this._rect.y);
  }

  open(ease: boolean = false, position?: Rectangle) {
    if (position) {
      this._rect = position;
    }
    /*debug(
      `open tile -> x: ${this._rect.x}, y: ${this._rect.y}, width: ${this._rect.width}, height: ${this._rect.height}`,
    );*/
    this._showing = true;
    this.show();
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
  }

  openBelow(window: Window, ease: boolean = false, position?: Rectangle) {
    if (this.get_parent() === global.window_group) {
      let windowActor = window.get_compositor_private();
      if (!windowActor) return;
      global.window_group.set_child_below_sibling(this, windowActor as any);
    }

    if (this._rect.width === 0) {
      const window_rect = window.get_frame_rect();
      this.set_size(window_rect.width, window_rect.height);
      this.set_position(window_rect.x, window_rect.y);
      this.opacity = 0;
    }

    this.open(ease, position);
  }

  openAbove(window: Window, ease: boolean = false, position?: Rectangle) {
    if (this.get_parent() === global.window_group) {
      let windowActor = window.get_compositor_private();
      if (!windowActor) return;
      global.window_group.set_child_above_sibling(this, windowActor as any);
    }

    if (this._rect.width === 0) {
      const window_rect = window.get_frame_rect();
      this.set_size(window_rect.width, window_rect.height);
      this.set_position(window_rect.x, window_rect.y);
      this.opacity = 0;
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
