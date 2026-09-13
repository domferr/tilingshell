/**
 * Deterministic clock for the mutter simulation: GLib timeouts and Clutter
 * transitions both complete from `tick()`, in the order they are due.
 */
export type TimeoutId = number;

interface Scheduled {
    id: TimeoutId;
    at: number;
    seq: number;
    cb: () => void;
}

export class SimClock {
    now = 0;
    private _next = 1;
    private _seq = 0;
    private _scheduled: Scheduled[] = [];

    timeout(ms: number, cb: () => void): TimeoutId {
        const id = this._next++;
        this._scheduled.push({ id, at: this.now + ms, seq: this._seq++, cb });
        return id;
    }

    cancel(id: TimeoutId): boolean {
        const before = this._scheduled.length;
        this._scheduled = this._scheduled.filter((s) => s.id !== id);
        return this._scheduled.length !== before;
    }

    get pendingTimeouts(): number {
        return this._scheduled.length;
    }

    /** Advance time, running everything that becomes due, in due order. */
    tick(ms: number): void {
        const until = this.now + ms;
        for (;;) {
            const due = this._scheduled
                .filter((s) => s.at <= until)
                .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
            if (!due) break;
            this._scheduled = this._scheduled.filter((s) => s.id !== due.id);
            this.now = Math.max(this.now, due.at);
            due.cb();
        }
        this.now = until;
    }
}
