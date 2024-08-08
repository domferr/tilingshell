import './styles/stylesheet.scss';

import { logger } from '@/utils/shell';
import { getMonitors } from '@/utils/ui';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { TilingManager } from '@/components/tilingsystem/tilingManager';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import Settings from '@settings/settings';
import SignalHandling from './utils/signalHandling';
import GlobalState from './utils/globalState';
import Indicator from './indicator/indicator';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ExtensionMetadata } from 'resource:///org/gnome/shell/extensions/extension.js';
import DBus from './dbus';
import KeyBindings from './keybindings';
import SettingsOverride from '@settings/settingsOverride';
import { ResizingManager } from '@components/tilingsystem/resizeManager';
import OverriddenWindowMenu from '@components/window_menu/overriddenWindowMenu';
import Tile from '@components/layout/Tile';
import { WindowBorderManager } from '@components/windowBorderManager';

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
        // Setting used for compatibility changes if necessary
        if (this.metadata['version-name']) {
            Settings.set_last_version_installed(
                this.metadata['version-name'] || '0',
            );
        }

        const selectedLayouts = Settings.get_selected_layouts();
        const monitors = getMonitors();
        const layouts = GlobalState.get().layouts;

        if (selectedLayouts.length === 0) selectedLayouts.push(layouts[0].id);
        while (monitors.length < selectedLayouts.length) selectedLayouts.pop();

        while (monitors.length > selectedLayouts.length)
            selectedLayouts.push(selectedLayouts[0]);

        for (let i = 0; i < selectedLayouts.length; i++) {
            if (
                layouts.findIndex((lay) => lay.id === selectedLayouts[i]) === -1
            )
                selectedLayouts[i] = selectedLayouts[0];
        }
        Settings.save_selected_layouts_json(selectedLayouts);
    }

    enable(): void {
        if (this._signals) this._signals.disconnect();
        this._signals = new SignalHandling();

        Settings.initialize(this.getSettings());
        this._validateSettings();

        this._fractionalScalingEnabled = this._isFractionalScalingEnabled(
            new Gio.Settings({ schema: 'org.gnome.mutter' }),
        );

        if (this._keybindings) this._keybindings.destroy();
        this._keybindings = new KeyBindings(this.getSettings());

        // disable native edge tiling
        if (Settings.get_active_screen_edges()) {
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
        this._windowBorderManager = new WindowBorderManager();
        this._windowBorderManager.enable();

        this.createIndicator();

        if (this._dbus) this._dbus.disable();
        this._dbus = new DBus();
        this._dbus.enable(this);

        if (Settings.get_override_window_menu()) OverriddenWindowMenu.enable();

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
                // update the index of selected layouts
                const oldIndexes = Settings.get_selected_layouts();
                const indexes = allMonitors.map((monitor) => {
                    // If there is a new monitor, give the same layout as the first monitor
                    if (monitor.index >= oldIndexes.length)
                        return GlobalState.get().layouts[0].id;
                    return oldIndexes[monitor.index];
                });
                Settings.save_selected_layouts_json(indexes);
            }

            this._createTilingManagers();
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
            },
        );

        if (this._keybindings) {
            this._signals.connect(
                this._keybindings,
                'move-window',
                (
                    kb: KeyBindings,
                    dp: Meta.Display,
                    dir: Meta.DisplayDirection,
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
                    dir: Meta.DisplayDirection,
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
        }

        // when Tiling Shell's edge-tiling is enabled/disable
        // then enable/disable native edge-tiling
        this._signals.connect(
            Settings,
            Settings.SETTING_ACTIVE_SCREEN_EDGES,
            () => {
                // disable native edge tiling
                const nativeIsActive = !Settings.get_active_screen_edges();

                SettingsOverride.get().override(
                    new Gio.Settings({ schema_id: 'org.gnome.mutter' }),
                    'edge-tiling',
                    new GLib.Variant('b', nativeIsActive),
                );
            },
        );

        // enable/disable window menu from preferences
        this._signals.connect(
            Settings,
            Settings.SETTING_OVERRIDE_WINDOW_MENU,
            () => {
                if (Settings.get_override_window_menu())
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
        direction: Meta.DisplayDirection,
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
        if (focus_window.get_maximized() && spanFlag) return;

        // handle unmaximize of maximized window
        if (
            focus_window.get_maximized() &&
            direction === Meta.DisplayDirection.DOWN
        ) {
            focus_window.unmaximize(Meta.MaximizeFlags.BOTH);
            return;
        }

        const monitorTilingManager =
            this._tilingManagers[focus_window.get_monitor()];
        if (!monitorTilingManager) return;

        const success = monitorTilingManager.onKeyboardMoveWindow(
            focus_window,
            direction,
            false,
            spanFlag,
        );
        if (success) return;

        const neighborMonitorIndex = display.get_monitor_neighbor_index(
            focus_window.get_monitor(),
            direction,
        );

        // if the window is maximized, direction is UP and there is a monitor above, minimize the window
        if (
            focus_window.get_maximized() &&
            direction === Meta.DisplayDirection.UP
        ) {
            // @ts-expect-error "Main.wm has skipNextEffect function"
            Main.wm.skipNextEffect(focus_window.get_compositor_private());
            focus_window.unmaximize(Meta.MaximizeFlags.BOTH);
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

    private _onKeyboardUntileWindow(kb: KeyBindings, display: Meta.Display) {
        const focus_window = display.get_focus_window();
        if (
            !focus_window ||
            !focus_window.has_focus() ||
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

        // destroy state and settings
        GlobalState.destroy();
        Settings.destroy();

        // restore native edge tiling
        SettingsOverride.get().restoreKey(
            new Gio.Settings({ schema_id: 'org.gnome.mutter' }),
            'edge-tiling',
        );

        this._fractionalScalingEnabled = false;

        OverriddenWindowMenu.destroy();
        debug('extension is disabled');
    }
}
