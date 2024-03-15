type ObjectWithSignals = { connect: (...args: any[]) => number, disconnect: (id: number) => void }

export default class SignalHandling {
    
    private readonly _signalsIds: {[key: string]: { id: number, obj: ObjectWithSignals } };

    constructor() {
        this._signalsIds = {};
    }

    public connect(obj: ObjectWithSignals, key: string, fun: (...args: any[]) => void) {
        const signalId = obj.connect(key, fun);
        this._signalsIds[key] = { id: signalId, obj: obj };
    }

    public disconnect() {
        Object.keys(this._signalsIds).forEach(key => {
            this._signalsIds[key].obj.disconnect(this._signalsIds[key].id);
            delete this._signalsIds[key];
        });
    }
}