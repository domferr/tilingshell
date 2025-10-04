// @ts-expect-error "windowMenu exists"
import * as windowMenu from 'resource:///org/gnome/shell/ui/windowMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { GObject, St, Clutter, Meta } from '@gi.ext';
import GlobalState from '@utils/globalState';
import { registerGObjectClass } from '@utils/gjs';
import Tile from '@components/layout/Tile';
import {
    enableScalingFactorSupport,
    getMonitorScalingFactor,
    getWindows,
} from '@utils/ui';
import ExtendedWindow from '@components/tilingsystem/extendedWindow';
import TileUtils from '@components/layout/TileUtils';
import LayoutTileButtons from './layoutTileButtons';
import { buildMarginOf } from '@utils/ui';
import LayoutIcon from './layoutIcon';
import { _ } from '../../translations';
import { widgetOrientation } from '@utils/gnomesupport';

const LAYOUT_ICON_WIDTH = 46;
const LAYOUT_ICON_HEIGHT = 32;
const INNER_GAPS = 2;

export function buildMenuWithLayoutIcon(
    title: string,
    popupMenu: PopupMenu.PopupBaseMenuItem,
    importantTiles: Tile[],
    tiles: Tile[],
    innerGaps: number,
) {
    popupMenu.add_child(
        new St.Label({
            text: title,
            yAlign: Clutter.ActorAlign.CENTER,
            xExpand: true,
        }),
    );
    const layoutIcon = new LayoutIcon(
        popupMenu,
        importantTiles,
        tiles,
        buildMarginOf(innerGaps),
        buildMarginOf(4),
        LAYOUT_ICON_WIDTH,
        LAYOUT_ICON_HEIGHT,
    );
    layoutIcon.set_x_align(Clutter.ActorAlign.END);
}

@registerGObjectClass
export default class OverriddenWindowMenu extends GObject.Object {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'OverriddenWindowMenu',
        Signals: {
            'tile-clicked': {
                param_types: [Tile.$gtype, Meta.Window.$gtype],
            },
        },
    };

    private static _instance: OverriddenWindowMenu | null = null;
    private static _old_buildMenu: ((window: Meta.Window) => void) | null;
    private static _enabled: boolean = false;

    static get(): OverriddenWindowMenu {
        if (this._instance === null)
            this._instance = new OverriddenWindowMenu();
        return this._instance;
    }

    static enable() {
        // if it is already enabled, do not enable again
        if (this._enabled) return;

        const owm = this.get();

        OverriddenWindowMenu._old_buildMenu =
            windowMenu.WindowMenu.prototype._buildMenu;
        windowMenu.WindowMenu.prototype._buildMenu = owm.newBuildMenu;

        this._enabled = true;
    }

    static disable() {
        // if it is not enabled, do not disable
        if (!this._enabled) return;

        windowMenu.WindowMenu.prototype._buildMenu =
            OverriddenWindowMenu._old_buildMenu;
        this._old_buildMenu = null;

        this._enabled = false;
    }

    static destroy() {
        this.disable();
        this._instance = null;
    }

    // the function will be treated as a method of class WindowMenu
    private newBuildMenu(window: Meta.Window) {
        const oldFunction = OverriddenWindowMenu._old_buildMenu?.bind(this);
        if (oldFunction) oldFunction(window);

        const layouts = GlobalState.get().layouts;
        if (layouts.length === 0) return;

        const workArea = Main.layoutManager.getWorkAreaForMonitor(
            window.get_monitor(),
        );
        const tiledWindows: ExtendedWindow[] = getWindows()
            .map((otherWindow) => {
                return otherWindow &&
                    !otherWindow.minimized &&
                    (otherWindow as ExtendedWindow).assignedTile
                    ? (otherWindow as ExtendedWindow)
                    : undefined;
            })
            .filter((w) => w !== undefined);

        const tiles = GlobalState.get().getSelectedLayoutOfMonitor(
            window.get_monitor(),
            global.workspaceManager.get_active_workspace_index(),
        ).tiles;
        const vacantTiles = tiles.filter((t) => {
            const tileRect = TileUtils.apply_props(t, workArea);
            return !tiledWindows.find((win) =>
                tileRect.overlap(win.get_frame_rect()),
            );
        });

        const enableScaling =
            window.get_monitor() === Main.layoutManager.primaryIndex;
        const scalingFactor = getMonitorScalingFactor(window.get_monitor());

        if (vacantTiles.length > 0) {
            vacantTiles.sort((a, b) => a.x - b.x);

            let bestTileIndex = 0;
            let bestDistance = Math.abs(
                0.5 -
                    vacantTiles[bestTileIndex].x +
                    vacantTiles[bestTileIndex].width / 2,
            );
            for (let index = 1; index < vacantTiles.length; index++) {
                const distance = Math.abs(
                    0.5 - (vacantTiles[index].x + vacantTiles[index].width / 2),
                );
                if (bestDistance > distance) {
                    bestTileIndex = index;
                    bestDistance = distance;
                }
            }

            // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
            this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const vacantPopupMenu = new PopupMenu.PopupBaseMenuItem();
            // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
            this.addMenuItem(vacantPopupMenu);
            if (enableScaling)
                enableScalingFactorSupport(vacantPopupMenu, scalingFactor);

            buildMenuWithLayoutIcon(
                _('Move to best tile'),
                vacantPopupMenu,
                [vacantTiles[bestTileIndex]],
                tiles,
                INNER_GAPS,
            );
            vacantPopupMenu.connect('activate', () => {
                OverriddenWindowMenu.get().emit(
                    'tile-clicked',
                    vacantTiles[bestTileIndex],
                    window,
                );
            });
        }

        if (vacantTiles.length > 1) {
            const vacantLeftPopupMenu = new PopupMenu.PopupBaseMenuItem();
            // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
            this.addMenuItem(vacantLeftPopupMenu);
            if (enableScaling)
                enableScalingFactorSupport(vacantLeftPopupMenu, scalingFactor);
            buildMenuWithLayoutIcon(
                _('Move to leftmost tile'),
                vacantLeftPopupMenu,
                [vacantTiles[0]],
                tiles,
                INNER_GAPS,
            );
            vacantLeftPopupMenu.connect('activate', () => {
                OverriddenWindowMenu.get().emit(
                    'tile-clicked',
                    vacantTiles[0],
                    window,
                );
            });

            const tilesFromRightToLeft = vacantTiles
                .slice(0)
                .sort((a, b) => (b.x === a.x ? a.y - b.y : b.x - a.x));
            const vacantRightPopupMenu = new PopupMenu.PopupBaseMenuItem();
            // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
            this.addMenuItem(vacantRightPopupMenu);
            if (enableScaling)
                enableScalingFactorSupport(vacantRightPopupMenu, scalingFactor);
            buildMenuWithLayoutIcon(
                _('Move to rightmost tile'),
                vacantRightPopupMenu,
                [tilesFromRightToLeft[0]],
                tiles,
                INNER_GAPS,
            );
            vacantRightPopupMenu.connect('activate', () => {
                OverriddenWindowMenu.get().emit(
                    'tile-clicked',
                    tilesFromRightToLeft[0],
                    window,
                );
            });
        }

        // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const layoutsPopupMenu = new PopupMenu.PopupBaseMenuItem();
        // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
        this.addMenuItem(layoutsPopupMenu);
        const container = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.START,
            yAlign: Clutter.ActorAlign.CENTER,
            xExpand: true,
            yExpand: true,
            style: 'spacing: 16px !important',
            ...widgetOrientation(true),
        });
        layoutsPopupMenu.add_child(container);
        const layoutsPerRow = 4;
        const rows: St.BoxLayout[] = [];
        for (let index = 0; index < layouts.length; index += layoutsPerRow) {
            const box = new St.BoxLayout({
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                xExpand: true,
                yExpand: true,
                style: 'spacing: 6px;',
            });
            rows.push(box);
            container.add_child(box);
        }
        if (enableScaling)
            enableScalingFactorSupport(layoutsPopupMenu, scalingFactor);

        const layoutHeight: number = 30;
        const layoutWidth: number = 52; // 16:9 ratio. -> (16*layoutHeight) / 9 and then rounded to int
        layouts.forEach((lay, ind) => {
            const row = rows[Math.floor(ind / layoutsPerRow)];
            const layoutWidget = new LayoutTileButtons(
                row,
                lay,
                INNER_GAPS,
                layoutHeight,
                layoutWidth,
            );
            layoutWidget.set_x_align(Clutter.ActorAlign.END);
            layoutWidget.buttons.forEach((btn) => {
                btn.connect('clicked', () => {
                    OverriddenWindowMenu.get().emit(
                        'tile-clicked',
                        btn.tile,
                        window,
                    );
                    layoutsPopupMenu.activate(Clutter.get_current_event());
                });
            });
        });

        /* const quarterTiles: [Tile, string][] = [
            [
                new Tile({ x: 0, y: 0, width: 0.5, height: 0.5, groups: [] }),
                'Move to Top Left',
            ],
            [
                new Tile({ x: 0.5, y: 0, width: 0.5, height: 0.5, groups: [] }),
                'Move to Top Right',
            ],
            [
                new Tile({ x: 0, y: 0.5, width: 0.5, height: 0.5, groups: [] }),
                'Move to Bottom Left',
            ],
            [
                new Tile({
                    x: 0.5,
                    y: 0.5,
                    width: 0.5,
                    height: 0.5,
                    groups: [],
                }),
                'Move to Bottom Right',
            ],
        ];

        quarterTiles.forEach(([tile, label]) => {
            const pMenu = new PopupMenu.PopupBaseMenuItem();
            this.addMenuItem(pMenu);
            buildMenuWithLayoutIcon(
                label,
                pMenu,
                [tile],
                [tile],
                hasGaps ? 2 : 0,
            );
            pMenu.connect('activate', () => {
                owm.emit('tile-clicked', tile, window);
            });
        });*/
    }

    static connect(key: string, func: (...arg: unknown[]) => void): number {
        return this.get().connect(key, func) || -1;
    }

    static disconnect(id: number) {
        this.get().disconnect(id);
    }
}
