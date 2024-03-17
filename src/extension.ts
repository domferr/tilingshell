import './styles/stylesheet.scss';

import { Indicator } from '@/indicator/indicator';
import { logger } from '@/utils/shell';
import { Main, addToStatusArea, getMonitors } from '@/utils/ui';
import { getCurrentExtension } from '@/utils/shell';
import { TilingManager } from "@/components/tilingManager";
import { Rectangle } from '@gi-types/meta10';
import { SettingsBindFlags } from '@gi-types/gio2';
import Settings from '@/settings';
import SignalHandling from './signalHandling';
import { Layout } from './components/layout/Layout';

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
  }

  enable(): void {
    Settings.initialize();
    
    //@ts-ignore
    if (Main.layoutManager._startingUp) {
      this._signals.connect(Main.layoutManager, 'startup-complete', () => {
        debug("startup complete!");
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
        Settings.set_selected_layouts(indexes);
        
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
    debug('extension is disabled');
  }
}

export default function (): Extension {
  imports.misc.extensionUtils.initTranslations(getCurrentExtension().metadata.uuid);
  return new Extension();
}
