import './styles/stylesheet.scss';

import Indicator from '@/indicator/indicator';
import { logger } from '@/utils/shell';
import { Main, addToStatusArea, getMonitors } from '@/utils/ui';
import { getCurrentExtension } from '@/utils/shell';
import { TilingManager } from "@/components/tilingsystem/tilingManager";
import { Rectangle } from '@gi-types/meta10';
import { SettingsBindFlags } from '@gi-types/gio2';
import Settings from '@/settings';
import SignalHandling from './signalHandling';
import GlobalState from './globalState';

const SIGNAL_WORKAREAS_CHANGED = 'workareas-changed';
const debug = logger('extension');

class Extension {
  private _indicator: Indicator | null = null;
  private _tilingManagers: TilingManager[] = [];

  private readonly _signals: SignalHandling;
  
  constructor() {
    this._signals = new SignalHandling();
  }

  createIndicator() {
    this._indicator = new Indicator();
    addToStatusArea(this._indicator);

    // Bind the "show-indicator" setting to the "visible" property.
    //@ts-ignore
    Settings.bind('show-indicator', this._indicator, 'visible', SettingsBindFlags.DEFAULT);
    this._indicator.enable();
  }

  private _validateSettings() {
    // Setting used for compatibility changes if necessary
    // Settings.get_last_version_installed()
    Settings.set_last_version_installed(getCurrentExtension().metadata.version);
    
    const selectedLayouts = Settings.get_selected_layouts();
    const monitors = getMonitors();
    const layouts = GlobalState.get().layouts;

    if (selectedLayouts.length === 0) selectedLayouts.push(layouts[0].id);
    while (monitors.length < selectedLayouts.length) {
      selectedLayouts.pop();
    }
    while(monitors.length > selectedLayouts.length) {
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
    Settings.initialize();
    this._validateSettings();

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
    this._tilingManagers = getMonitors().map(monitor => new TilingManager(monitor));
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
          // If there is a new monitor, give the same layout as the primary monitor
          if (monitor.index >= oldIndexes.length) return oldIndexes[imports.ui.main.layoutManager.primaryIndex];
          return oldIndexes[monitor.index];
        })
        Settings.save_selected_layouts_json(indexes);
        
        this._createTilingManagers();
      } else {
        // same number of monitors, but one or more workareas changed
        allMonitors.forEach(monitor => {
          const newWorkArea: Rectangle = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
          this._tilingManagers[monitor.index].workArea = newWorkArea;
        });
      }
    });
  }

  disable(): void {
    this._indicator?.destroy();
    this._indicator = null;
    this._tilingManagers.forEach(tm => tm.destroy());
    this._tilingManagers = [];
    this._signals.disconnect();
    GlobalState.destroy();
    debug('extension is disabled');
  }
}

export default function (): Extension {
  imports.misc.extensionUtils.initTranslations(getCurrentExtension().metadata.uuid);
  return new Extension();
}
