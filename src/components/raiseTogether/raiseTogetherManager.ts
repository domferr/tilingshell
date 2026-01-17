import { Meta } from '../../gi/ext';
import SignalHandling from '../../utils/signalHandling';
import Settings from '../../settings/settings';
import { getWindows } from '../../utils/ui';
import ExtendedWindow from '../tilingsystem/extendedWindow';

export class RaiseTogetherManager {
    private readonly _signals: SignalHandling;
    private readonly _raiseId: { [windowId: string]: { id: number, win: Meta.Window } }; // map window id to 'raised' signal id

    constructor() {
        this._signals = new SignalHandling();
        this._raiseId = {};
    }

    public enable(): void {
        if (Settings.RAISE_TOGETHER) this._turnOn();

        // enable/disable based on user preferences
        this._signals.connect(Settings, Settings.KEY_RAISE_TOGETHER, () => {
            if (Settings.RAISE_TOGETHER) this._turnOn();
            else this._turnOff();
        });
    }

    public destroy() {
        this._signals.disconnect();

        const toDelete: string[] = [];
        Object.keys(this._raiseId).forEach((key) => {
            this._raiseId[key].win.disconnect(this._raiseId[key].id);
            toDelete.push(key);
        });
        toDelete.forEach((key) => delete this._raiseId[key]);
    }

    public _turnOn() {
        getWindows().forEach((win) => this._connectRaisedSignal(win));

        this._signals.connect(
            global.display,
            'window-created',
            (_display: Meta.Display, window: Meta.Window) => {
                this._connectRaisedSignal(window);
            },
        );
    }

    private _turnOff() {
        this.destroy();
        this.enable();
    }

    private _connectRaisedSignal(window: Meta.Window) {
        const raisedId = this._signals.connect(window, "raised", () => {
            if (!(window as ExtendedWindow).assignedTile) return; // window not tiled

            this._onTiledWindowRaised(window);
        });
        this._raiseId[window.get_id()] = { id: raisedId, win: window };
        window.connect("unmanaged", () => {
            delete this._raiseId[window.get_id()];
        });
    }

    private _onTiledWindowRaised(tiledWindow: Meta.Window) {
        const workspace = tiledWindow.get_workspace();
        getWindows(workspace).forEach(winSameWorkspace => {
            if (!(winSameWorkspace as ExtendedWindow).assignedTile) return; // window not tiled

            this._stopRaiseSignalHandling(winSameWorkspace);
            winSameWorkspace.raise();
            this._restartRaiseSignalHandling(winSameWorkspace);
        });

        this._stopRaiseSignalHandling(tiledWindow);
        tiledWindow.raise();
        this._restartRaiseSignalHandling(tiledWindow);
    }

    private _stopRaiseSignalHandling(window: Meta.Window) {
        const data = this._raiseId[window.get_id()];
        if (!data) return;

        window.block_signal_handler(data.id);
    }

    private _restartRaiseSignalHandling(window: Meta.Window) {
        const data = this._raiseId[window.get_id()];
        if (!data) return;

        window.unblock_signal_handler(data.id);
    }
}
