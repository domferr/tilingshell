import { registerGObjectClass } from '@/utils/gjs';
import { GObject, St, Clutter, Mtk, Meta, Shell } from '@gi.ext';
import Settings from '@settings/settings';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    buildMargin,
    buildRectangle,
    buildTileGaps,
    enableScalingFactorSupport,
    getMonitorScalingFactor,
    getWindowsOfMonitor,
} from '@/utils/ui';
import Layout from '../layout/Layout';
import TileUtils from '../layout/TileUtils';
import Slider from './slider';
import EditableTilePreview from './editableTilePreview';
import Tile from '../layout/Tile';
import HoverLine from './hoverLine';
import { Monitor } from 'resource:///org/gnome/shell/ui/layout.js';
import { getEventCoords } from '@utils/gnomesupport';

@registerGObjectClass
export default class LayoutEditor extends St.Widget {
    private _layout: Layout;
    private _containerRect: Mtk.Rectangle;
    private _innerGaps: Clutter.Margin;
    private _outerGaps: Clutter.Margin;
    private _hoverWidget: HoverLine;
    private _sliders: Slider[];

    private _minimizedWindows: Meta.Window[];

    constructor(layout: Layout, monitor: Monitor, enableScaling: boolean) {
        super({ styleClass: 'layout-editor' });

        Main.layoutManager.addChrome(this);
        global.windowGroup.bind_property(
            'visible',
            this,
            'visible',
            GObject.BindingFlags.DEFAULT,
        );

        if (enableScaling) {
            const scalingFactor = getMonitorScalingFactor(monitor.index);
            enableScalingFactorSupport(this, scalingFactor);
        }

        const workArea = Main.layoutManager.getWorkAreaForMonitor(
            monitor.index,
        );
        this.set_position(workArea.x, workArea.y);
        this.set_size(workArea.width, workArea.height);
        this._innerGaps = buildMargin(Settings.get_inner_gaps());
        this._outerGaps = buildMargin(Settings.get_outer_gaps());
        this._sliders = [];
        this._containerRect = buildRectangle({
            x: 0,
            y: 0,
            width: workArea.width,
            height: workArea.height,
        });

        this._minimizedWindows = getWindowsOfMonitor(monitor).filter(
            (win) => !win.is_hidden(),
        );
        this._minimizedWindows.forEach(
            (win) => win.can_minimize() && win.minimize(),
        );

        this._hoverWidget = new HoverLine(this);

        this._layout = layout;
        this._drawEditor();
        this.grab_key_focus();

        this.connect('destroy', this._onDestroy.bind(this));
    }

    public get layout(): Layout {
        return this._layout;
    }

    public set layout(newLayout: Layout) {
        // cleanup
        this.destroy_all_children();
        this._sliders = [];
        this._hoverWidget = new HoverLine(this);

        // change layout
        this._layout = newLayout;

        this._drawEditor();
    }

    private _drawEditor() {
        const groups = new Map<number, EditableTilePreview[]>();

        // render layout's tile and group tiles
        this._layout.tiles.forEach((tile) => {
            const rect = TileUtils.apply_props(tile, this._containerRect);
            const prev = this._buildEditableTile(tile, rect);
            tile.groups.forEach((id) => {
                if (!groups.has(id)) groups.set(id, []);
                groups.get(id)?.push(prev);
            });
        });

        // build a slider for each group
        groups.forEach((tiles, groupdId) => {
            // sweep-line algorithm to check if it is a horizontal group
            let lines = tiles
                .flatMap((t) => [
                    {
                        c: Math.round(t.tile.x * 1000) / 1000,
                        end: false,
                        r: t.rect.x,
                    },
                    {
                        c: Math.round((t.tile.x + t.tile.width) * 1000) / 1000,
                        end: true,
                        r: t.rect.x + t.rect.width,
                    },
                ])
                .sort((a, b) => (a.c - b.c !== 0 ? a.c - b.c : a.end ? -1 : 1));

            let count = 0;
            let coord = -1;
            let horizontal = false;
            for (const line of lines) {
                count += line.end ? -1 : 1;
                if (count === 0 && line !== lines[lines.length - 1]) {
                    coord = line.r;
                    horizontal = true;
                    break;
                }
            }

            if (coord === -1) {
                // sweep-line algorithm to check if it is a vertical group
                lines = tiles
                    .flatMap((t) => [
                        {
                            c: Math.round(t.tile.y * 1000) / 1000,
                            end: false,
                            r: t.rect.y,
                        },
                        {
                            c:
                                Math.round((t.tile.y + t.tile.height) * 1000) /
                                1000,
                            end: true,
                            r: t.rect.y + t.rect.height,
                        },
                    ])
                    .sort((a, b) =>
                        a.c - b.c !== 0 ? a.c - b.c : a.end ? -1 : 1,
                    );
                count = 0;
                for (const line of lines) {
                    count += line.end ? -1 : 1;
                    if (count === 0 && line !== lines[lines.length - 1]) {
                        coord = line.r;
                        break;
                    }
                }
            }
            const slider = this._buildSlider(horizontal, coord, groupdId);
            this._sliders.push(slider);
            tiles.forEach((editable) => slider.addTile(editable));
        });
    }

    private _buildEditableTile(
        tile: Tile,
        rect: Mtk.Rectangle,
    ): EditableTilePreview {
        const gaps = buildTileGaps(
            rect,
            this._innerGaps,
            this._outerGaps,
            this._containerRect,
        ).gaps;
        const editableTile = new EditableTilePreview({
            parent: this,
            tile,
            containerRect: this._containerRect,
            rect,
            gaps,
        });
        editableTile.open();
        editableTile.connect('clicked', (_, clicked_button: number) => {
            // St.ButtonMask.ONE is left click. 3 is right click (but for some reason St.ButtonMask.THREE is equal to 4, so we cannot use it)
            if (clicked_button === St.ButtonMask.ONE)
                this.splitTile(editableTile);
            else if (clicked_button === 3) this.deleteTile(editableTile);
        });
        editableTile.connect('motion-event', (_, event: Clutter.Event) => {
            const [stageX, stageY] = getEventCoords(event);
            this._hoverWidget.handleMouseMove(
                editableTile,
                stageX - this.x,
                stageY - this.y,
            );
            return Clutter.EVENT_PROPAGATE;
        });
        editableTile.connect('notify::hover', () => {
            const [stageX, stageY] = Shell.Global.get().get_pointer();
            this._hoverWidget.handleMouseMove(
                editableTile,
                stageX - this.x,
                stageY - this.y,
            );
        });
        if (this._sliders.length > 0)
            this.set_child_below_sibling(editableTile, this._sliders[0]);
        return editableTile;
    }

    private splitTile(editableTile: EditableTilePreview) {
        const oldTile = editableTile.tile;
        const index = this._layout.tiles.indexOf(oldTile);
        if (index < 0) return;

        const [x, y, modifier] = global.get_pointer();
        const splitX = (x - this.x) / this._containerRect.width;
        const splitY = (y - this.y) / this._containerRect.height;
        // split horizontally when CTRL is NOT pressed, split vertically instead
        const splitHorizontally =
            (modifier & Clutter.ModifierType.CONTROL_MASK) === 0;

        const prevTile = new Tile({
            x: oldTile.x,
            y: oldTile.y,
            width: splitHorizontally ? splitX - oldTile.x : oldTile.width,
            height: splitHorizontally ? oldTile.height : splitY - oldTile.y,
            groups: [],
        });

        const nextTile = new Tile({
            x: splitHorizontally ? splitX : oldTile.x,
            y: splitHorizontally ? oldTile.y : splitY,
            width: splitHorizontally
                ? oldTile.width - prevTile.width
                : oldTile.width,
            height: splitHorizontally
                ? oldTile.height
                : oldTile.height - prevTile.height,
            groups: [],
        });

        const prevRect = TileUtils.apply_props(prevTile, this._containerRect);
        const nextRect = TileUtils.apply_props(nextTile, this._containerRect);
        if (
            prevRect.height < EditableTilePreview.MIN_TILE_SIZE ||
            prevRect.width < EditableTilePreview.MIN_TILE_SIZE ||
            nextRect.height < EditableTilePreview.MIN_TILE_SIZE ||
            nextRect.width < EditableTilePreview.MIN_TILE_SIZE
        )
            return;

        this._layout.tiles[index] = prevTile;
        this._layout.tiles.push(nextTile);

        const prevEditableTile = this._buildEditableTile(prevTile, prevRect);
        const nextEditableTile = this._buildEditableTile(nextTile, nextRect);

        const slider = this._buildSlider(
            splitHorizontally,
            splitHorizontally
                ? nextEditableTile.rect.x
                : nextEditableTile.rect.y,
        );
        this._sliders.push(slider);
        slider.addTile(prevEditableTile);
        slider.addTile(nextEditableTile);

        if (splitHorizontally) {
            editableTile
                .getSlider(St.Side.TOP)
                ?.onTileSplit(editableTile, [
                    prevEditableTile,
                    nextEditableTile,
                ]);
            editableTile
                .getSlider(St.Side.BOTTOM)
                ?.onTileSplit(editableTile, [
                    prevEditableTile,
                    nextEditableTile,
                ]);
            editableTile
                .getSlider(St.Side.LEFT)
                ?.onTileSplit(editableTile, [prevEditableTile]);
            editableTile
                .getSlider(St.Side.RIGHT)
                ?.onTileSplit(editableTile, [nextEditableTile]);
        } else {
            editableTile
                .getSlider(St.Side.LEFT)
                ?.onTileSplit(editableTile, [
                    prevEditableTile,
                    nextEditableTile,
                ]);
            editableTile
                .getSlider(St.Side.RIGHT)
                ?.onTileSplit(editableTile, [
                    prevEditableTile,
                    nextEditableTile,
                ]);
            editableTile
                .getSlider(St.Side.TOP)
                ?.onTileSplit(editableTile, [prevEditableTile]);
            editableTile
                .getSlider(St.Side.BOTTOM)
                ?.onTileSplit(editableTile, [nextEditableTile]);
        }

        this._hoverWidget.handleTileDestroy(editableTile);
        editableTile.destroy();
    }

    private deleteTile(editableTile: EditableTilePreview) {
        for (const slider of editableTile.getAllSliders()) {
            if (slider === null) continue;

            const success = slider.deleteSlider(
                editableTile,
                this._innerGaps,
                this._outerGaps,
            );
            if (success) {
                this._layout.tiles = this._layout.tiles.filter(
                    (tile) => tile !== editableTile.tile,
                );
                this._sliders = this._sliders.filter((sl) => sl !== slider);
                this._hoverWidget.handleTileDestroy(editableTile);
                editableTile.destroy();
                slider.destroy();
                return;
            }
        }
    }

    private _buildSlider(
        isHorizontal: boolean,
        coord: number,
        groupId?: number,
    ): Slider {
        if (!groupId) {
            const groups = this._sliders.map((slider) => slider.groupId).sort();
            groupId = groups.length === 0 ? 1 : groups[groups.length - 1] + 1;
            for (let i = 1; i < groups.length; i++) {
                if (groups[i - 1] + 1 < groups[i]) {
                    groupId = groups[i - 1] + 1;
                    break;
                }
            }
        }
        return new Slider(this, groupId, coord, coord, isHorizontal);
    }

    private _onDestroy() {
        this._minimizedWindows.forEach((win) => win.unminimize());

        this.destroy_all_children();
        this._sliders = [];

        super.destroy();
    }
}
