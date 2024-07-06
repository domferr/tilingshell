// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ObjectWithSignals = { connect: (...args: any[]) => number, disconnect: (id: number) => void }

export default class SignalHandling {
    
    private readonly _signalsIds: {[key: string]: { id: number, obj: ObjectWithSignals } };

    constructor() {
        this._signalsIds = {};
    }

    public connect(obj: ObjectWithSignals, key: string, fun: (...args: never[]) => void) {
        const signalId = obj.connect(key, fun);
        this._signalsIds[key] = { id: signalId, obj: obj };
    }

    public disconnect(): void;
    public disconnect(obj: ObjectWithSignals) : void;
    public disconnect(obj?: ObjectWithSignals) {
        if (!obj) {
            Object.keys(this._signalsIds).forEach(key => {
                this._signalsIds[key].obj.disconnect(this._signalsIds[key].id);
                delete this._signalsIds[key];
            });
        } else {
            const keyFound = Object.keys(this._signalsIds).find(key => this._signalsIds[key].obj === obj);
            if (keyFound) {
                obj.disconnect(this._signalsIds[keyFound].id);
                delete this._signalsIds[keyFound];
            }
        }
    }
}