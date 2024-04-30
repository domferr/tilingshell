import './styles/stylesheet.scss';

import { logger } from '@/utils/shell';
import { getMonitors } from '@/utils/ui';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { TilingManager } from "@/components/tilingsystem/tilingManager";
import Gio from 'gi://Gio';
import Settings from '@/settings';
import SignalHandling from './signalHandling';
import GlobalState from './globalState';
import Indicator from './indicator/indicator';
import { Extension, ExtensionMetadata } from 'resource:///org/gnome/shell/extensions/extension.js';

const SIGNAL_WORKAREAS_CHANGED = 'workareas-changed';
const debug = logger('extension');

export default class MWMExtension extends Extension {
  private _indicator: Indicator | null = null;
  private _tilingManagers: TilingManager[] = [];
  private _fractionalScalingEnabled: boolean;
  private _mutterSettings: Gio.Settings | null = null;

  private readonly _signals: SignalHandling;

  constructor(metadata: ExtensionMetadata) {
    super(metadata);
    this._signals = new SignalHandling();
    this._fractionalScalingEnabled = false;
  }

  createIndicator() {
    this._indicator = new Indicator(this.path, this.uuid);
    this._indicator.enableScaling = !this._fractionalScalingEnabled;
    this._indicator.enable();
  }

  private _validateSettings() {
    // Setting used for compatibility changes if necessary
    // Settings.get_last_version_installed()
    if (this.metadata.version) {
      Settings.set_last_version_installed(Number(this.metadata.version));
    }

    const selectedLayouts = Settings.get_selected_layouts();
    const monitors = getMonitors();
    const layouts = GlobalState.get().layouts;

    if (selectedLayouts.length === 0) selectedLayouts.push(layouts[0].id);
    while (monitors.length < selectedLayouts.length) {
      selectedLayouts.pop();
    }
    while (monitors.length > selectedLayouts.length) {
      selectedLayouts.push(selectedLayouts[0]);
    }

    for (let i = 0; i < selectedLayouts.length; i++) {
      if (layouts.findIndex(lay => lay.id === selectedLayouts[i]) === -1) {
        selectedLayouts[i] = selectedLayouts[0];
      }
    }
    Settings.save_selected_layouts_json(selectedLayouts);
  }

  enable(): void {
    Settings.initialize(this.getSettings());
    this._validateSettings();

    this._mutterSettings = new Gio.Settings({ schema: 'org.gnome.mutter' });
    this._fractionalScalingEnabled = this._isFractionalScalingEnabled();

    //@ts-ignore
    if (Main.layoutManager._startingUp) {
      this._signals.connect(Main.layoutManager, 'startup-complete', () => {
        this._createTilingManagers();
        this._setupSignals();
      });
    } else {
      this._createTilingManagers();
      this._setupSignals();
    }

    this.createIndicator();

    debug('extension is enabled');
  }

  private _createTilingManagers() {
    debug('building a tiling manager for each monitor');
    this._tilingManagers.forEach(tm => tm.destroy());
    this._tilingManagers = getMonitors().map(monitor => new TilingManager(monitor, !this._fractionalScalingEnabled));
    this._tilingManagers.forEach(tm => tm.enable());
  }

  private _setupSignals() {
    this._signals.connect(global.display, SIGNAL_WORKAREAS_CHANGED, () => {
      const allMonitors = getMonitors();
      if (this._tilingManagers.length !== allMonitors.length) {
        // a monitor was disconnected or a new one was connected
        // update the index of selected layouts
        const oldIndexes = Settings.get_selected_layouts();
        const indexes = allMonitors.map(monitor => {
          // If there is a new monitor, give the same layout as the first monitor
          if (monitor.index >= oldIndexes.length) return GlobalState.get().layouts[0].id;
          return oldIndexes[monitor.index];
        })
        Settings.save_selected_layouts_json(indexes);
      }
      
      this._createTilingManagers();
    });

    if (this._mutterSettings) {
      this._signals.connect(this._mutterSettings, 'changed::experimental-features', () => {
        if (!this._mutterSettings) return;

        const fractionalScalingEnabled = this._isFractionalScalingEnabled();
        
        if (this._fractionalScalingEnabled === fractionalScalingEnabled) return;

        this._fractionalScalingEnabled = fractionalScalingEnabled;
        this._createTilingManagers();
        if (this._indicator) this._indicator.enableScaling = !this._fractionalScalingEnabled;
      });
    }
  }

  private _isFractionalScalingEnabled(): boolean {
    if (!this._mutterSettings) return false;

    return this._mutterSettings.get_strv('experimental-features')
          .find(feat => feat === "scale-monitor-framebuffer" || feat === "x11-randr-fractional-scaling") != undefined;
  }

  disable(): void {
    this._indicator?.destroy();
    this._indicator = null;
    this._tilingManagers.forEach(tm => tm.destroy());
    this._tilingManagers = [];
    this._signals.disconnect();
    GlobalState.destroy();
    this._mutterSettings = null;
    this._fractionalScalingEnabled = false;
    debug('extension is disabled');
  }
}
