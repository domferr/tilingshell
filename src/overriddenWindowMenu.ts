//@ts-expect-error "windowMenu exists"
import * as windowMenu from 'resource:///org/gnome/shell/ui/windowMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Mtk from 'gi://Mtk';
import GlobalState from '@globalState';
import Settings from '@settings';
import { registerGObjectClass } from '@utils/gjs';
import SnapAssistTile from '@components/snapassist/snapAssistTile';
import LayoutWidget from '@components/layout/LayoutWidget';
import Layout from '@components/layout/Layout';
import Tile from '@components/layout/Tile';
import { buildMarginOf, buildRectangle } from '@utils/ui';

@registerGObjectClass
class SnapAssistTileButton extends SnapAssistTile {
    private readonly _btn: St.Button;

    constructor(params: {
        parent?: Clutter.Actor;
        rect?: Mtk.Rectangle;
        gaps?: Clutter.Margin;
        tile: Tile;
    }) {
        super(params);
        this._btn = new St.Button({
            xExpand: true,
            yExpand: true,
            trackHover: true,
        });
        this.add_child(this._btn);
        this._btn.set_size(this.innerWidth, this.innerHeight);

        // for some reason this doesn't work: this.bind_property("hover", this._btn, "hover", GObject.BindingFlags.DEFAULT);
        this._btn.connect('notify::hover', () =>
            this.set_hover(this._btn.hover),
        );
    }

    public get tile(): Tile {
        return this._tile;
    }

    public get checked(): boolean {
        return this._btn.checked;
    }

    public set_checked(newVal: boolean) {
        this._btn.set_checked(newVal);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public connect(id: string, callback: (...args: any[]) => any): number;
    public connect(
        signal: 'clicked',
        callback: (_source: this, clicked_button: number) => void,
    ): number;
    public connect(signal: string, callback: never): number {
        if (signal === 'clicked') {
            return this._btn.connect(signal, callback);
        }
        return super.connect(signal, callback);
    }
}

@registerGObjectClass
class LayoutTileButtons extends LayoutWidget<SnapAssistTileButton> {
    constructor(
        parent: Clutter.Actor,
        layout: Layout,
        gapSize: number,
        height: number,
        width: number,
    ) {
        super({
            parent,
            layout,
            containerRect: buildRectangle({ x: 0, y: 0, width, height }),
            innerGaps: buildMarginOf(gapSize),
            outerGaps: new Clutter.Margin(),
            styleClass: 'window-menu-layout',
        });
        this.relayout();
    }

    buildTile(
        parent: Clutter.Actor,
        rect: Mtk.Rectangle,
        gaps: Clutter.Margin,
        tile: Tile,
    ): SnapAssistTileButton {
        return new SnapAssistTileButton({ parent, rect, gaps, tile });
    }

    public get buttons(): SnapAssistTileButton[] {
        return this._previews;
    }
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

    constructor() {
        super();
    }

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

        //@ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const layoutsPopupMenu = new PopupMenu.PopupBaseMenuItem({
            /* style_class: "indicator-menu-item" */
        });
        const container = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.START,
            yAlign: Clutter.ActorAlign.CENTER,
            xExpand: true,
            yExpand: true,
            vertical: true,
            style: 'spacing: 16px !important',
        });
        layoutsPopupMenu.add_child(container);
        const n_rows = layouts.length / 2;
        const rows: St.BoxLayout[] = [];
        for (let index = 0; index < n_rows; index++) {
            const box = new St.BoxLayout({
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                xExpand: true,
                yExpand: true,
                style: 'spacing: 42px',
            });
            rows.push(box);
            container.add_child(box);
        }
        //@ts-expect-error "this is not an instance of OverriddenWindowMenu, but it is the WindowMenu itself"
        this.addMenuItem(layoutsPopupMenu);

        const hasGaps = Settings.get_inner_gaps(1).top > 0;

        const layoutHeight: number = 36;
        const layoutWidth: number = 64; // 16:9 ratio. -> (16*layoutHeight) / 9 and then rounded to int
        const owm = OverriddenWindowMenu.get();
        layouts.forEach((lay, ind) => {
            const row = rows[ind % n_rows];
            //const btn = new LayoutButton(row, lay, hasGaps ? 2:0, layoutHeight, layoutWidth);
            const layoutWidget = new LayoutTileButtons(
                row,
                lay,
                hasGaps ? 2 : 0,
                layoutHeight,
                layoutWidth,
            );
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
