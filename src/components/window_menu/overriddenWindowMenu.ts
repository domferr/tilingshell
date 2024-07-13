// @ts-expect-error "windowMenu exists"
import * as windowMenu from 'resource:///org/gnome/shell/ui/windowMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GlobalState from '@utils/globalState';
import Settings from '@settings/settings';
import { registerGObjectClass } from '@utils/gjs';
import Tile from '@components/layout/Tile';
import { buildMarginOf, getWindows } from '@utils/ui';
import ExtendedWindow from '@components/tilingsystem/extendedWindow';
import TileUtils from '@components/layout/TileUtils';
import LayoutIcon from './layoutIcon';
import LayoutTileButtons from './layoutTileButtons';

function buildMenuWithLayoutIcon(
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
        46,
        32,
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

    static get(): OverriddenWindowMenu {
        if (this._instance === null)
            this._instance = new OverriddenWindowMenu();
        return this._instance;
    }

    static enable() {
        OverriddenWindowMenu._old_buildMenu =
            windowMenu.WindowMenu.prototype._buildMenu;
        const owm = this.get();
        windowMenu.WindowMenu.prototype._buildMenu = owm.newBuildMenu;
    }

    static disable() {
        this._instance = null;
        windowMenu.WindowMenu.prototype._buildMenu =
            OverriddenWindowMenu._old_buildMenu;
        this._old_buildMenu = null;
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
        ).tiles;
        const vacantTiles = tiles.filter((t) => {
            const tileRect = TileUtils.apply_props(t, workArea);
            return !tiledWindows.find((win) =>
                tileRect.overlap(win.get_frame_rect()),
            );
        });

        const hasGaps = Settings.get_inner_gaps(1).top > 0;

        if (vacantTiles.length > 0) {
            vacantTiles.sort((a, b) => a.x - b.x);

            const middleTileIndex = Math.floor(vacantTiles.length / 2);

            // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
            this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const vacantPopupMenu = new PopupMenu.PopupBaseMenuItem();
            // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
            this.addMenuItem(vacantPopupMenu);
            buildMenuWithLayoutIcon(
                'Move to best tile',
                vacantPopupMenu,
                [vacantTiles[middleTileIndex]],
                tiles,
                hasGaps ? 2 : 0,
            );
            vacantPopupMenu.connect('activate', () => {
                owm.emit('tile-clicked', vacantTiles[middleTileIndex], window);
            });
        }

        if (vacantTiles.length > 1) {
            const vacantLeftPopupMenu = new PopupMenu.PopupBaseMenuItem();
            // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
            this.addMenuItem(vacantLeftPopupMenu);
            buildMenuWithLayoutIcon(
                'Move to leftmost tile',
                vacantLeftPopupMenu,
                [vacantTiles[0]],
                tiles,
                hasGaps ? 2 : 0,
            );
            vacantLeftPopupMenu.connect('activate', () => {
                owm.emit('tile-clicked', vacantTiles[0], window);
            });

            const tilesFromRightToLeft = vacantTiles
                .slice(0)
                .sort((a, b) => (b.x === a.x ? a.y - b.y : b.x - a.x));
            const vacantRightPopupMenu = new PopupMenu.PopupBaseMenuItem();
            // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
            this.addMenuItem(vacantRightPopupMenu);
            buildMenuWithLayoutIcon(
                'Move to rightmost tile',
                vacantRightPopupMenu,
                [tilesFromRightToLeft[0]],
                tiles,
                hasGaps ? 2 : 0,
            );
            vacantRightPopupMenu.connect('activate', () => {
                owm.emit('tile-clicked', tilesFromRightToLeft[0], window);
            });
        }

        // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const layoutsPopupMenu = new PopupMenu.PopupBaseMenuItem();
        const container = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.START,
            yAlign: Clutter.ActorAlign.CENTER,
            xExpand: true,
            yExpand: true,
            vertical: true,
            style: 'spacing: 16px !important',
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
        // @ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
        this.addMenuItem(layoutsPopupMenu);

        const layoutHeight: number = 30;
        const layoutWidth: number = 52; // 16:9 ratio. -> (16*layoutHeight) / 9 and then rounded to int
        const owm = OverriddenWindowMenu.get();
        layouts.forEach((lay, ind) => {
            const row = rows[Math.floor(ind / layoutsPerRow)];
            const layoutWidget = new LayoutTileButtons(
                row,
                lay,
                hasGaps ? 2 : 0,
                layoutHeight,
                layoutWidth,
            );
            layoutWidget.set_size(layoutWidth, layoutHeight);
            layoutWidget.set_x_align(Clutter.ActorAlign.END);
            layoutWidget.buttons.forEach((btn) => {
                btn.connect('clicked', () => {
                    owm.emit('tile-clicked', btn.tile, window);
                    layoutsPopupMenu.activate(Clutter.get_current_event());
                });
            });
            return layoutWidget;
        });
    }
}

/* Main.panel.statusArea.appMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

const layouts = GlobalState.get().layouts;
const rowsBoxLayout: St.BoxLayout[] = [];
const layoutsPerRow = 2;
for (let i = 0; i < layouts.length / layoutsPerRow; i++) {
    const item = new PopupMenu.PopupBaseMenuItem({ styleClass: 'indicator-menu-item' });
    const box = new St.BoxLayout({
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        xExpand: true,
        vertical: false, // horizontal box layout
        styleClass: "layouts-box-layout",
    });
    rowsBoxLayout.push(box);
    item.add_actor(box);
    Main.panel.statusArea.appMenu.menu.addMenuItem(item);
}
const hasGaps = Settings.get_inner_gaps(1).top > 0;

const layoutHeight: number = 36;
const layoutWidth: number = 64; // 16:9 ratio. -> (16*layoutHeight) / 9 and then rounded to int
const layoutsButtons: St.Widget[] = layouts.map((lay, ind) => {
    const btn = new St.Button({xExpand: false, styleClass: "layout-button button"});
    btn.child = new LayoutSelectionWidget(lay, hasGaps ? 1:0, 1, layoutHeight, layoutWidth);
    rowsBoxLayout[Math.floor(ind / layoutsPerRow)].add_child(btn);
    return btn;
});*/
