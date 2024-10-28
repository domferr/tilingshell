import { registerGObjectClass } from '@utils/gjs';
import { logger } from '@utils/logger';
import SignalHandling from '@utils/signalHandling';
import { GObject, Meta } from '@gi';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const debug = logger('TilingShellWindowManager');

class CachedWindowProperties {
    private _is_initialized: boolean = false;
    public maximized: boolean = false;

    constructor(window: Meta.Window, manager: TilingShellWindowManager) {
        this.update(window, manager);
        this._is_initialized = true;
    }

    public update(window: Meta.Window, manager: TilingShellWindowManager) {
        const newMaximized =
            window.maximizedVertically && window.maximizedHorizontally;
        if (this._is_initialized && this.maximized && !newMaximized)
            manager.emit('unmaximized', window);

        this.maximized = newMaximized;
    }
}

interface WindowWithCachedProps extends Meta.Window {
    __ts_cached: CachedWindowProperties | undefined;
}

@registerGObjectClass
export default class TilingShellWindowManager extends GObject.Object {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'TilingShellWindowManager',
        Signals: {
            unmaximized: {
                param_types: [Meta.Window.$gtype],
            },
        },
    };

    private static _instance: TilingShellWindowManager | null;

    private readonly _signals: SignalHandling;

    static get(): TilingShellWindowManager {
        if (!this._instance) this._instance = new TilingShellWindowManager();

        return this._instance;
    }

    static destroy() {
        if (this._instance) {
            this._instance._signals.disconnect();
            this._instance = null;
        }
    }

    constructor() {
        super();

        this._signals = new SignalHandling();
        global.get_window_actors().forEach((winActor) => {
            (winActor.metaWindow as WindowWithCachedProps).__ts_cached =
                new CachedWindowProperties(winActor.metaWindow, this);
        });

        this._signals.connect(
            global.windowManager,
            'minimize',
            (_, actor: Meta.WindowActor) => {
                (actor.metaWindow as WindowWithCachedProps).__ts_cached?.update(
                    actor.metaWindow,
                    this,
                );
            },
        );

        this._signals.connect(
            global.display,
            'window-created',
            (_, window: Meta.Window) => {
                (window as WindowWithCachedProps).__ts_cached =
                    new CachedWindowProperties(window, this);
            },
        );
        this._signals.connect(
            global.windowManager,
            'minimize',
            (_, actor: Meta.WindowActor) => {
                (actor.metaWindow as WindowWithCachedProps).__ts_cached?.update(
                    actor.metaWindow,
                    this,
                );
            },
        );
        this._signals.connect(
            global.windowManager,
            'unminimize',
            (_, actor: Meta.WindowActor) => {
                (actor.metaWindow as WindowWithCachedProps).__ts_cached?.update(
                    actor.metaWindow,
                    this,
                );
            },
        );
        this._signals.connect(
            global.windowManager,
            'size-changed',
            (_, actor: Meta.WindowActor) => {
                // TODO disable default window animations Main.wm.skipNextEffect(actor);
                (actor.metaWindow as WindowWithCachedProps).__ts_cached?.update(
                    actor.metaWindow,
                    this,
                );
            },
        );
    }
}
