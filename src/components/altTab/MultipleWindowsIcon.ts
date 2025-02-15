import { registerGObjectClass } from '@utils/gjs';
import { Clutter, Mtk, Meta, St } from '@gi.ext';
import LayoutWidget from '@components/layout/LayoutWidget';
import Tile from '@components/layout/Tile';
import Layout from '@components/layout/Layout';
import { buildMarginOf, buildRectangle } from '@utils/ui';
import { logger } from '@utils/logger';
import TilePreviewWithWindow from './tilePreviewWithWindow';
import MetaWindowGroup from './MetaWindowGroup';
import { _ } from '../../translations';

const debug = logger('MultipleWindowsIcon');

@registerGObjectClass
export default class MultipleWindowsIcon extends LayoutWidget<TilePreviewWithWindow> {
    private _label: St.Label;
    private _window: MetaWindowGroup;

    constructor(params: {
        width: number;
        height: number;
        tiles: Tile[];
        windows: Meta.Window[];
        innerGaps: Clutter.Margin;
    }) {
        super({
            layout: new Layout(params.tiles, ''),
            innerGaps: params.innerGaps.copy(),
            outerGaps: buildMarginOf(2),
        });
        this.set_size(params.width, params.height);
        super.relayout({
            containerRect: buildRectangle({
                x: 0,
                y: 0,
                width: params.width,
                height: params.height,
            }),
        });

        this._previews.forEach((preview, index) => {
            const window = params.windows[index];
            if (!window) {
                // bad input given to the constructor!
                preview.hide();
                return;
            }

            const winClone = new Clutter.Clone({
                source: window.get_compositor_private(),
                width: preview.innerWidth,
                height: preview.innerHeight,
            });
            preview.add_child(winClone);
        });

        this._label = new St.Label({
            text: _('Tiled windows'),
        });
        // gnome shell accesses to this window, we need to abstract operations to work for a group of windows instead of one
        this._window = new MetaWindowGroup(params.windows);
    }

    buildTile(
        parent: Clutter.Actor,
        rect: Mtk.Rectangle,
        gaps: Clutter.Margin,
        tile: Tile,
    ): TilePreviewWithWindow {
        return new TilePreviewWithWindow({ parent, rect, gaps, tile });
    }

    public get window() {
        return this._window;
    }

    public get label() {
        return this._label;
    }
}
