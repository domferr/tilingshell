/**
 * Guards a reflow against re-entrancy. Placing windows emits signals
 * synchronously (`position-changed`, `size-changed`, `unmanaged`) whose
 * handlers may ask for another reflow while the current one is still
 * iterating over its snapshot of windows and rects. Running that nested
 * reflow immediately would place windows twice in one tick with two
 * different answers; instead it is deferred to one idle follow-up.
 */
export class ReflowScheduler {
    private _running = false;
    private _pending = false;

    constructor(private readonly _queueIdle: () => void) {}

    get isRunning(): boolean {
        return this._running;
    }

    run(reflow: () => void): 'ran' | 'deferred' {
        if (this._running) {
            this._pending = true;
            return 'deferred';
        }
        this._running = true;
        try {
            reflow();
        } finally {
            this._running = false;
        }
        if (this._pending) {
            this._pending = false;
            this._queueIdle();
        }
        return 'ran';
    }
}
