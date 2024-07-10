import './styles/stylesheet.scss';

import { logger } from '@/utils/shell';
import { getMonitors } from '@/utils/ui';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { TilingManager } from '@/components/tilingsystem/tilingManager';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Settings from '@/settings';
import SignalHandling from './signalHandling';
import GlobalState from './globalState';
import Indicator from './indicator/indicator';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ExtensionMetadata } from 'resource:///org/gnome/shell/extensions/extension.js';
import DBus from './dbus';
import KeyBindings from './keybindings';
import SettingsOverride from '@settingsOverride';
import { ResizingManager } from '@components/tilingsystem/resizeManager';
import OverriddenWindowMenu from '@overriddenWindowMenu';
import Tile from '@components/layout/Tile';

const debug = logger('extension');

export default class TilingShellExtension extends Extension {
    private _indicator: Indicator | null;
    private _tilingManagers: TilingManager[];
    private _fractionalScalingEnabled: boolean;
    private _dbus: DBus | null;
    private _signals: SignalHandling | null;
    private _keybindings: KeyBindings | null;
    private _resizingManager: ResizingManager | null;

    constructor(metadata: ExtensionMetadata) {
        super(metadata);
        this._signals = null;
        this._fractionalScalingEnabled = false;
        this._tilingManagers = [];
        this._indicator = null;
        this._dbus = null;
        this._keybindings = null;
        this._resizingManager = null;
    }

    createIndicator() {
        this._indicator = new Indicator(this.path, this.uuid);
        this._indicator.enableScaling = !this._fractionalScalingEnabled;
        this._indicator.enable();
    }

    private _validateSettings() {
        // Setting used for compatibility changes if necessary
        if (this.metadata['version-name']) {
            if (
                Settings.get_last_version_installed() === '9.0' ||
                Settings.get_last_version_installed() === '9.1'
            )
                KeyBindings.solveV9CompatibilityIssue();

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

        this.createIndicator();

        if (this._dbus) this._dbus.disable();
        this._dbus = new DBus();
        this._dbus.enable(this);

        OverriddenWindowMenu.enable();
        OverriddenWindowMenu.get().connect(
            'tile-clicked',
            (_, tile: Tile, window: Meta.Window) => {
                const monitorIndex = window.get_monitor();
                const manager = this._tilingManagers[monitorIndex];
                if (manager) manager.onTileFromWindowMenu(tile, window);
            },
        );

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
                this._onKeyboardMoveWin.bind(this),
            );
        }

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
    }

    private _onKeyboardMoveWin(
        kb: KeyBindings,
        display: Meta.Display,
        direction: Meta.DisplayDirection,
    ) {
        const focus_window = display.get_focus_window();
        if (
            !focus_window ||
            !focus_window.has_focus() ||
            (focus_window.get_wm_class() &&
                focus_window.get_wm_class() === 'gjs')
        )
            return;

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

        // @ts-expect-error "Main.wm has skipNextEffect function"
        Main.wm.skipNextEffect(focus_window.get_compositor_private());
        focus_window.move_to_monitor(neighborMonitorIndex);
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

        OverriddenWindowMenu.disable();
        debug('extension is disabled');
    }
}
