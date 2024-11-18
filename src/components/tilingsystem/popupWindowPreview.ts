import { registerGObjectClass } from '@utils/gjs';
import {
    GObject,
    Clutter,
    Shell,
    Meta,
    St,
    Graphene,
    Atk,
    Pango,
    GLib,
} from '@gi.ext';

const WINDOW_OVERLAY_FADE_TIME = 200;

const WINDOW_SCALE_TIME = 200;
const WINDOW_ACTIVE_SIZE_INC = 5; // in each direction

const ICON_SIZE = 36;
const ICON_OVERLAP = 0.7;

const ICON_TITLE_SPACING = 6;

/*
This class is heavily based on Gnome Shell's WindowPreview class
*/
@registerGObjectClass
export default class PopupWindowPreview extends Shell.WindowPreview {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'PopupWindowPreview',
    };

    private _overlayShown: boolean;
    private _icon: St.Widget;
    private _metaWindow: Meta.Window;
    private _windowActor: Meta.WindowActor;
    private _title: St.Label;

    constructor(metaWindow: Meta.Window) {
        super({
            reactive: true,
            can_focus: true,
            accessible_role: Atk.Role.PUSH_BUTTON,
            offscreen_redirect: Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY,
        });
        this._metaWindow = metaWindow;
        this._windowActor = metaWindow.get_compositor_private();

        const windowContainer = new Clutter.Actor({
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
        });
        this.window_container = windowContainer;

        windowContainer.connect('notify::scale-x', () =>
            this._adjustOverlayOffsets(),
        );
        // gjs currently can't handle setting an actors layout manager during
        // the initialization of the actor if that layout manager keeps track
        // of its container, so set the layout manager after creating the
        // container
        windowContainer.layout_manager = new Shell.WindowPreviewLayout();
        this.add_child(windowContainer);

        this._addWindow(metaWindow);

        this._stackAbove = null;

        this._windowActor.connectObject('destroy', () => this.destroy(), this);

        this._updateAttachedDialogs();

        this.connect('destroy', this._onDestroy.bind(this));

        // this._overlayEnabled = true;
        this._overlayShown = false;
        // this._idleHideOverlayId = 0;

        const tracker = Shell.WindowTracker.get_default();
        const app = tracker.get_window_app(this._metaWindow);
        this._icon = app.create_icon_texture(ICON_SIZE) as St.Widget;
        this._icon.add_style_class_name('window-icon');
        this._icon.add_style_class_name('icon-dropshadow');
        this._icon.set({
            reactive: true,
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
        });
        this._icon.add_constraint(
            new Clutter.BindConstraint({
                source: windowContainer,
                coordinate: Clutter.BindCoordinate.POSITION,
            }),
        );
        this._icon.add_constraint(
            new Clutter.AlignConstraint({
                source: windowContainer,
                align_axis: Clutter.AlignAxis.X_AXIS,
                factor: 0.5,
            }),
        );
        this._icon.add_constraint(
            new Clutter.AlignConstraint({
                source: windowContainer,
                align_axis: Clutter.AlignAxis.Y_AXIS,
                pivot_point: new Graphene.Point({ x: -1, y: ICON_OVERLAP }),
                factor: 1,
            }),
        );

        const { scaleFactor } = St.ThemeContext.get_for_stage(
            global.stage as Clutter.Stage,
        );
        this._title = new St.Label({
            visible: false,
            style_class: 'window-caption',
            text: this._getCaption(),
            reactive: true,
        });
        this._title.clutter_text.single_line_mode = true;
        this._title.add_constraint(
            new Clutter.BindConstraint({
                source: windowContainer,
                coordinate: Clutter.BindCoordinate.X,
            }),
        );
        const iconBottomOverlap = ICON_SIZE * (1 - ICON_OVERLAP);
        this._title.add_constraint(
            new Clutter.BindConstraint({
                source: windowContainer,
                coordinate: Clutter.BindCoordinate.Y,
                offset: scaleFactor * (iconBottomOverlap + ICON_TITLE_SPACING),
            }),
        );
        this._title.add_constraint(
            new Clutter.AlignConstraint({
                source: windowContainer,
                align_axis: Clutter.AlignAxis.X_AXIS,
                factor: 0.5,
            }),
        );
        this._title.add_constraint(
            new Clutter.AlignConstraint({
                source: windowContainer,
                align_axis: Clutter.AlignAxis.Y_AXIS,
                pivot_point: new Graphene.Point({ x: -1, y: 0 }),
                factor: 1,
            }),
        );
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.label_actor = this._title;
        this._metaWindow.connectObject(
            'notify::title',
            () => (this._title.text = this._getCaption()),
            this,
        );

        this.add_child(this._title);
        this.add_child(this._icon);

        this.connect('notify::realized', () => {
            if (!this.realized) return;

            this._title.ensure_style();
            this._icon.ensure_style();
        });
    }

    _getCaption() {
        if (this._metaWindow.title) return this._metaWindow.title;

        const tracker = Shell.WindowTracker.get_default();
        const app = tracker.get_window_app(this._metaWindow);
        return app.get_name();
    }

    showOverlay(animate: boolean) {
        // if (!this._overlayEnabled) return;

        if (this._overlayShown) return;

        this._overlayShown = true;
        this._restack();

        // If we're supposed to animate and an animation in our direction
        // is already happening, let that one continue
        const ongoingTransition = this._title.get_transition('opacity');
        if (
            animate &&
            ongoingTransition &&
            ongoingTransition.get_interval().peek_final_value() === 255
        )
            return;

        [this._title].forEach((a) => {
            a.opacity = 0;
            a.show();
            a.ease({
                opacity: 255,
                duration: animate ? WINDOW_OVERLAY_FADE_TIME : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });

        const [width, height] = this.window_container.get_size();
        const { scaleFactor } = St.ThemeContext.get_for_stage(
            global.stage as Clutter.Stage,
        );
        const activeExtraSize = WINDOW_ACTIVE_SIZE_INC * 2 * scaleFactor;
        const origSize = Math.max(width, height);
        const scale = (origSize + activeExtraSize) / origSize;

        this.window_container.ease({
            scaleX: scale,
            scaleY: scale,
            duration: animate ? WINDOW_SCALE_TIME : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    hideOverlay(animate: boolean) {
        if (!this._overlayShown) return;

        this._overlayShown = false;
        this._restack();

        // If we're supposed to animate and an animation in our direction
        // is already happening, let that one continue
        const ongoingTransition = this._title.get_transition('opacity');
        if (
            animate &&
            ongoingTransition &&
            ongoingTransition.get_interval().peek_final_value() === 0
        )
            return;

        [this._title].forEach((a) => {
            a.opacity = 255;
            a.ease({
                opacity: 0,
                duration: animate ? WINDOW_OVERLAY_FADE_TIME : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => a.hide(),
            });
        });

        this.window_container.ease({
            scaleX: 1,
            scaleY: 1,
            duration: animate ? WINDOW_SCALE_TIME : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _adjustOverlayOffsets() {
        // Assume that scale-x and scale-y update always set
        // in lock-step; that allows us to not use separate
        // handlers for horizontal and vertical offsets
        const previewScale = this.window_container.scale_x;
        const [previewWidth, previewHeight] =
            this.window_container.allocation.get_size();

        const heightIncrease = Math.floor(
            (previewHeight * (previewScale - 1)) / 2,
        );

        this._icon.translation_y = heightIncrease;
        this._title.translation_y = heightIncrease;
    }

    _addWindow(metaWindow: Meta.Window) {
        const clone =
            this.window_container.layout_manager.add_window(metaWindow);
        // if (!clone) return;

        /* // We expect this to be used for all interaction rather than
        // the ClutterClone; as the former is reactive and the latter
        // is not, this just works for most cases. However, for DND all
        // actors are picked, so DND operations would operate on the clone.
        // To avoid this, we hide it from pick.
        Shell.util_set_hidden_from_pick(clone, true);*/
    }

    vfunc_has_overlaps() {
        return this._hasAttachedDialogs() || this._icon.visible;
    }

    addDialog(win: Meta.Window) {
        let parent = win.get_transient_for();
        while (parent && parent.is_attached_dialog())
            parent = parent.get_transient_for();

        // Display dialog if it is attached to our metaWindow
        if (win.is_attached_dialog() && parent === this._metaWindow)
            this._addWindow(win);
    }

    _hasAttachedDialogs() {
        return this.window_container.layout_manager.get_windows().length > 1;
    }

    _updateAttachedDialogs() {
        const iter = (win) => {
            const actor = win.get_compositor_private();

            if (!actor) return false;
            if (!win.is_attached_dialog()) return false;

            this._addWindow(win);
            win.foreach_transient(iter);
            return true;
        };
        this._metaWindow.foreach_transient(iter);
    }

    /* get overlayEnabled() {
        return this._overlayEnabled;
    }

    set overlayEnabled(enabled) {
        if (this._overlayEnabled === enabled) return;

        this._overlayEnabled = enabled;
        this.notify('overlay-enabled');

        if (!enabled) this.hideOverlay(false);
        else if (this['has-pointer'] || global.stage.key_focus === this)
            this.showOverlay(true);
    }*/

    // Find the actor just below us, respecting reparenting done by DND code
    _getActualStackAbove() {
        if (this._stackAbove == null) return null;

        return this._stackAbove;
    }

    setStackAbove(actor) {
        this._stackAbove = actor;

        const parent = this.get_parent();
        const actualAbove = this._getActualStackAbove();
        if (actualAbove == null) parent.set_child_below_sibling(this, null);
        else parent.set_child_above_sibling(this, actualAbove);
    }

    _onDestroy() {
        this._destroyed = true;

        if (this._idleHideOverlayId > 0) {
            GLib.source_remove(this._idleHideOverlayId);
            this._idleHideOverlayId = 0;
        }
    }

    vfunc_enter_event(event) {
        this.showOverlay(true);
        return super.vfunc_enter_event(event);
    }

    vfunc_leave_event(event) {
        if (this._destroyed) return super.vfunc_leave_event(event);

        /* if ((event.get_flags() & Clutter.EventFlags.FLAG_GRAB_NOTIFY) !== 0 &&
            global.stage.get_grab_actor() === this._closeButton)
            return super.vfunc_leave_event(event);*/

        if (!this['has-pointer']) this.hideOverlay(true);
        /* if (this._idleHideOverlayId > 0)
            GLib.source_remove(this._idleHideOverlayId);

        this._idleHideOverlayId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            WINDOW_OVERLAY_IDLE_HIDE_TIMEOUT, () => {
                if (!this['has-pointer'])
                    this.hideOverlay(true);

                this._idleHideOverlayId = 0;
                return GLib.SOURCE_REMOVE;
            });

        GLib.Source.set_name_by_id(this._idleHideOverlayId, '[gnome-shell] this._idleHideOverlayId');*/

        return super.vfunc_leave_event(event);
    }

    vfunc_key_focus_in() {
        super.vfunc_key_focus_in();
        this.showOverlay(true);
    }

    vfunc_key_focus_out() {
        super.vfunc_key_focus_out();

        this.hideOverlay(true);
    }

    _restack() {
        // We may not have a parent if DnD completed successfully, in
        // which case our clone will shortly be destroyed and replaced
        // with a new one on the target workspace.
        const parent = this.get_parent();
        if (parent !== null) {
            if (this._overlayShown) parent.set_child_above_sibling(this, null);
            else if (this._stackAbove === null)
                parent.set_child_below_sibling(this, null);
            else if (!this._stackAbove._overlayShown)
                parent.set_child_above_sibling(this, this._stackAbove);
        }
    }
}
