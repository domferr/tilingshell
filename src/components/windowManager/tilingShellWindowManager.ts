import { registerGObjectClass } from '@utils/gjs';
import { logger } from '@utils/logger';
import SignalHandling from '@utils/signalHandling';
import { GObject, Meta, Mtk, Clutter, Graphene } from '@gi.ext';

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
        if (this._is_initialized) {
            if (this.maximized && !newMaximized)
                manager.emit('unmaximized', window);
            else if (!this.maximized && newMaximized)
                manager.emit('maximized', window);
        }

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
            maximized: {
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

    public static easeMoveWindow(params: {
        window: Meta.Window;
        from: Mtk.Rectangle;
        to: Mtk.Rectangle;
        duration: number;
        monitorIndex?: number;
    }): void {
        const winActor =
            params.window.get_compositor_private() as Meta.WindowActor;
        if (!winActor) return;

        // create a clone and hide the window actor
        // then we can change the actual window size
        // without showing that to the user
        const winRect = params.window.get_frame_rect();
        const xExcludingShadow = winRect.x - winActor.get_x();
        const yExcludingShadow = winRect.y - winActor.get_y();
        const staticClone = new Clutter.Clone({
            source: winActor,
            reactive: false,
            scale_x: 1,
            scale_y: 1,
            x: params.from.x,
            y: params.from.y,
            width: params.from.width,
            height: params.from.height,
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
        });
        global.windowGroup.add_child(staticClone);
        winActor.opacity = 0;
        staticClone.ease({
            x: params.to.x - xExcludingShadow,
            y: params.to.y - yExcludingShadow,
            width: params.to.width + 2 * yExcludingShadow,
            height: params.to.height + 2 * xExcludingShadow,
            duration: params.duration,
            onStopped: () => {
                winActor.opacity = 255;
                winActor.set_scale(1, 1);
                staticClone.destroy();
            },
        });
        // finally move the window
        // the actor has opacity = 0, so this is not seen by the user
        winActor.set_pivot_point(0, 0);
        winActor.set_position(params.to.x, params.to.y);
        winActor.set_size(params.to.width, params.to.height);
        const user_op = false;
        if (params.monitorIndex)
            params.window.move_to_monitor(params.monitorIndex);
        params.window.move_frame(user_op, params.to.x, params.to.y);
        params.window.move_resize_frame(
            user_op,
            params.to.x,
            params.to.y,
            params.to.width,
            params.to.height,
        );
        // while we hide the preview, show the actor to the new position,
        // this has opacity of 0 so it is hidden. Later we immediately swap
        // the animating actor with this
        winActor.show();
    }
}
