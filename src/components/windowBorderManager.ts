import { GObject, Meta, St, Clutter } from '@gi.ext';
import SignalHandling from '@utils/signalHandling';
import { logger } from '@utils/logger';
import { registerGObjectClass } from '@utils/gjs';
import Settings from '@settings/settings';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    enableScalingFactorSupport,
    getMonitorScalingFactor,
    getScalingFactorOf,
    getScalingFactorSupportString,
} from '@utils/ui';

const debug = logger('WindowBorderManager');

@registerGObjectClass
class WindowBorder extends St.Bin {
    private readonly _signals: SignalHandling;

    private _window: Meta.Window;
    private _windowMonitor: number;
    private _bindings: GObject.Binding[];
    private _enableScaling: boolean;

    constructor(win: Meta.Window, enableScaling: boolean) {
        super({
            style_class: 'window-border',
        });
        this._signals = new SignalHandling();
        this._bindings = [];

        this._window = win;
        this._windowMonitor = win.get_monitor();
        this._enableScaling = enableScaling;

        this.close();
        global.windowGroup.add_child(this);

        this.trackWindow(win, true);

        this.connect('destroy', () => {
            this._bindings.forEach((b) => b.unbind());
            this._bindings = [];
            this._signals.disconnect();
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
        this._bindings.push(
            // @ts-expect-error "For some reason GObject.Binding is not recognized"
            winActor.bind_property(
                'scale-x',
                this,
                'scale-x',
                GObject.BindingFlags.DEFAULT, // if winActor changes, this will change
            ),
        );
        this._bindings.push(
            // @ts-expect-error "For some reason GObject.Binding is not recognized"
            winActor.bind_property(
                'scale-y',
                this,
                'scale-y',
                GObject.BindingFlags.DEFAULT, // if winActor changes, this will change
            ),
        );
        this._bindings.push(
            // @ts-expect-error "For some reason GObject.Binding is not recognized"
            winActor.bind_property(
                'translation_x',
                this,
                'translation_x',
                GObject.BindingFlags.DEFAULT, // if winActor changes, this will change
            ),
        );
        this._bindings.push(
            // @ts-expect-error "For some reason GObject.Binding is not recognized"
            winActor.bind_property(
                'translation_y',
                this,
                'translation_y',
                GObject.BindingFlags.DEFAULT, // if winActor changes, this will change
            ),
        );

        const winRect = this._window.get_frame_rect();
        this.set_position(winRect.x, winRect.y);
        this.set_size(winRect.width, winRect.height);

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

            const rect = this._window.get_frame_rect();
            this.set_position(rect.x, rect.y);
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

            const rect = this._window.get_frame_rect();
            this.set_size(rect.width, rect.height);
            // if the window changes monitor, we may have a different scaling factor
            if (this._windowMonitor !== win.get_monitor()) {
                this._windowMonitor = win.get_monitor();
                this.updateStyle();
            }
            this.open();
        });
    }

    public updateStyle(): void {
        // handle scale factor of the monitor
        const monitorScalingFactor = this._enableScaling
            ? getMonitorScalingFactor(this._window.get_monitor())
            : undefined;
        // CAUTION: this overrides the CSS style
        enableScalingFactorSupport(this, monitorScalingFactor);

        const [alreadyScaled, scalingFactor] = getScalingFactorOf(this);
        // the value got is already scaled if the tile is on primary monitor
        const radiusValue =
            (alreadyScaled ? 1 : scalingFactor) *
            (this.get_theme_node().get_length('border-radius-value') /
                (alreadyScaled ? scalingFactor : 1));
        const borderWidth =
            (alreadyScaled ? 1 : scalingFactor) *
            (Settings.WINDOW_BORDER_WIDTH /
                (alreadyScaled ? scalingFactor : 1));
        const radius = [radiusValue, radiusValue, radiusValue, radiusValue];
        debug(
            'sf is',
            scalingFactor,
            'radius is',
            radius,
            'border is',
            borderWidth,
        );
        const scalingFactorSupportString = monitorScalingFactor
            ? getScalingFactorSupportString(monitorScalingFactor)
            : '';
        this.set_style(
            `border-color: ${Settings.WINDOW_BORDER_COLOR}; border-width: ${borderWidth}px; border-radius: ${radius[St.Corner.TOPLEFT]}px ${radius[St.Corner.TOPRIGHT]}px ${radius[St.Corner.BOTTOMRIGHT]}px ${radius[St.Corner.BOTTOMLEFT]}px; ${scalingFactorSupportString};`,
        );
    }

    public open() {
        if (this.visible) return;

        this.show();
        this.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE,
            delay: 100,
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
