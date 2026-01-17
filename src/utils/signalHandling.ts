type ObjectWithSignals = {
    connect: (..._args: any[]) => number;
    disconnect: (_id: number) => void;
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

        return signalId;
    }

    public disconnect(): boolean;
    public disconnect(_obj: ObjectWithSignals): boolean;
    public disconnect(obj?: ObjectWithSignals) {
        if (!obj) {
            const toDelete: string[] = [];
            Object.keys(this._signalsIds).forEach((key) => {
                this._signalsIds[key].obj.disconnect(this._signalsIds[key].id);
                toDelete.push(key);
            });
            const result = toDelete.length > 0;
            toDelete.forEach((key) => delete this._signalsIds[key]);
            return result;
        } else {
            const keyFound = Object.keys(this._signalsIds).find(
                (key) => this._signalsIds[key].obj === obj,
            );
            if (keyFound) {
                obj.disconnect(this._signalsIds[keyFound].id);
                delete this._signalsIds[keyFound];
            }
            return keyFound;
        }
    }
}
