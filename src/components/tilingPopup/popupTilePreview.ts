import { registerGObjectClass } from '@/utils/gjs';
import { GObject, St, Clutter, Mtk, Graphene } from '@gi.ext';
import TilePreview from '../tilepreview/tilePreview';
import { buildBlurEffect } from '@utils/ui';
import Tile from '@components/layout/Tile';
import MasonryLayoutManager from './masonryLayoutManager';

const MASONRY_LAYOUT_SPACING = 32;

@registerGObjectClass
export default class PopupTilePreview extends TilePreview {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'PopupTilePreview',
        Properties: {
            blur: GObject.ParamSpec.boolean(
                'blur',
                'blur',
                'Enable or disable the blur effect',
                GObject.ParamFlags.READWRITE,
                false,
            ),
        },
    };

    private _blur: boolean;
    private _container: St.Widget;

    constructor(params: {
        parent: Clutter.Actor;
        maxRowHeight: number;
        tile?: Tile;
        rect?: Mtk.Rectangle;
        gaps?: Clutter.Margin;
    }) {
        super(params);

        // blur not supported due to GNOME shell known bug
        this._blur = false;
        /* Settings.bind(
            Settings.KEY_ENABLE_BLUR_SELECTED_TILEPREVIEW,
            this,
            'blur',
            Gio.SettingsBindFlags.GET,
        );*/

        this._recolor();
        const styleChangedSignalID = St.ThemeContext.get_for_stage(
            global.get_stage(),
        ).connect('changed', () => {
            this._recolor();
        });
        this.connect('destroy', () =>
            St.ThemeContext.get_for_stage(global.get_stage()).disconnect(
                styleChangedSignalID,
            ),
        );

        this.layout_manager = new Clutter.BinLayout();

        const layoutManager = new MasonryLayoutManager(
            MASONRY_LAYOUT_SPACING,
            params.maxRowHeight,
            params.maxRowHeight,
        );
        this._container = new St.Viewport({
            reactive: true,
            x_expand: true,
            y_expand: true,
            layout_manager: layoutManager,
            // pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            // style: 'padding: 32px;',
        });
        const scrollView = new St.ScrollView({
            overlay_scrollbars: false,
            width: this.innerWidth,
            height: this.innerHeight,
        });
        // Create an St.Viewport to hold the scrollable content
        /* const viewport = new St.Viewport({
            style_class: 'scrollable-viewport',
        });
        viewport.add_child(this._container);*/
        // @ts-expect-error "add_actor is valid"
        scrollView.add_actor(this._container);
        this.add_child(scrollView);
        // this.add_child(this._container);
    }

    get container(): St.Widget {
        return this._container;
    }

    set blur(value: boolean) {
        if (this._blur === value) return;

        this._blur = value;
        // blur not supported due to GNOME shell known bug
        /* this.get_effect('blur')?.set_enabled(value);
        if (this._blur) this.add_style_class_name('blur-tile-preview');
        else this.remove_style_class_name('blur-tile-preview');

        this._recolor();*/
    }

    _init() {
        super._init();

        const effect = buildBlurEffect(48);
        effect.set_name('blur');
        effect.set_enabled(this._blur);
        this.add_effect(effect);

        this.add_style_class_name('selection-tile-preview');
    }

    _recolor() {
        this.set_style(null);

        const backgroundColor = this.get_theme_node()
            .get_background_color()
            .copy();
        // since an alpha value lower than 160 is not so much visible, enforce a minimum value of 160
        const newAlpha = Math.max(
            Math.min(backgroundColor.alpha + 35, 255),
            160,
        );
        // The final alpha value is divided by 255 since CSS needs a value from 0 to 1, but ClutterColor expresses alpha from 0 to 255
        this.set_style(`
            background-color: rgba(${backgroundColor.red}, ${backgroundColor.green}, ${backgroundColor.blue}, ${newAlpha / 255}) !important;
        `);
    }
}
