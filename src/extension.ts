import './styles/stylesheet.scss';

import { Gio, GLib, Meta } from '@gi.ext';
import { logger } from '@utils/logger';
import { filterUnfocusableWindows, getMonitors, squaredEuclideanDistance } from '@/utils/ui';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { TilingManager } from '@/components/tilingsystem/tilingManager';
import Settings from '@settings/settings';
import SignalHandling from './utils/signalHandling';
import GlobalState from './utils/globalState';
import Indicator from './indicator/indicator';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ExtensionMetadata } from 'resource:///org/gnome/shell/extensions/extension.js';
import DBus from './dbus';
import KeyBindings, { KeyBindingsDirection, FocusSwitchDirection } from './keybindings';
import SettingsOverride from '@settings/settingsOverride';
import { ResizingManager } from '@components/tilingsystem/resizeManager';
import OverriddenWindowMenu from '@components/window_menu/overriddenWindowMenu';
import Tile from '@components/layout/Tile';
import { WindowBorderManager } from '@components/windowBorderManager';
import TilingShellWindowManager from '@components/windowManager/tilingShellWindowManager';
import ExtendedWindow from '@components/tilingsystem/extendedWindow';

const debug = logger('extension');

export default class TilingShellExtension extends Extension {
    private _indicator: Indicator | null;
    private _tilingManagers: TilingManager[];
    private _fractionalScalingEnabled: boolean;
    private _dbus: DBus | null;
    private _signals: SignalHandling | null;
    private _keybindings: KeyBindings | null;
    private _resizingManager: ResizingManager | null;
    private _windowBorderManager: WindowBorderManager | null;

    constructor(metadata: ExtensionMetadata) {
        super(metadata);
        this._signals = null;
        this._fractionalScalingEnabled = false;
        this._tilingManagers = [];
        this._indicator = null;
        this._dbus = null;
        this._keybindings = null;
        this._resizingManager = null;
        this._windowBorderManager = null;
    }

    createIndicator() {
        this._indicator = new Indicator(this.path, this.uuid);
        this._indicator.enableScaling = !this._fractionalScalingEnabled;
        this._indicator.enable();
    }

    private _validateSettings() {
        if (Settings.LAST_VERSION_NAME_INSTALLED === '14.0') {
            debug('apply compatibility changes');
            Settings.save_selected_layouts([]);
        }

        // Setting used for compatibility changes if necessary
        if (this.metadata['version-name']) {
            Settings.LAST_VERSION_NAME_INSTALLED =
                this.metadata['version-name'] || '0';
        }
    }

    enable(): void {
        if (this._signals) this._signals.disconnect();
        this._signals = new SignalHandling();

        Settings.initialize(this.getSettings());
        this._validateSettings();

        // force initialization and tracking of windows
        TilingShellWindowManager.get();

        this._fractionalScalingEnabled = this._isFractionalScalingEnabled(
            new Gio.Settings({ schema: 'org.gnome.mutter' }),
        );

        if (this._keybindings) this._keybindings.destroy();
        this._keybindings = new KeyBindings(this.getSettings());

        // disable native edge tiling
        if (Settings.ACTIVE_SCREEN_EDGES) {
            SettingsOverride.get().override(
                new Gio.Settings({ schema_id: 'org.gnome.mutter' }),
                'edge-tiling',
                new GLib.Variant('b', false),
            );
        }

        if (Main.layoutManager._startingUp) {
            this._signals.connect(
                Main.layoutManager,
                'startup-complete',
                () => {
                    this._createTilingManagers();
                    this._setupSignals();
                },
            );
        } else {
            this._createTilingManagers();
            this._setupSignals();
        }

        this._resizingManager = new ResizingManager();
        this._resizingManager.enable();

        if (this._windowBorderManager) this._windowBorderManager.destroy();
        this._windowBorderManager = new WindowBorderManager(
            !this._fractionalScalingEnabled,
        );
        this._windowBorderManager.enable();

        this.createIndicator();

        if (this._dbus) this._dbus.disable();
        this._dbus = new DBus();
        this._dbus.enable(this);

        if (Settings.OVERRIDE_WINDOW_MENU) OverriddenWindowMenu.enable();

        debug('extension is enabled');
    }

    public openLayoutEditor() {
        this._indicator?.openLayoutEditor();
    }

    private _createTilingManagers() {
        debug('building a tiling manager for each monitor');
        this._tilingManagers.forEach((tm) => tm.destroy());
        this._tilingManagers = getMonitors().map(
            (monitor) =>
                new TilingManager(monitor, !this._fractionalScalingEnabled),
        );
        this._tilingManagers.forEach((tm) => tm.enable());
    }

    private _setupSignals() {
        if (!this._signals) return;

        this._signals.connect(global.display, 'workareas-changed', () => {
            const allMonitors = getMonitors();
            if (this._tilingManagers.length !== allMonitors.length) {
                // a monitor was disconnected or a new one was connected
                GlobalState.get().validate_selected_layouts();
                // finally build a tiling manager for each monitor
                this._createTilingManagers();
            } else {
                // the number of monitors is the same, so update the workarea
                this._tilingManagers.forEach((tm, index) => {
                    tm.workArea =
                        Main.layoutManager.getWorkAreaForMonitor(index);
                });
            }
        });

        this._signals.connect(
            new Gio.Settings({ schema: 'org.gnome.mutter' }),
            'changed::experimental-features',
            (_mutterSettings: Gio.Settings) => {
                if (!_mutterSettings) return;

                const fractionalScalingEnabled =
                    this._isFractionalScalingEnabled(_mutterSettings);

                if (this._fractionalScalingEnabled === fractionalScalingEnabled)
                    return;

                this._fractionalScalingEnabled = fractionalScalingEnabled;
                this._createTilingManagers();
                if (this._indicator) {
                    this._indicator.enableScaling =
                        !this._fractionalScalingEnabled;
                }
                if (this._windowBorderManager)
                    this._windowBorderManager.destroy();
                this._windowBorderManager = new WindowBorderManager(
                    this._fractionalScalingEnabled,
                );
                this._windowBorderManager.enable();
            },
        );

        if (this._keybindings) {
            this._signals.connect(
                this._keybindings,
                'move-window',
                (
                    kb: KeyBindings,
                    dp: Meta.Display,
                    dir: KeyBindingsDirection,
                ) => {
                    this._onKeyboardMoveWin(dp, dir, false);
                },
            );
            this._signals.connect(
                this._keybindings,
                'span-window',
                (
                    kb: KeyBindings,
                    dp: Meta.Display,
                    dir: KeyBindingsDirection,
                ) => {
                    this._onKeyboardMoveWin(dp, dir, true);
                },
            );
            this._signals.connect(
                this._keybindings,
                'span-window-all-tiles',
                (kb: KeyBindings, dp: Meta.Display) => {
                    const window = dp.focus_window;
                    const monitorIndex = window.get_monitor();
                    const manager = this._tilingManagers[monitorIndex];
                    if (manager) manager.onSpanAllTiles(window);
                },
            );
            this._signals.connect(
                this._keybindings,
                'untile-window',
                this._onKeyboardUntileWindow.bind(this),
            );
            this._signals.connect(
                this._keybindings,
                'move-window-center',
                (kb: KeyBindings, dp: Meta.Display) => {
                    this._onKeyboardMoveWin(
                        dp,
                        KeyBindingsDirection.NODIRECTION,
                        false,
                    );
                },
            );
            this._signals.connect(
                this._keybindings,
                'focus-window',
                (
                    kb: KeyBindings,
                    dp: Meta.Display,
                    dir: KeyBindingsDirection | FocusSwitchDirection,
                ) => {
                    this._onKeyboardFocusWin(dp, dir);
                },
            );
        }

        // when Tiling Shell's edge-tiling is enabled/disable
        // then enable/disable native edge-tiling
        this._signals.connect(
            Settings,
            Settings.KEY_ACTIVE_SCREEN_EDGES,
            () => {
                const gioSettings = new Gio.Settings({
                    schema_id: 'org.gnome.mutter',
                });
                if (Settings.ACTIVE_SCREEN_EDGES) {
                    debug('disable native edge tiling');
                    // disable native edge tiling
                    SettingsOverride.get().override(
                        gioSettings,
                        'edge-tiling',
                        new GLib.Variant('b', false),
                    );
                } else {
                    // bring back the value of native edge tiling
                    debug('bring back native edge tiling');
                    SettingsOverride.get().restoreKey(
                        gioSettings,
                        'edge-tiling',
                    );
                }
            },
        );

        // enable/disable window menu from preferences
        this._signals.connect(
            Settings,
            Settings.KEY_OVERRIDE_WINDOW_MENU,
            () => {
                if (Settings.OVERRIDE_WINDOW_MENU)
                    OverriddenWindowMenu.enable();
                else OverriddenWindowMenu.disable();
            },
        );

        // tile a window when a tile or a button is clicked from the window menu
        this._signals.connect(
            OverriddenWindowMenu,
            'tile-clicked',
            (_, tile: Tile, window: Meta.Window) => {
                const monitorIndex = window.get_monitor();
                const manager = this._tilingManagers[monitorIndex];
                if (manager) manager.onTileFromWindowMenu(tile, window);
            },
        );

        /* todo move maximized to workspace
        this._signals.connect(
            global.window_manager,
            'size-change',
            this._moveMaximizedToWorkspace.bind(this),
        );

        this._signals.connect(
            global.window_manager,
            'size-changed',
            this._onSizeChanged.bind(this),
        );*/
    }

    /* todo private _moveMaximizedToWorkspace(
        wm: Shell.WM,
        winActor: Meta.WindowActor,
        change: Meta.SizeChange,
    ) {
        const window = winActor.metaWindow;
        if (
            window.wmClass === null ||
            change !== Meta.SizeChange.MAXIMIZE || // handle maximize changes only
            window.get_maximized() !== Meta.MaximizeFlags.BOTH || // handle maximized window only
            window.is_attached_dialog() || // skip dialogs
            window.is_on_all_workspaces() ||
            window.windowType !== Meta.WindowType.NORMAL || // handle normal windows only
            window.wmClass === 'gjs'
        )
            return;

        const prevWorkspace = window.get_workspace();
        // if it is the only window in the workspace, no new workspace is needed
        if (
            !prevWorkspace
                .list_windows()
                .find(
                    (otherWin) =>
                        otherWin !== window &&
                        otherWin.windowType === Meta.WindowType.NORMAL &&
                        !otherWin.is_always_on_all_workspaces() &&
                        otherWin.wmClass !== null &&
                        otherWin.wmClass !== 'gjs',
                )
        )
            return;

        // disable GNOME default fade out animation
        // @ts-expect-error Main.wm has "_sizeChangeWindowDone" function
        Main.wm._sizeChangeWindowDone(global.windowManager, winActor);

        const wasActive = prevWorkspace.active;
        // create a new workspace, do not focus it
        const newWorkspace = global.workspace_manager.append_new_workspace(
            false,
            global.get_current_time(),
        );
        // place the workspace after the current one
        global.workspace_manager.reorder_workspace(
            newWorkspace,
            prevWorkspace.index() + 1,
        );
        // queue focus the workspace, focusing the window too. This will trigger workspace slide-in animation
        if (wasActive) window._queue_focus_ws = newWorkspace;
    }

    private _onSizeChanged(wm: Shell.WM, winActor: Meta.WindowActor) {
        const window = winActor.metaWindow;

        if (!window._queue_focus_ws) return;
        const ws = window._queue_focus_ws;
        delete window._queue_focus_ws;

        console.log(`_onSizeChanged ${ws}`);
        // move the window
        ws.activate_with_focus(window, global.get_current_time());
        window.change_workspace(ws);
    }*/

    private _onKeyboardMoveWin(
        display: Meta.Display,
        direction: KeyBindingsDirection,
        spanFlag: boolean,
    ) {
        const focus_window = display.get_focus_window();
        if (
            !focus_window ||
            !focus_window.has_focus() ||
            (focus_window.get_wm_class() &&
                focus_window.get_wm_class() === 'gjs')
        )
            return;

        // if the window is maximized, it cannot be spanned
        if (
            (focus_window.maximizedHorizontally ||
                focus_window.maximizedVertically) &&
            spanFlag
        )
            return;

        // handle unmaximize of maximized window
        if (
            (focus_window.maximizedHorizontally ||
                focus_window.maximizedVertically) &&
            direction === KeyBindingsDirection.DOWN
        ) {
            focus_window.unmaximize(Meta.MaximizeFlags.BOTH);
            return;
        }

        const monitorTilingManager =
            this._tilingManagers[focus_window.get_monitor()];
        if (!monitorTilingManager) return;

        if (
            Settings.ENABLE_AUTO_TILING &&
            (focus_window.maximizedHorizontally ||
                focus_window.maximizedVertically)
        ) {
            focus_window.unmaximize(Meta.MaximizeFlags.BOTH);
            return;
        }
        const success = monitorTilingManager.onKeyboardMoveWindow(
            focus_window,
            direction,
            false,
            spanFlag,
        );
        if (success || direction === KeyBindingsDirection.NODIRECTION) return;

        let displayDirection = Meta.DisplayDirection.DOWN;
        switch (direction) {
            case KeyBindingsDirection.LEFT:
                displayDirection = Meta.DisplayDirection.LEFT;
                break;
            case KeyBindingsDirection.RIGHT:
                displayDirection = Meta.DisplayDirection.RIGHT;
                break;
            case KeyBindingsDirection.UP:
                displayDirection = Meta.DisplayDirection.UP;
                break;
        }

        const neighborMonitorIndex = display.get_monitor_neighbor_index(
            focus_window.get_monitor(),
            displayDirection,
        );

        // if the window is maximized, direction is UP and there is a monitor above, minimize the window
        if (
            (focus_window.maximizedHorizontally ||
                focus_window.maximizedVertically) &&
            direction === KeyBindingsDirection.UP
        ) {
            // @ts-expect-error "Main.wm has skipNextEffect function"
            Main.wm.skipNextEffect(focus_window.get_compositor_private());
            focus_window.unmaximize(Meta.MaximizeFlags.BOTH);
            (focus_window as ExtendedWindow).assignedTile = undefined;
        }

        const neighborTilingManager =
            this._tilingManagers[neighborMonitorIndex];
        if (!neighborTilingManager) return;

        neighborTilingManager.onKeyboardMoveWindow(
            focus_window,
            direction,
            true,
            spanFlag,
        );
    }

    private _onKeyboardFocusWin(
        display: Meta.Display,
        direction: KeyBindingsDirection | FocusSwitchDirection,
    ) {
        const focus_window = display.get_focus_window();
        const focusParent = (focus_window.get_transient_for() || focus_window);

        if (
            !focus_window ||
            !focus_window.has_focus() ||
            focusParent.windowType !== Meta.WindowType.NORMAL ||
            (focus_window.get_wm_class() &&
                focus_window.get_wm_class() === 'gjs')
        )
            return;

        let bestWindow: Meta.Window | undefined;
        let bestWindowDistance = -1;

        const focusWindowRect = focus_window.get_frame_rect();
        const focusWindowCenter = {
            x: focusWindowRect.x + focusWindowRect.width / 2,
            y: focusWindowRect.y + focusWindowRect.height / 2,
        };

        const windowList = filterUnfocusableWindows(focus_window.get_workspace().list_windows());
        const focusedIdx = windowList.findIndex((win) => {
            // in case we are iterating over a modal dialog for our focused window
            return win === focusParent;
        });

        switch (direction) {
            case FocusSwitchDirection.PREV:
                if (focusedIdx == 0 && Settings.WRAPAROUND_FOCUS) {
                    windowList[windowList.length - 1].activate(global.get_current_time());
                } else {
                    windowList[focusedIdx - 1].activate(global.get_current_time());
                }
                return;
            case FocusSwitchDirection.NEXT:
                const nextIdx = (focusedIdx + 1) % windowList.length;
                if (nextIdx > 0 || Settings.WRAPAROUND_FOCUS) {
                    windowList[nextIdx].activate(global.get_current_time());
                }
                return;
        }

        windowList
            .filter((win) => {
                if (win === focus_window || win.minimized) return false;

                const winRect = win.get_frame_rect();
                switch (direction) {
                    case KeyBindingsDirection.RIGHT:
                        return winRect.x > focusWindowRect.x;
                    case KeyBindingsDirection.LEFT:
                        return winRect.x < focusWindowRect.x;
                    case KeyBindingsDirection.UP:
                        return winRect.y < focusWindowRect.y;
                    case KeyBindingsDirection.DOWN:
                        return winRect.y > focusWindowRect.y;
                }
                return false;
            })
            .forEach((win) => {
                const winRect = win.get_frame_rect();
                const winCenter = {
                    x: winRect.x + winRect.width / 2,
                    y: winRect.y + winRect.height / 2,
                };

                const euclideanDistance = squaredEuclideanDistance(
                    winCenter,
                    focusWindowCenter,
                );

                if (
                    !bestWindow ||
                    euclideanDistance < bestWindowDistance ||
                    (euclideanDistance === bestWindowDistance &&
                        bestWindow.get_frame_rect().y > winRect.y)
                ) {
                    bestWindow = win;
                    bestWindowDistance = euclideanDistance;
                }
            });

        if (!bestWindow) return;

        bestWindow.activate(global.get_current_time());
    }

    private _onKeyboardUntileWindow(kb: KeyBindings, display: Meta.Display) {
        const focus_window = display.get_focus_window();
        if (
            !focus_window ||
            !focus_window.has_focus() ||
            focus_window.windowType !== Meta.WindowType.NORMAL ||
            (focus_window.get_wm_class() &&
                focus_window.get_wm_class() === 'gjs')
        )
            return;

        // if the window is maximized, unmaximize it
        if (focus_window.get_maximized())
            focus_window.unmaximize(Meta.MaximizeFlags.BOTH);

        const monitorTilingManager =
            this._tilingManagers[focus_window.get_monitor()];
        if (!monitorTilingManager) return;

        monitorTilingManager.onUntileWindow(focus_window, true);
    }

    private _isFractionalScalingEnabled(
        _mutterSettings: Gio.Settings,
    ): boolean {
        return (
            _mutterSettings
                .get_strv('experimental-features')
                .find(
                    (feat) =>
                        feat === 'scale-monitor-framebuffer' ||
                        feat === 'x11-randr-fractional-scaling',
                ) !== undefined
        );
    }

    disable(): void {
        // bring back overridden keybindings
        this._keybindings?.destroy();
        this._keybindings = null;

        // destroy indicator
        this._indicator?.destroy();
        this._indicator = null;

        // destroy tiling managers
        this._tilingManagers.forEach((tm) => tm.destroy());
        this._tilingManagers = [];

        // disconnect signals
        this._signals?.disconnect();
        this._signals = null;

        this._resizingManager?.destroy();
        this._resizingManager = null;

        this._windowBorderManager?.destroy();
        this._windowBorderManager = null;

        // disable dbus
        this._dbus?.disable();
        this._dbus = null;

        this._fractionalScalingEnabled = false;

        OverriddenWindowMenu.destroy();

        // restore native edge tiling and all the overridden settings
        SettingsOverride.destroy();

        // destroy state and settings
        GlobalState.destroy();
        Settings.destroy();
        TilingShellWindowManager.destroy();

        debug('extension is disabled');
    }
}
