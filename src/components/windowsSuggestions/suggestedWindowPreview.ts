import { registerGObjectClass } from '../../utils/gjs';
import {
    Clutter,
    Shell,
    Meta,
    St,
    Graphene,
    Atk,
    Pango,
    GLib,
} from '../../gi/ext';

const WINDOW_OVERLAY_FADE_TIME = 200;

const WINDOW_SCALE_TIME = 200;
const WINDOW_ACTIVE_SIZE_INC = 5; // in each direction

const ICON_SIZE = 36;
const ICON_OVERLAP = 0.7;

/*
This class is heavily based on Gnome Shell's WindowPreview class
*/
export default class SuggestedWindowPreview extends Shell.WindowPreview {
    static { registerGObjectClass(this, {
        GTypeName: 'PopupWindowPreview',
    })};

    private _overlayShown: boolean;
    private _icon: St.Widget;
    private _metaWindow: Meta.Window;
    private _windowActor: Meta.WindowActor;
    private _title: St.Label;
    private _previewContainer: St.Widget;
    private _stackAbove: Clutter.Actor | null;
    private _destroyed: boolean;
    private _idleHideOverlayId: number;

    constructor(metaWindow: Meta.Window) {
        super({
            reactive: true,
            can_focus: true,
            accessible_role: Atk.Role.PUSH_BUTTON,
            offscreen_redirect: Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY,
            windowContainer: new Clutter.Actor({
                pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            }),
        });
        this._metaWindow = metaWindow;
        this._windowActor = metaWindow.get_compositor_private();
        this._destroyed = false;
        this._idleHideOverlayId = 0;

        this._previewContainer = new St.Widget({
            style_class: 'popup-window-preview-container',
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            layoutManager: new Clutter.BinLayout(),
            xAlign: Clutter.ActorAlign.CENTER,
        });

        // gjs currently can't handle setting an actors layout manager during
        // the initialization of the actor if that layout manager keeps track
        // of its container, so set the layout manager after creating the
        // container
        this.windowContainer.layout_manager = new Shell.WindowPreviewLayout();
        this.add_child(this._previewContainer);
        this._previewContainer.add_child(this.windowContainer);

        this._addWindow(metaWindow);

        this._stackAbove = null;

        this._windowActor.connectObject('destroy', () => this.destroy(), this);

        this._updateAttachedDialogs();

        this.connect('destroy', this._onDestroy.bind(this));

        this._overlayShown = false;

        const tracker = Shell.WindowTracker.get_default();
        const app = tracker.get_window_app(this._metaWindow);
        this._icon = app.create_icon_texture(ICON_SIZE) as St.Widget;
        this._icon.add_style_class_name('window-icon');
        this._icon.add_style_class_name('icon-dropshadow');
        this._icon.set({
            reactive: false,
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
        });
        this._icon.add_constraint(
            new Clutter.BindConstraint({
                source: this._previewContainer,
                coordinate: Clutter.BindCoordinate.POSITION,
            }),
        );
        this._icon.add_constraint(
            new Clutter.AlignConstraint({
                source: this._previewContainer,
                align_axis: Clutter.AlignAxis.X_AXIS,
                factor: 0.5,
            }),
        );
        this._icon.add_constraint(
            new Clutter.AlignConstraint({
                source: this._previewContainer,
                align_axis: Clutter.AlignAxis.Y_AXIS,
                pivot_point: new Graphene.Point({ x: -1, y: ICON_OVERLAP }),
                factor: 1,
            }),
        );

        this._title = new St.Label({
            visible: false,
            style_class: 'window-caption',
            text: this._getCaption(),
            reactive: false,
        });
        this._title.clutter_text.single_line_mode = true;
        this._title.add_constraint(
            new Clutter.AlignConstraint({
                source: this._previewContainer,
                align_axis: Clutter.AlignAxis.X_AXIS,
                factor: 0, // Center horizontally
            }),
        );
        this._title.add_constraint(
            new Clutter.AlignConstraint({
                source: this._previewContainer,
                align_axis: Clutter.AlignAxis.Y_AXIS,
                factor: 0, // Center vertically
                pivot_point: new Graphene.Point({ x: -1, y: 0 }),
            }),
        );
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.label_actor = this._title;
        this._metaWindow.connectObject(
            'notify::title',
            () => (this._title.text = this._getCaption()),
            this,
        );

        this._previewContainer.add_child(this._title);
        this._previewContainer.add_child(this._icon);

        this.connect('notify::realized', () => {
            if (!this.realized) return;

            this._title.ensure_style();
            this._icon.ensure_style();
        });
    }

    public get_window_clone(): Clutter.Actor | undefined {
        return this.windowContainer;
    }

    private _getCaption() {
        if (this._metaWindow.title) return this._metaWindow.title;

        const tracker = Shell.WindowTracker.get_default();
        const app = tracker.get_window_app(this._metaWindow);
        return app.get_name();
    }

    public showOverlay(animate: boolean) {
        if (this._overlayShown) return;

        this._overlayShown = true;

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

        const [width, height] = this.windowContainer.get_size();
        const { scaleFactor } = St.ThemeContext.get_for_stage(
            global.stage as Clutter.Stage,
        );
        const activeExtraSize = WINDOW_ACTIVE_SIZE_INC * 2 * scaleFactor;
        const origSize = Math.max(width, height);
        const scale = (origSize + activeExtraSize) / origSize;

        this._previewContainer.ease({
            scaleX: scale,
            scaleY: scale,
            duration: animate ? WINDOW_SCALE_TIME : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    hideOverlay(animate: boolean) {
        if (!this._overlayShown) return;

        this._overlayShown = false;

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

        this._previewContainer.ease({
            scaleX: 1,
            scaleY: 1,
            duration: animate ? WINDOW_SCALE_TIME : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _addWindow(metaWindow: Meta.Window) {
        this.clone = this.windowContainer.layout_manager.add_window(metaWindow);
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
        return this.windowContainer.layout_manager.get_windows().length > 1;
    }

    _updateAttachedDialogs() {
        const iter = (win: Meta.Window) => {
            const actor = win.get_compositor_private();

            if (!actor) return false;
            if (!win.is_attached_dialog()) return false;

            this._addWindow(win);
            win.foreach_transient(iter);
            return true;
        };
        this._metaWindow.foreach_transient(iter);
    }

    // Find the actor just below us, respecting reparenting done by DND code
    _getActualStackAbove() {
        if (this._stackAbove === null) return null;

        return this._stackAbove;
    }

    setStackAbove(actor: Clutter.Actor | null) {
        this._stackAbove = actor;

        const parent = this.get_parent();
        const actualAbove = this._getActualStackAbove();
        if (actualAbove === null) parent?.set_child_below_sibling(this, null);
        else parent?.set_child_above_sibling(this, actualAbove);
    }

    _onDestroy() {
        this._destroyed = true;

        if (this._idleHideOverlayId > 0) {
            GLib.source_remove(this._idleHideOverlayId);
            this._idleHideOverlayId = 0;
        }
    }

    vfunc_enter_event(event: Clutter.Event) {
        this.showOverlay(true);
        return super.vfunc_enter_event(event);
    }

    vfunc_leave_event(event: Clutter.Event) {
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
}
