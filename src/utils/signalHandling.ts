type ObjectWithSignals = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connect: (...args: any[]) => number;
    disconnect: (id: number) => void;
};

export default class SignalHandling {
    private readonly _signalsIds: {
        [key: string]: { id: number; obj: ObjectWithSignals };
    };

    constructor() {
        this._signalsIds = {};
    }

    public connect(
        obj: ObjectWithSignals,
        key: string,
        fun: (..._args: never[]) => void,
    ) {
        const signalId = obj.connect(key, fun);
        this._signalsIds[key] = { id: signalId, obj };
    }

    public disconnect(): void;
    public disconnect(obj: ObjectWithSignals): void;
    public disconnect(obj?: ObjectWithSignals) {
        if (!obj) {
            const toDelete: string[] = [];
            Object.keys(this._signalsIds).forEach((key) => {
                this._signalsIds[key].obj.disconnect(this._signalsIds[key].id);
            });
            toDelete.forEach((key) => delete this._signalsIds[key]);
        } else {
            const keyFound = Object.keys(this._signalsIds).find(
                (key) => this._signalsIds[key].obj === obj,
            );
            if (keyFound) {
                obj.disconnect(this._signalsIds[keyFound].id);
                delete this._signalsIds[keyFound];
            }
        }
    }
}
