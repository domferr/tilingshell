import { buildRectangle, getScalingFactorOf } from '@utils/ui';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import { registerGObjectClass } from '@/utils/gjs';
import { logger } from '@/utils/shell';

export const WINDOW_ANIMATION_TIME = 100;

const debug = logger('tilePreview');

//export module TilePreview {
export interface TilePreviewConstructorProperties extends St.Widget.ConstructorProps {
  parent: Clutter.Actor;
  rect: Mtk.Rectangle;
  gaps: Clutter.Margin;
}
//}

@registerGObjectClass
export default class TilePreview extends St.Widget {
  protected _rect: Mtk.Rectangle;
  protected _showing: boolean;

  private _gaps: Clutter.Margin;

  constructor(params: Partial<TilePreviewConstructorProperties>) {
    super(params);
    if (params.parent) params.parent.add_child(this);

    this._showing = false;
    this._rect = params.rect || buildRectangle({});
    this._gaps = new Clutter.Margin();
    this.gaps = params.gaps || new Clutter.Margin();
  }

  public set gaps(gaps: Clutter.Margin) {
    const [_, scalingFactor] = getScalingFactorOf(this);
    this._gaps.top = gaps.top * scalingFactor;
    this._gaps.right = gaps.right * scalingFactor;
    this._gaps.bottom = gaps.bottom * scalingFactor;
    this._gaps.left = gaps.left * scalingFactor;

    if (this._gaps.top === 0 && this._gaps.bottom === 0 && this._gaps.right === 0 && this._gaps.left === 0) {
      this.remove_style_class_name('custom-tile-preview');
    } else {
      this.add_style_class_name('custom-tile-preview');
    }
  }

  public get gaps(): Clutter.Margin {
    return this._gaps;
  }

  _init() {
    super._init();
    this.set_style_class_name('tile-preview custom-tile-preview');
    this.hide();
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

  public get rect(): Mtk.Rectangle {
    return this._rect;
  }

  public get showing(): boolean {
    return this._showing;
  }

  public open(ease: boolean = false, position?: Mtk.Rectangle) {
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

  public openBelow(window: Meta.Window, ease: boolean = false, position?: Mtk.Rectangle) {
    if (this.get_parent() === global.windowGroup) {
      const windowActor = window.get_compositor_private();
      if (!windowActor) return;
      global.windowGroup.set_child_below_sibling(this, windowActor as any);
    }

    this.open(ease, position);
  }

  public openAbove(window: Meta.Window, ease: boolean = false, position?: Mtk.Rectangle) {
    if (this.get_parent() === global.windowGroup) {
      const windowActor = window.get_compositor_private();
      if (!windowActor) return;
      global.windowGroup.set_child_above_sibling(this, windowActor as any);
    }

    this.open(ease, position);
  }

  public close(ease: boolean = false) {
    if (!this._showing) return;

    this._showing = false;
    // @ts-ignore
    this.ease({
      opacity: 0,
      duration: ease ? WINDOW_ANIMATION_TIME : 0,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      onComplete: () => this.hide(),
    });
  }
}
