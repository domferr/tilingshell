import { Gio } from '../../gi/ext';
import WindowBorder from './windowBorder';
import SignalHandling from '../../utils/signalHandling';
import Settings from '../../settings/settings';
import { CustomRulesManager } from '../customRulesManager';

export class WindowBorderManager {
    private readonly _signals: SignalHandling;

    private _border: WindowBorder | null;
    private _enableScaling: boolean;
    private _interfaceSettings: Gio.Settings;
    private _customRulesManager: CustomRulesManager;

    constructor(
        enableScaling: boolean,
        customRulesManager: CustomRulesManager,
    ) {
        this._signals = new SignalHandling();
        this._border = null;
        this._enableScaling = enableScaling;
        this._interfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._customRulesManager = customRulesManager;
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

        // re-evaluate current window when customRules changes
        this._signals.connect(
            this._customRulesManager,
            'customRules-changed',
            () => {
                this._onWindowFocused();
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
        this._signals.connect(
            Settings,
            Settings.KEY_WINDOW_USE_CUSTOM_BORDER_COLOR,
            () => this._border?.updateStyle(),
        );
        this._interfaceSettings.connect('changed::accent-color', () =>
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

        // Check if window is customRulesed for custom border
        if (!this._customRulesManager.isCustomBorderEnabled(metaWindow)) {
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
    let wg = Meta.get_window_group_for_display(display); // From GNOME 48 use Meta.Compositor.get_window_group
    forEachWindowInTheWindowGroup((win) => {
        winBorder = getWindowBorder(win)
        winActor = win.get_compositor_private()
        wg.set_child_above_sibling(winBorder, winActor);
    });
});
*/