import Shell from 'gi://Shell';

import { registerGObjectClass } from '@/utils/gjs';

import TilePreview from './tilePreview';

@registerGObjectClass
export default class BlurTilePreview extends TilePreview {
  _init() {
    super._init();

    // changes in GNOME 46+
    // The sigma in Shell.BlurEffect should be replaced by radius. Since the sigma value
    // is radius / 2.0, the radius value will be sigma * 2.0.
    const sigma = 36;
    this.add_effect(
      new Shell.BlurEffect({
        //@ts-ignore
        sigma: sigma,
        //radius: sigma * 2,
        brightness: 1,
        mode: Shell.BlurMode.BACKGROUND, // blur what is behind the widget
      }),
    );
    this.add_style_class_name('blur-tile-preview');
  }
}
