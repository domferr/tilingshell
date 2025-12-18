import { GObject, Meta, St, Clutter, Shell, Gio, GLib } from '../../gi/ext';
import SignalHandling from '../../utils/signalHandling';
import { registerGObjectClass } from '../../utils/gjs';
import Settings from '../../settings/settings';
import {
    buildRectangle,
    enableScalingFactorSupport,
    getMonitorScalingFactor,
    getScalingFactorOf,
    getScalingFactorSupportString,
} from '../../utils/ui';
import { CustomRulesManager } from './customRulesManager';
import { BlacklistManager } from './blacklistManager';

Gio._promisify(Shell.Screenshot, 'composite_to_stream');

const DEFAULT_BORDER_RADIUS = 11;
const SMART_BORDER_RADIUS_FIRST_FRAME_DELAY = 240;

interface WindowWithCachedRadius extends Meta.Window {
    __ts_cached_radius: [number, number, number, number] | undefined;
}

export default class WindowBorder extends St.DrawingArea {
    static { registerGObjectClass(this) }

    private readonly _signals: SignalHandling;

    private _window: Meta.Window;
    private _windowMonitor: number;
    private _bindings: GObject.Binding[];
    private _enableScaling: boolean;
    private _borderRadiusValue: [number, number, number, number];
    private _timeout: GLib.Source | undefined;
    private _delayedSmartBorderRadius: boolean;
    private _borderWidth: number;

    constructor(win: Meta.Window, enableScaling: boolean) {
        super({
            style_class: 'window-border'
        });
        this._signals = new SignalHandling();
        this._bindings = [];
        this._borderWidth = 1;
        this._window = win;
        this._windowMonitor = win.get_monitor();
        this._enableScaling = enableScaling;
        this._delayedSmartBorderRadius = false;
        const smartRadius = Settings.ENABLE_SMART_WINDOW_BORDER_RADIUS;
        this._borderRadiusValue = [
            DEFAULT_BORDER_RADIUS,
            DEFAULT_BORDER_RADIUS,
            smartRadius ? 0 : DEFAULT_BORDER_RADIUS,
            smartRadius ? 0 : DEFAULT_BORDER_RADIUS,
        ]; // default value

        this.close();
        global.windowGroup.add_child(this);
        this.trackWindow(win, true);

        this.connect('destroy', () => {
            this._bindings.forEach((b) => b.unbind());
            this._bindings = [];
            this._signals.disconnect();
            if (this._timeout) clearTimeout(this._timeout);
            this._timeout = undefined;
        });
    }

    public trackWindow(win: Meta.Window, force: boolean = false) {
        if (!force && this._window === win) return;

        this._bindings.forEach((b) => b.unbind());
        this._bindings = [];
        this._signals.disconnect();
        this._window = win;
        this.close();
        const winActor =
            this._window.get_compositor_private() as Meta.WindowActor;

        // scale and translate like the window actor
        this._bindings = [
            'scale-x',
            'scale-y',
            'translation_x',
            'translation_y',
        ].map((prop) =>
            winActor.bind_property(
                prop,
                this,
                prop,
                GObject.BindingFlags.DEFAULT, // if winActor changes, this will change
            ),
        );

        const winRect = this._window.get_frame_rect();
        this.set_position(
            winRect.x - this._borderWidth,
            winRect.y - this._borderWidth,
        );
        this.set_size(
            winRect.width + 2 * this._borderWidth,
            winRect.height + 2 * this._borderWidth,
        );

        if (Settings.ENABLE_SMART_WINDOW_BORDER_RADIUS) {
            const cached_radius = (this._window as WindowWithCachedRadius)
                .__ts_cached_radius;
            if (cached_radius) {
                this._borderRadiusValue[St.Corner.TOPLEFT] =
                    cached_radius[St.Corner.TOPLEFT];
                this._borderRadiusValue[St.Corner.TOPRIGHT] =
                    cached_radius[St.Corner.TOPRIGHT];
                this._borderRadiusValue[St.Corner.BOTTOMLEFT] =
                    cached_radius[St.Corner.BOTTOMLEFT];
                this._borderRadiusValue[St.Corner.BOTTOMRIGHT] =
                    cached_radius[St.Corner.BOTTOMRIGHT];
            }
        }
        this.updateStyle();

        const isMaximized =
            this._window.maximizedVertically &&
            this._window.maximizedHorizontally;
        if (
            this._window.is_fullscreen() ||
            isMaximized ||
            this._window.minimized ||
            !winActor.visible
        )
            this.close();
        else this.open();

        this._signals.connect(global.display, 'restacked', () => {
            this.queue_repaint(); // a transient window might have been opened
        });

        this._signals.connect(this._window, 'position-changed', () => {
            if (
                this._window.maximizedVertically ||
                this._window.maximizedHorizontally ||
                this._window.minimized ||
                this._window.is_fullscreen()
            ) {
                this.remove_all_transitions();
                this.close();
                return;
            }

            if (
                this._delayedSmartBorderRadius &&
                Settings.ENABLE_SMART_WINDOW_BORDER_RADIUS
            ) {
                this._delayedSmartBorderRadius = false;
                this._runComputeBorderRadiusTimeout(winActor);
            }

            const rect = this._window.get_frame_rect();
            this.set_position(
                rect.x - this._borderWidth,
                rect.y - this._borderWidth,
            );
            // if the window changes monitor, we may have a different scaling factor
            if (this._windowMonitor !== win.get_monitor()) {
                this._windowMonitor = win.get_monitor();
                this.updateStyle();
            }
            this.open();
        });

        this._signals.connect(this._window, 'size-changed', () => {
            if (
                this._window.maximizedVertically ||
                this._window.maximizedHorizontally ||
                this._window.minimized ||
                this._window.is_fullscreen()
            ) {
                this.remove_all_transitions();
                this.close();
                return;
            }

            if (
                this._delayedSmartBorderRadius &&
                Settings.ENABLE_SMART_WINDOW_BORDER_RADIUS
            ) {
                this._delayedSmartBorderRadius = false;
                this._runComputeBorderRadiusTimeout(winActor);
            }

            const rect = this._window.get_frame_rect();
            this.set_size(
                rect.width + 2 * this._borderWidth,
                rect.height + 2 * this._borderWidth,
            );
            // if the window changes monitor, we may have a different scaling factor
            if (this._windowMonitor !== win.get_monitor()) {
                this._windowMonitor = win.get_monitor();
                this.updateStyle();
            }
            this.open();
        });

        if (Settings.ENABLE_SMART_WINDOW_BORDER_RADIUS) {
            const firstFrameId = winActor.connect_after('first-frame', () => {
                if (
                    this._window.maximizedHorizontally ||
                    this._window.maximizedVertically ||
                    this._window.is_fullscreen()
                ) {
                    this._delayedSmartBorderRadius = true;
                    return;
                }
                this._runComputeBorderRadiusTimeout(winActor);

                winActor.disconnect(firstFrameId);
            });
        }
    }

    private _runComputeBorderRadiusTimeout(winActor: Meta.WindowActor) {
        if (this._timeout) clearTimeout(this._timeout);
        this._timeout = undefined;

        this._timeout = setTimeout(() => {
            this._computeBorderRadius(winActor).then(() => this.updateStyle());
            if (this._timeout) clearTimeout(this._timeout);
            this._timeout = undefined;
        }, SMART_BORDER_RADIUS_FIRST_FRAME_DELAY);
    }

    private async _computeBorderRadius(winActor: Meta.WindowActor) {
        // we are only interested into analyze the leftmost pixels (i.e. the whole left border)
        const width = 3;
        const height = winActor.metaWindow.get_frame_rect().height;
        if (height <= 0) return;
        const content = winActor.paint_to_content(
            buildRectangle({
                x: winActor.metaWindow.get_frame_rect().x,
                y: winActor.metaWindow.get_frame_rect().y,
                height,
                width,
            }),
        );
        if (!content) return;

        /* for debugging purposes
        const elem = new St.Widget({
            x: 100,
            y: 100,
            width,
            height,
            content,
            name: 'elem',
        });
        global.windowGroup
            .get_children()
            .find((el) => el.get_name() === 'elem')
            ?.destroy();
        global.windowGroup.add_child(elem);*/
        // @ts-expect-error "content has get_texture() method"
        const texture = content.get_texture();
        const stream = Gio.MemoryOutputStream.new_resizable();
        const x = 0;
        const y = 0;
        const pixbuf = await Shell.Screenshot.composite_to_stream(
            texture,
            x,
            y,
            width,
            height,
            1,
            null,
            0,
            0,
            1,
            stream,
        );
        // @ts-expect-error "pixbuf has get_pixels() method"
        const pixels = pixbuf.get_pixels();

        const alphaThreshold = 240; // 255 would be the best value, however, some windows may still have a bit of transparency
        // iterate pixels from top to bottom
        for (let i = 0; i < height; i++) {
            if (pixels[i * width * 4 + 3] > alphaThreshold) {
                this._borderRadiusValue[St.Corner.TOPLEFT] = i;
                this._borderRadiusValue[St.Corner.TOPRIGHT] =
                    this._borderRadiusValue[St.Corner.TOPLEFT];
                break;
            }
        }
        // iterate pixels from bottom to top
        for (let i = height - 1; i >= height - this._borderRadiusValue[St.Corner.TOPLEFT] - 2; i--) {
            if (pixels[i * width * 4 + 3] > alphaThreshold) {
                this._borderRadiusValue[St.Corner.BOTTOMLEFT] = height - i - 1;
                this._borderRadiusValue[St.Corner.BOTTOMRIGHT] =
                    this._borderRadiusValue[St.Corner.BOTTOMLEFT];
                break;
            }
        }
        stream.close(null);

        const cached_radius: [number, number, number, number] = [
            DEFAULT_BORDER_RADIUS,
            DEFAULT_BORDER_RADIUS,
            0,
            0,
        ];
        cached_radius[St.Corner.TOPLEFT] =
            this._borderRadiusValue[St.Corner.TOPLEFT];
        cached_radius[St.Corner.TOPRIGHT] =
            this._borderRadiusValue[St.Corner.TOPRIGHT];
        cached_radius[St.Corner.BOTTOMLEFT] =
            this._borderRadiusValue[St.Corner.BOTTOMLEFT];
        cached_radius[St.Corner.BOTTOMRIGHT] =
            this._borderRadiusValue[St.Corner.BOTTOMRIGHT];
        (this._window as WindowWithCachedRadius).__ts_cached_radius =
            cached_radius;
    }

    public updateStyle(): void {
        // handle scale factor of the monitor
        const monitorScalingFactor = this._enableScaling
            ? getMonitorScalingFactor(this._window.get_monitor())
            : undefined;
        // CAUTION: this overrides the CSS style
        enableScalingFactorSupport(this, monitorScalingFactor);

        const [alreadyScaled, scalingFactor] = getScalingFactorOf(this);
        // the value is already scaled if the border is on primary monitor
        const borderWidth =
            (alreadyScaled ? 1 : scalingFactor) *
            (Settings.WINDOW_BORDER_WIDTH /
                (alreadyScaled ? scalingFactor : 1));
        const borderColor = Settings.WINDOW_USE_CUSTOM_BORDER_COLOR
            ? Settings.WINDOW_BORDER_COLOR
            : '-st-accent-color';
        const radius = this._borderRadiusValue.map((val) => {
            const valWithBorder = val === 0 ? val : val + borderWidth;
            return (
                (alreadyScaled ? 1 : scalingFactor) *
                (valWithBorder / (alreadyScaled ? scalingFactor : 1))
            );
        });

        const scalingFactorSupportString = monitorScalingFactor
            ? `${getScalingFactorSupportString(monitorScalingFactor)};`
            : '';

        if (this._borderWidth !== borderWidth) {
            const diff = this._borderWidth - borderWidth;
            this._borderWidth = borderWidth;
            this.set_size(
                this.get_width() - 2 * diff,
                this.get_height() - 2 * diff,
            );
            this.set_position(this.get_x() + diff, this.get_y() + diff);
        }
        this.set_style(
            `border-color: ${borderColor}; border-radius: ${radius[St.Corner.TOPLEFT]}px ${radius[St.Corner.TOPRIGHT]}px ${radius[St.Corner.BOTTOMRIGHT]}px ${radius[St.Corner.BOTTOMLEFT]}px; ${scalingFactorSupportString}`,
        );
        // not setting border-width: ${borderWidth}px since we will use this._borderWidth in vfunc_repaint
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const themeNode = this.get_theme_node();
        const [width, height] = this.get_surface_size();
        if (!width || !height) return;

        const borderWidth = this._borderWidth;
        const borderColor = themeNode.get_border_color(null);
        const radius = [0, 0, 0, 0];
        radius[St.Corner.TOPLEFT] = themeNode.get_border_radius(St.Corner.TOPLEFT);
        radius[St.Corner.TOPRIGHT] = themeNode.get_border_radius(St.Corner.TOPRIGHT);
        radius[St.Corner.BOTTOMLEFT] = themeNode.get_border_radius(St.Corner.BOTTOMLEFT);
        radius[St.Corner.BOTTOMRIGHT] = themeNode.get_border_radius(St.Corner.BOTTOMRIGHT);

        const x = borderWidth / 2;
        const y = borderWidth / 2;
        const w = width - borderWidth;
        const h = height - borderWidth;

        cr.setSourceRGBA(borderColor.red/255, borderColor.green/255, borderColor.blue/255, borderColor.alpha/255);
        cr.setLineWidth(borderWidth);

        cr.newPath();

        cr.arc(x + radius[St.Corner.TOPLEFT], y + radius[St.Corner.TOPLEFT], radius[St.Corner.TOPLEFT], Math.PI, Math.PI * 1.5);
        cr.lineTo(x + w - radius[St.Corner.TOPRIGHT], y);
        cr.arc(x + w - radius[St.Corner.TOPRIGHT], y + radius[St.Corner.TOPRIGHT], radius[St.Corner.TOPRIGHT], Math.PI * 1.5, 0);
        cr.lineTo(x + w, y + h - radius[St.Corner.BOTTOMRIGHT]);
        cr.arc(x + w - radius[St.Corner.BOTTOMRIGHT], y + h - radius[St.Corner.BOTTOMRIGHT], radius[St.Corner.BOTTOMRIGHT], 0, Math.PI * 0.5);
        cr.lineTo(x + radius[St.Corner.BOTTOMLEFT], y + h);
        cr.arc(x + radius[St.Corner.BOTTOMLEFT], y + h - radius[St.Corner.BOTTOMLEFT], radius[St.Corner.BOTTOMLEFT], Math.PI * 0.5, Math.PI);
        cr.closePath();
        cr.stroke();

        /* For debugging purposes, uncomment this line to draw a rectangle around transient window */
        /*const winRect = this._window.get_frame_rect();
        // Iterate over transient windows
        this._window.foreach_transient((_transient: Meta.Window) => {
            const transientRect = _transient.get_frame_rect();

            // Compute rectangle position relative to the main window
            const transientX = transientRect.x - winRect.x + borderWidth;
            const transientY = transientRect.y - winRect.y + borderWidth;
            const transientWidth = transientRect.width;
            const transientHeight = transientRect.height;

            // Draw the rectangle
            cr.setSourceRGBA(1, 0, 0, 1); // Example: red color
            cr.setLineWidth(2);            // Example line width
            cr.rectangle(transientX, transientY, transientWidth, transientHeight);
            cr.stroke();

            console.log("Drawing rectangle for transient window at", transientX, transientY, transientWidth, transientHeight);

            return true;
        });*/
        cr.save();
        const winRect = this._window.get_frame_rect();
        // Iterate over transient windows
        this._window.foreach_transient((_transient: Meta.Window) => {
            const transientRect = _transient.get_frame_rect();

            // Compute rectangle position relative to the main window
            const transientX = transientRect.x - winRect.x + borderWidth;
            const transientY = transientRect.y - winRect.y + borderWidth;
            const transientWidth = transientRect.width;
            const transientHeight = transientRect.height;

            // Clip with this rectangle
            cr.rectangle(transientX, transientY, transientWidth, transientHeight);

            return true; // true to continue
        });
        cr.clip();

        // Set operator to clear pixels inside clipping region
        cr.setOperator(0); // Cairo.Operator.CLEAR
        cr.paint();
        cr.restore(); // restore original clipping & operator

        cr.$dispose();
    }

    public open() {
        if (this.visible) return;

        this.show();
        this.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE,
            delay: 130,
        });
    }

    public close() {
        this.set_opacity(0);
        this.hide();
    }
}
