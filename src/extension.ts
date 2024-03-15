import './styles/stylesheet.scss';

import { Indicator } from '@/indicator/indicator';
import { logger } from '@/utils/shell';
import { Main, addToStatusArea, getMonitors } from '@/utils/ui';
import { getCurrentExtension } from '@/utils/shell';
import { TilingManager } from "@/components/tilingManager";
import { LayoutsUtils } from './components/layout/LayoutUtils';
import { TileGroup } from './components/layout/tileGroup';
import { Rectangle } from '@gi-types/meta10';
import { SettingsBindFlags } from '@gi-types/gio2';
import Settings from '@/settings';
import SignalHandling from './signalHandling';

const SIGNAL_WORKAREAS_CHANGED = 'workareas-changed';
const debug = logger('extension');

class Extension {
  private _indicator: Indicator | null = null;
  private _tilingManagers: TilingManager[] = [];

  private readonly _signals: SignalHandling;
  
  constructor() {
    this._signals = new SignalHandling();
  }

  createIndicator(availableLayouts: TileGroup[]) {
    this._indicator = new Indicator((lay) => this.onLayoutSelected(lay));
    addToStatusArea(this._indicator);
    
    this._indicator.setLayouts(availableLayouts, 0);

    // Bind the "show-indicator" setting to the "visible" property.
    //@ts-ignore
    Settings.bind('show-indicator', this._indicator, 'visible', SettingsBindFlags.DEFAULT);
  }

  enable(): void {
    Settings.initialize();
    
    // for this version we have a custom layout plus three fixed ones
    const availableLayouts = LayoutsUtils.LoadLayouts();
    
    //@ts-ignore
    if (Main.layoutManager._startingUp) {
      this._signals.connect(Main.layoutManager, 'startup-complete', () => {
        debug("startup complete!");
        this._createTilingManagers(availableLayouts);
        this._setupSignals(availableLayouts);
      });
    } else {
        this._createTilingManagers(availableLayouts);
        this._setupSignals(availableLayouts);
    }

    this.createIndicator(availableLayouts);

    debug('extension is enabled');
  }
  
  private _createTilingManagers(availableLayouts: TileGroup[]) {
    debug('building a tiling manager for each monitor');
    this._tilingManagers.forEach(tm => tm.destroy());
    this._tilingManagers = getMonitors().map(monitor => new TilingManager(monitor, availableLayouts, 0));
    this._tilingManagers.forEach(tm => tm.enable());
  }

  private _setupSignals(availableLayouts: TileGroup[]) {
    this._signals.connect(global.display, SIGNAL_WORKAREAS_CHANGED, () => {
      const allMonitors = getMonitors();
      if (this._tilingManagers.length !== allMonitors.length) {
        // a monitor was disconnected or a new one was connected
        this._createTilingManagers(availableLayouts);
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

  onLayoutSelected(layout: TileGroup) {
    // notify to each monitors' tiling manager the new active layout
    this._tilingManagers.forEach(tm => tm.setActiveLayout(layout));
  }
}

export default function (): Extension {
  imports.misc.extensionUtils.initTranslations(getCurrentExtension().metadata.uuid);
  return new Extension();
}
