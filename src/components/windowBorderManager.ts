import Meta from 'gi://Meta';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import GObject from 'gi://GObject';

import SignalHandling from '@utils/signalHandling';
import { logger } from '@utils/shell';
import { registerGObjectClass } from '@utils/gjs';
import Settings from '@settings/settings';

const debug = logger('WindowBorderManager');

interface WindowWithBorder extends Meta.Window {
    border: WindowBorder | null;
}

@registerGObjectClass
class WindowBorder extends St.Bin {
    private readonly _window: WindowWithBorder;
    private readonly _windowActor: Clutter.Actor;
    private readonly _signals: SignalHandling;

    constructor(win: WindowWithBorder, windowActor: Clutter.Actor) {
        super({
            style_class: 'window-border full-radius',
        });
        this._window = win;
        this._windowActor = windowActor;
        this._signals = new SignalHandling();
        this.updateConstraints();

        // scale and translate like the window actor
        windowActor.bind_property(
            'scale-x',
            this,
            'scale-x',
            GObject.BindingFlags.DEFAULT,
        );
        windowActor.bind_property(
            'scale-y',
            this,
            'scale-y',
            GObject.BindingFlags.DEFAULT,
        );
        windowActor.bind_property(
            'translation_x',
            this,
            'translation_x',
            GObject.BindingFlags.DEFAULT,
        );
        windowActor.bind_property(
            'translation_y',
            this,
            'translation_y',
            GObject.BindingFlags.DEFAULT,
        );
        this.hide();
        this.updateStyle();

        this._signals.connect(this, 'destroy', () => {
            this._signals.disconnect();
        });

        this._signals.connect(this._windowActor, 'destroy', () => {
            this._window.border = null;
            this.destroy();
        });
    }

    public updateConstraints() {
        // if the constraints are not there, check if the actor and the window centers are the same
        // if they are not the same, it means the actor is animating
        // if the actor is animating, the offset calculation will be wrong
        // so we return without adding the constraints and we hope it is not animating the next
        // time the updateConstraints() is called by the show() method
        // The described (particular) situation happens only if the borders are enabled from
        // the preferences and the window is minimized: when it will be unminimized, the actor
        // may animate, resulting in wrong offset calculation
        if (!this.has_constraints()) {
            const actorCenterX =
                this._windowActor.width / 2 + this._windowActor.x;
            const windowCenterX =
                this._window.get_frame_rect().width / 2 +
                this._window.get_frame_rect().x;
            if (actorCenterX !== windowCenterX) {
                this.set_size(0, 0);
                this.set_position(0, 0);
                return;
            }
        }
        this.clear_constraints();
        this.add_constraint(
            new Clutter.BindConstraint({
                source: this._windowActor,
                offset:
                    this._window.get_frame_rect().width -
                    this._windowActor.get_width(),
                enabled: true,
                coordinate: Clutter.BindCoordinate.WIDTH,
            }),
        );
        this.add_constraint(
            new Clutter.BindConstraint({
                source: this._windowActor,
                offset:
                    this._window.get_frame_rect().height -
                    this._windowActor.get_height(),
                enabled: true,
                coordinate: Clutter.BindCoordinate.HEIGHT,
            }),
        );
        this.add_constraint(
            new Clutter.BindConstraint({
                source: this._windowActor,
                offset:
                    this._window.get_frame_rect().x - this._windowActor.get_x(),
                enabled: true,
                coordinate: Clutter.BindCoordinate.X,
            }),
        );
        this.add_constraint(
            new Clutter.BindConstraint({
                source: this._windowActor,
                offset:
                    this._window.get_frame_rect().y - this._windowActor.get_y(),
                enabled: true,
                coordinate: Clutter.BindCoordinate.Y,
            }),
        );
    }

    public updateStyle(): void {
        this.set_style(
            `border-color: ${Settings.get_window_border_color()}; border-width: ${Settings.get_window_border_width()}px;`,
        );
    }

    public override show() {
        if (!this.is_visible()) this.updateStyle();
        if (!this.has_constraints()) this.updateConstraints();

        super.show();
        this.ease({
            opacity: 255,
            duration: 200,
        });
    }

    public override hide() {
        this.set_opacity(0);
        super.hide();
    }
}

export class WindowBorderManager {
    private readonly _signals: SignalHandling;

    private _lastFocusedWindow: WindowWithBorder | null;

    constructor() {
        this._signals = new SignalHandling();
        this._lastFocusedWindow = null;
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
            global.display,
            'window-entered-monitor',
            this._onWindowEnteredMonitor.bind(this),
        );
        this._signals.connect(
            global.windowManager,
            'minimize',
            this._onWindowMinimize.bind(this),
        );
        this._signals.connect(
            global.windowManager,
            'size-changed',
            this._onSizeChanged.bind(this),
        );
        this._signals.connect(
            global.windowManager,
            'destroy',
            this._onWindowClosed.bind(this),
        );
        this._signals.connect(
            Settings,
            Settings.SETTING_WINDOW_BORDER_COLOR,
            () => {
                if (this._lastFocusedWindow)
                    this._lastFocusedWindow.border?.updateStyle();
            },
        );

        this._signals.connect(
            Settings,
            Settings.SETTING_WINDOW_BORDER_WIDTH,
            () => {
                if (this._lastFocusedWindow)
                    this._lastFocusedWindow.border?.updateStyle();
            },
        );
    }

    private _turnOff() {
        this.destroy();
        this.enable();
    }

    public destroy(): void {
        this._signals.disconnect();
        global.get_window_actors().forEach((windowActor) => {
            const metaWindow = windowActor.meta_window;
            if (!metaWindow) return;
            if (!(metaWindow as WindowWithBorder).border) return;

            (metaWindow as WindowWithBorder).border?.destroy();
            (metaWindow as WindowWithBorder).border = null;
        });
        this._lastFocusedWindow = null;
    }

    private _onWindowFocused(): void {
        if (this._lastFocusedWindow && this._lastFocusedWindow.border)
            this._lastFocusedWindow.border.hide();

        // connect signals on the window and create the border
        const metaWindow = global.display.focus_window;

        if (
            !metaWindow ||
            metaWindow.get_wm_class() === null ||
            metaWindow.get_wm_class() === 'gjs'
        ) {
            this._lastFocusedWindow = null;
            return;
        }

        const windowActor =
            metaWindow.get_compositor_private() as Clutter.Actor;
        if (!windowActor) return;

        const window = metaWindow as WindowWithBorder;
        if (!window.border) {
            window.border = new WindowBorder(window, windowActor);
            global.windowGroup.add_child(window.border);
        } else {
            global.windowGroup.set_child_above_sibling(
                window.border,
                windowActor,
            );
        }

        const isMaximized =
            window.maximizedVertically && window.maximizedHorizontally;
        if (window.is_fullscreen() || isMaximized || window.minimized)
            window.border.hide();
        else window.border.show();
        this._lastFocusedWindow = window;
    }

    private _onWindowMinimize(
        _source: Shell.WM,
        metaWindowActor: Meta.WindowActor,
    ): void {
        const window = metaWindowActor.metaWindow as WindowWithBorder;
        if (!window.border) return;

        window.border.hide();
    }

    private _onSizeChanged(
        _source: Shell.WM,
        metaWindowActor: Meta.WindowActor,
    ): void {
        // handle maximize and unmaximize cases
        const window = metaWindowActor.metaWindow as WindowWithBorder;
        if (!window.border) return;

        const isMaximized =
            window.maximizedVertically && window.maximizedHorizontally;
        if (window.is_fullscreen() || isMaximized || window.minimized)
            window.border.hide();
        else window.border.show();
    }

    private _onWindowClosed(
        _source: Shell.WM,
        metaWindowActor: Meta.WindowActor,
    ): void {
        // handle close of a window
        const window = metaWindowActor.metaWindow as WindowWithBorder;
        if (!window.border) return;

        window.border.hide();
    }

    private _onWindowEnteredMonitor(
        _source: Meta.Display,
        monitor: number,
        metaWindow: Meta.Window,
    ) {
        // handle window moved into another monitor with different scaling factor
        const window = metaWindow as WindowWithBorder;
        if (!window.border) return;

        window.border.updateConstraints();
    }
}
