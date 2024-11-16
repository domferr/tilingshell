import { GObject, Meta, St, Clutter, Shell, Gio, GLib } from '@gi.ext';
import SignalHandling from '@utils/signalHandling';
import { logger } from '@utils/logger';
import { registerGObjectClass } from '@utils/gjs';
import Settings from '@settings/settings';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    buildRectangle,
    enableScalingFactorSupport,
    getMonitorScalingFactor,
    getScalingFactorOf,
    getScalingFactorSupportString,
} from '@utils/ui';

Gio._promisify(Shell.Screenshot, 'composite_to_stream');

const DEFAULT_BORDER_RADIUS = 11;
const SMART_BORDER_RADIUS_DELAY = 460;
const SMART_BORDER_RADIUS_FIRST_FRAME_DELAY = 240;

const debug = logger('WindowBorderManager');

interface WindowWithCachedRadius extends Meta.Window {
    __ts_cached_radius: [number, number, number, number] | undefined;
}

@registerGObjectClass
class WindowBorder extends St.Bin {
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
            style_class: 'window-border',
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
        // @ts-expect-error "For some reason GObject.Binding is not recognized"
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
            global.windowGroup.set_child_above_sibling(this, null);
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
        // eslint-disable-next-line prettier/prettier
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
        this.set_style(
            `border-color: ${Settings.WINDOW_BORDER_COLOR}; border-width: ${borderWidth}px; border-radius: ${radius[St.Corner.TOPLEFT]}px ${radius[St.Corner.TOPRIGHT]}px ${radius[St.Corner.BOTTOMRIGHT]}px ${radius[St.Corner.BOTTOMLEFT]}px; ${scalingFactorSupportString}`,
        );

        if (this._borderWidth !== borderWidth) {
            const diff = this._borderWidth - borderWidth;
            this._borderWidth = borderWidth;
            this.set_size(
                this.get_width() - 2 * diff,
                this.get_height() - 2 * diff,
            );
            this.set_position(this.get_x() + diff, this.get_y() + diff);
        }
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

export class WindowBorderManager {
    private readonly _signals: SignalHandling;

    private _border: WindowBorder | null;
    private _enableScaling: boolean;

    constructor(enableScaling: boolean) {
        this._signals = new SignalHandling();
        this._border = null;
        this._enableScaling = enableScaling;
    }

    public enable(): void {
        if (Settings.ENABLE_WINDOW_BORDER) this._turnOn();

        // enable/disable based on user preferences
        this._signals.connect(
            Settings,
            Settings.KEY_ENABLE_WINDOW_BORDER,
            () => {
                if (Settings.ENABLE_WINDOW_BORDER) this._turnOn();
                else this._turnOff();
            },
        );
    }

    private _turnOn() {
        this._onWindowFocused();
        this._signals.connect(
            global.display,
            'notify::focus-window',
            this._onWindowFocused.bind(this),
        );
        this._signals.connect(Settings, Settings.KEY_WINDOW_BORDER_COLOR, () =>
            this._border?.updateStyle(),
        );

        this._signals.connect(Settings, Settings.KEY_WINDOW_BORDER_WIDTH, () =>
            this._border?.updateStyle(),
        );
    }

    private _turnOff() {
        this.destroy();
        this.enable();
    }

    public destroy(): void {
        this._signals.disconnect();
        this._border?.destroy();
        this._border = null;
    }

    private _onWindowFocused(): void {
        // connect signals on the window and create the border
        const metaWindow = global.display.focus_window;

        if (
            !metaWindow ||
            metaWindow.get_wm_class() === null ||
            metaWindow.get_wm_class() === 'gjs'
        ) {
            this._border?.destroy();
            this._border = null;
            return;
        }

        if (!this._border)
            this._border = new WindowBorder(metaWindow, this._enableScaling);
        else this._border.trackWindow(metaWindow);
    }
}

/*
If in the future we want to have MULTIPLE borders visible AT THE SAME TIME,
when the windows are restacked we have to restack the borders as well.

display.connect('restacked', (display) => {
    let wg = Meta.get_window_group_for_display(display);
    forEachWindowInTheWindowGroup((win) => {
        winBorder = getWindowBorder(win)
        winActor = win.get_compositor_private()
        wg.set_child_above_sibling(winBorder, winActor);
    });
});
*/
