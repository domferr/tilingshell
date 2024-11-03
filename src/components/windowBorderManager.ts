import { GObject, Meta, St, Clutter } from '@gi.ext';
import SignalHandling from '@utils/signalHandling';
import { logger } from '@utils/logger';
import { registerGObjectClass } from '@utils/gjs';
import Settings from '@settings/settings';

const debug = logger('WindowBorderManager');

@registerGObjectClass
class WindowBorder extends St.Bin {
    private readonly _signals: SignalHandling;

    private _window: Meta.Window;
    private _bindings: GObject.Binding[];

    constructor(win: Meta.Window) {
        super({
            style_class: 'window-border full-radius',
        });
        this._signals = new SignalHandling();
        this._bindings = [];

        this.updateStyle();
        this._window = win;
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
            this.open();
        });
    }

    public updateStyle(): void {
        this.set_style(
            `border-color: ${Settings.get_window_border_color()}; border-width: ${Settings.get_window_border_width()}px;`,
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

    constructor() {
        this._signals = new SignalHandling();
        this._border = null;
    }

    public enable(): void {
        if (Settings.get_enable_window_border()) this._turnOn();

        // enable/disable based on user preferences
        this._signals.connect(
            Settings,
            Settings.SETTING_ENABLE_WINDOW_BORDER,
            () => {
                if (Settings.get_enable_window_border()) this._turnOn();
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
        this._signals.connect(
            Settings,
            Settings.SETTING_WINDOW_BORDER_COLOR,
            () => {
                this._border?.updateStyle();
            },
        );

        this._signals.connect(
            Settings,
            Settings.SETTING_WINDOW_BORDER_WIDTH,
            () => {
                this._border?.updateStyle();
            },
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

        if (!this._border) this._border = new WindowBorder(metaWindow);
        else this._border.trackWindow(metaWindow);
    }
}
