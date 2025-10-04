import { registerGObjectClass } from '@/utils/gjs';
import { GObject, St, Clutter, Mtk } from '@gi.ext';
import TilePreview from '../tilepreview/tilePreview';
import { buildBlurEffect, widgetOrientation } from '@utils/gnomesupport';
import Tile from '@components/layout/Tile';
import MasonryLayoutManager from './masonryLayoutManager';

const MASONRY_LAYOUT_SPACING = 32;
const SCROLLBARS_SHOW_ANIM_DURATION = 100; // ms

@registerGObjectClass
export default class SuggestionsTilePreview extends TilePreview {
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
    private _container: St.BoxLayout;
    private _scrollView: St.ScrollView;

    constructor(params: {
        parent: Clutter.Actor;
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

        this.reactive = true;
        this.layout_manager = new Clutter.BinLayout();

        this._container = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: `spacing: ${MASONRY_LAYOUT_SPACING}px;`,
            ...widgetOrientation(true),
        });
        this._scrollView = new St.ScrollView({
            style_class: 'vfade',
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            hscrollbar_policy: St.PolicyType.NEVER,
            overlay_scrollbars: true,
            clip_to_allocation: true, // Ensure clipping
            x_expand: true,
            y_expand: true,
        });

        // @ts-expect-error "add_actor is valid"
        if (this._scrollView.add_actor)
            // @ts-expect-error "add_actor is valid"
            this._scrollView.add_actor(this._container);
        else this._scrollView.add_child(this._container);
        this.add_child(this._scrollView);

        // From GNOME 48 we don't have get_hscroll_bar() anymore
        if (
            // @ts-expect-error "get_hscroll_bar is valid for GNOME < 48"
            this._scrollView.get_hscroll_bar &&
            // @ts-expect-error "get_vscroll_bar is valid for GNOME < 48"
            this._scrollView.get_vscroll_bar
        ) {
            // @ts-expect-error "get_hscroll_bar is valid for GNOME < 48"
            this._scrollView.get_hscroll_bar().opacity = 0;
            // @ts-expect-error "get_vscroll_bar is valid for GNOME < 48"
            this._scrollView.get_vscroll_bar().opacity = 0;
        }
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

    public override set gaps(newGaps: Clutter.Margin) {
        super.gaps = newGaps;
        this.updateBorderRadius(
            this._gaps.top > 0,
            this._gaps.right > 0,
            this._gaps.bottom > 0,
            this._gaps.left > 0,
        );
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

    private _showScrollBars(): void {
        if (
            // @ts-expect-error "get_hscroll_bar is valid for GNOME < 48"
            this._scrollView.get_hscroll_bar &&
            // @ts-expect-error "get_vscroll_bar is valid for GNOME < 48"
            this._scrollView.get_vscroll_bar
        ) {
            [
                // @ts-expect-error "get_hscroll_bar is valid for GNOME < 48"
                this._scrollView.get_hscroll_bar(),
                // @ts-expect-error "get_vscroll_bar is valid for GNOME < 48"
                this._scrollView.get_vscroll_bar(),
            ].forEach((bar) =>
                bar?.ease({
                    opacity: 255,
                    duration: SCROLLBARS_SHOW_ANIM_DURATION,
                }),
            );
        }
    }

    private _hideScrollBars(): void {
        if (
            // @ts-expect-error "get_hscroll_bar is valid for GNOME < 48"
            this._scrollView.get_hscroll_bar &&
            // @ts-expect-error "get_vscroll_bar is valid for GNOME < 48"
            this._scrollView.get_vscroll_bar
        ) {
            [
                // @ts-expect-error "get_hscroll_bar is valid for GNOME < 48"
                this._scrollView.get_hscroll_bar(),
                // @ts-expect-error "get_vscroll_bar is valid for GNOME < 48"
                this._scrollView.get_vscroll_bar(),
            ].forEach((bar) =>
                bar?.ease({
                    opacity: 0,
                    duration: SCROLLBARS_SHOW_ANIM_DURATION,
                }),
            );
        }
    }

    vfunc_enter_event(event: Clutter.Event) {
        this._showScrollBars();
        return super.vfunc_enter_event(event);
    }

    vfunc_leave_event(event: Clutter.Event) {
        this._hideScrollBars();
        return super.vfunc_leave_event(event);
    }

    public addWindows(windows: Clutter.Actor[], maxRowHeight: number) {
        // little trick: we hide the container and add all the windows
        // then we queue_relayout and we can compute the sizes of the windows
        // to compute placements and scale them preserving aspect ratio
        this._container.hide();
        // empty out the container
        this._container.destroy_all_children();
        windows.forEach((actor) => this._container.add_child(actor));
        this._container.queue_relayout();
        const placements = MasonryLayoutManager.computePlacements(
            windows,
            this.innerWidth - 2 * MASONRY_LAYOUT_SPACING,
            this.innerHeight,
            maxRowHeight,
        );
        // we remove all the windows and show back the container
        this._container.remove_all_children();
        this._container.show();

        // add top space
        this._container.add_child(
            new St.Widget({ height: MASONRY_LAYOUT_SPACING }),
        );
        // add each row
        placements.forEach((row) => {
            const rowBox = new St.BoxLayout({
                x_align: Clutter.ActorAlign.CENTER,
                style: `spacing: ${MASONRY_LAYOUT_SPACING}px;`,
            });
            this._container.add_child(rowBox);
            row.forEach((pl) => {
                rowBox.add_child(pl.actor);
                pl.actor.set_height(pl.height);
                pl.actor.set_width(pl.width);
            });
        });
        // add bottom space
        this._container.add_child(
            new St.Widget({ height: MASONRY_LAYOUT_SPACING }),
        );
    }

    public removeAllWindows() {
        this._container.destroy_all_children();
    }
}
