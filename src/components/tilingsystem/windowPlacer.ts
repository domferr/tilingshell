/**
 * Placement policy for tiled windows, kept free of GNOME imports so it can be
 * driven both by the extension (through `metaPlacementTarget.ts`) and by the
 * mutter simulation under `test/mutter-sim`.
 *
 * Why this exists: on Wayland, `Meta.Window.move_resize_frame()` is a request.
 * mutter sends the client a configure and applies whatever size the client
 * answers with; a client is free to clamp (Brave, WhatsApp) or to ignore it,
 * and mutter does not even re-send a configure equivalent to the last one.
 * The previous implementation froze the window actor through GNOME Shell's
 * private `_prepareAnimationInfo` and waited for a `size-changed` that in
 * those cases never comes, leaving the actor frozen at its old geometry.
 *
 * This placer never freezes anything. It remembers, per window, the last rect
 * it asked for and the frame the client settled on in answer, so a request the
 * client already refused is not repeated, and it animates by transforming the
 * real actor from its previous geometry once mutter reports the new one.
 */

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const rectEquals = (a: Rect, b: Rect): boolean =>
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const sizeEquals = (a: Rect, b: Rect): boolean =>
    a.width === b.width && a.height === b.height;

const copyRect = (r: Rect): Rect => ({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
});

/** The bits of the window actor the placer animates. */
export interface PlacementActor {
    setTransform(scaleX: number, scaleY: number, tx: number, ty: number): void;
    easeToIdentity(
        durationMs: number,
        onStopped: (finished: boolean) => void,
    ): void;
    cancelTransitions(): void;
}

/**
 * The bits of Meta.Window the placer needs. One target per window: the
 * placer keeps its per-window history keyed by the target object.
 */
export interface PlacementTarget {
    /** false once the compositor actor is gone (before/after unmanage) */
    isAlive(): boolean;
    getFrameRect(): Rect;
    /** frame plus client-side decorations/shadows; the actor's own rect */
    getBufferRect(): Rect;
    moveToMonitor(index: number): void;
    moveFrame(userOp: boolean, x: number, y: number): void;
    moveResizeFrame(userOp: boolean, rect: Rect): void;
    getActor(): PlacementActor | null;
    /** size-changed + position-changed; returns the disconnect function */
    onGeometryChanged(cb: () => void): () => void;
    /** unmanaging; returns the disconnect function */
    onGone(cb: () => void): () => void;
}

export interface PlacerClock {
    timeout(ms: number, cb: () => void): unknown;
    cancel(handle: unknown): void;
}

export interface PlaceOptions {
    userOp?: boolean;
    /** also call move_frame first (GNOME 42 restart-grab path) */
    forceMove?: boolean;
    animate?: boolean;
    /**
     * Called once this request settled — not if it was superseded — with the
     * rect that was asked for and the frame the client actually ended on.
     */
    onSettled?: (requested: Rect, actual: Rect) => void;
}

export type PlaceResult =
    | 'requested'
    | 'requested-move-only'
    | 'skipped-identical'
    | 'skipped-settled'
    | 'skipped-dead'
    | 'coalesced';

export interface PlacerOptions {
    /**
     * Every request first moves the window to this monitor, preserving the
     * move_to_monitor → move_frame → move_resize_frame order the extension
     * has always used.
     */
    monitorIndex: number;
    /** give up waiting for the client after this long */
    settleTimeoutMs: number;
    /** after a geometry change that is not yet the target, wait this long for more */
    quietMs: number;
    animationMs: number;
    /**
     * When the client settled on a different size than asked, ask again after
     * each of these delays (some clients, e.g. Brave right after start-up,
     * refuse a size once and accept it a moment later). Empty disables.
     */
    retryDelaysMs: number[];
    /**
     * After a request settled, watch the window for this long: a client that
     * resizes itself away from what it accepted is put back once.
     */
    driftWatchMs: number;
}

interface Pending {
    dest: Rect;
    before: Rect;
    animate: boolean;
    onSettled?: (requested: Rect, actual: Rect) => void;
    disconnectGeometry: () => void;
    disconnectGone: () => void;
    timeout: unknown;
    quiet: unknown;
}

interface History {
    lastRequested?: Rect;
    settledFrame?: Rect;
    pending?: Pending;
    /** retries already spent on `lastRequested` */
    retries: number;
    retryTimeout: unknown;
    watch?: { disconnect: () => void; timeout: unknown; quiet: unknown };
    /** the options of the request being verified, reused by retries */
    lastOptions?: PlaceOptions;
}

export class WindowPlacer {
    private readonly _opts: PlacerOptions;
    private readonly _history = new WeakMap<PlacementTarget, History>();
    private readonly _inFlight = new Set<PlacementTarget>();

    constructor(
        private readonly _clock: PlacerClock,
        opts: Partial<PlacerOptions> = {},
    ) {
        this._opts = {
            monitorIndex: 0,
            settleTimeoutMs: 300,
            quietMs: 40,
            animationMs: 250,
            retryDelaysMs: [1000, 3000],
            driftWatchMs: 10_000,
            ...opts,
        };
    }

    public place(
        target: PlacementTarget,
        dest: Rect,
        options: PlaceOptions = {},
    ): PlaceResult {
        if (!target.isAlive()) return 'skipped-dead';

        const hist = this._historyOf(target);
        const frame = target.getFrameRect();

        if (hist.pending && rectEquals(hist.pending.dest, dest))
            return 'coalesced';

        // a different rect makes whatever was being verified moot; the same
        // rect keeps its pending retry (a reflow re-asking for it must not
        // silently drop the one chance the client gets)
        if (
            hist.lastRequested === undefined ||
            !rectEquals(hist.lastRequested, dest)
        ) {
            this._cancelVerification(hist);
            hist.retries = 0;
        }

        // a pending request for another rect is about to move the window
        // away from `dest`, so "already there" only holds without one
        if (rectEquals(frame, dest) && !hist.pending) {
            hist.lastRequested = copyRect(dest);
            hist.settledFrame = copyRect(frame);
            return 'skipped-identical';
        }

        const sameAsLast =
            hist.lastRequested !== undefined &&
            rectEquals(hist.lastRequested, dest) &&
            hist.settledFrame !== undefined;
        if (sameAsLast && rectEquals(frame, hist.settledFrame!)) {
            // the client already answered exactly this request with this
            // frame and nothing moved it since; mutter would drop the
            // configure anyway (meta-window-wayland.c: equivalent
            // configurations are not re-sent), so do not wait on it.
            // Known limitation: a client whose constraints relax later
            // (a collapsed sidebar, a changed min size) is only asked
            // again once its frame or its tile changes.
            return 'skipped-settled';
        }

        const userOp = options.userOp ?? false;
        if (
            sameAsLast &&
            sizeEquals(frame, hist.settledFrame!) &&
            (frame.x !== dest.x || frame.y !== dest.y)
        ) {
            // the client refused this size before but the window has been
            // moved off its tile: ask for the position back at the size the
            // client accepted. That is a new configuration, so it is sent.
            const request = {
                x: dest.x,
                y: dest.y,
                width: frame.width,
                height: frame.height,
            };
            this._request(target, hist, dest, request, frame, options, userOp);
            return 'requested-move-only';
        }

        // the same rect as last time but the window changed on its own since
        // (e.g. a browser restoring its saved size after start-up): mutter
        // still remembers `dest` as the last configuration it sent and would
        // drop an identical one, so nudge it with a rect one pixel wider
        // first; the real configure is then not equivalent to the previous
        // one and goes out
        this._request(
            target,
            hist,
            dest,
            dest,
            frame,
            options,
            userOp,
            sameAsLast,
        );
        return 'requested';
    }

    /** Drop everything known about a window (it is no longer managed). */
    public forget(target: PlacementTarget): void {
        const hist = this._history.get(target);
        if (hist) {
            this._cancelPending(hist);
            this._cancelVerification(hist);
        }
        this._history.delete(target);
        this._inFlight.delete(target);
    }

    public destroy(): void {
        for (const target of [...this._inFlight]) this.forget(target);
    }

    private _request(
        target: PlacementTarget,
        hist: History,
        dest: Rect,
        request: Rect,
        before: Rect,
        options: PlaceOptions,
        userOp: boolean,
        nudge = false,
    ): void {
        // a newer request supersedes the previous one, but the animation
        // still starts from where the window was before the first of them
        const earlierBefore = hist.pending?.before;
        if (hist.pending) this._cancelPending(hist);
        this._cancelVerification(hist);
        const animate = options.animate ?? false;
        // only an animated placement owns the actor's transitions; a plain
        // one must not cut short e.g. gnome-shell's map animation
        if (animate) target.getActor()?.cancelTransitions();

        hist.lastOptions = options;
        const pending: Pending = {
            dest: copyRect(dest),
            before: copyRect(earlierBefore ?? before),
            animate,
            onSettled: options.onSettled,
            disconnectGeometry: () => {},
            disconnectGone: () => {},
            timeout: null,
            quiet: null,
        };
        hist.pending = pending;
        this._inFlight.add(target);

        // handlers go in before the request: an X11 client (or a pure move)
        // can settle synchronously inside moveResizeFrame
        pending.disconnectGeometry = target.onGeometryChanged(() => {
            if (hist.pending !== pending) return;
            if (rectEquals(target.getFrameRect(), pending.dest)) {
                this._settle(target, hist, pending);
                return;
            }
            // the client answered with something else (or only moved so
            // far): give it a moment to finish before judging
            if (pending.quiet !== null) this._clock.cancel(pending.quiet);
            pending.quiet = this._clock.timeout(this._opts.quietMs, () => {
                pending.quiet = null;
                this._settle(target, hist, pending);
            });
        });
        pending.disconnectGone = target.onGone(() => {
            if (hist.pending === pending) this.forget(target);
        });
        pending.timeout = this._clock.timeout(
            this._opts.settleTimeoutMs,
            () => {
                pending.timeout = null;
                if (hist.pending === pending)
                    this._settle(target, hist, pending);
            },
        );

        target.moveToMonitor(this._opts.monitorIndex);
        if (options.forceMove) target.moveFrame(userOp, request.x, request.y);
        if (nudge)
            target.moveResizeFrame(userOp, {
                ...request,
                width: request.width + 1,
            });
        target.moveResizeFrame(userOp, request);
    }

    private _settle(
        target: PlacementTarget,
        hist: History,
        pending: Pending,
    ): void {
        this._cancelPending(hist);
        this._inFlight.delete(target);
        if (!target.isAlive()) return;

        const frame = target.getFrameRect();
        hist.lastRequested = copyRect(pending.dest);
        hist.settledFrame = copyRect(frame);

        if (pending.animate && !rectEquals(pending.before, frame)) {
            const actor = target.getActor();
            if (actor) {
                const before = pending.before;
                const scaleX = before.width / frame.width;
                const scaleY = before.height / frame.height;
                // the actor is scaled about the buffer's origin, which sits
                // extents.left/top outside the frame; keep the visual frame
                // edge where the old frame was
                const buffer = target.getBufferRect();
                const left = frame.x - buffer.x;
                const top = frame.y - buffer.y;
                actor.setTransform(
                    scaleX,
                    scaleY,
                    before.x - frame.x + left * (1 - scaleX),
                    before.y - frame.y + top * (1 - scaleY),
                );
                actor.easeToIdentity(this._opts.animationMs, () => {
                    // whether it finished or was cancelled, never leave a
                    // transform behind
                    actor.setTransform(1, 1, 0, 0);
                });
            }
        }

        pending.onSettled?.(copyRect(pending.dest), copyRect(frame));

        this._verify(target, hist, pending.dest, frame);
    }

    /**
     * The client has answered. If it did not give the size that was asked
     * for, ask again a little later (bounded); once it has, keep an eye on it
     * for a while in case it changes its mind on its own.
     */
    private _verify(
        target: PlacementTarget,
        hist: History,
        dest: Rect,
        frame: Rect,
    ): void {
        const delays = this._opts.retryDelaysMs;
        if (!sizeEquals(frame, dest)) {
            if (hist.retries >= delays.length) return; // give up
            const delay = delays[hist.retries++];
            this._inFlight.add(target);
            hist.retryTimeout = this._clock.timeout(delay, () => {
                hist.retryTimeout = null;
                this._inFlight.delete(target);
                if (hist.pending || !target.isAlive()) return;
                this._request(
                    target,
                    hist,
                    dest,
                    dest,
                    target.getFrameRect(),
                    hist.lastOptions ?? {},
                    hist.lastOptions?.userOp ?? false,
                    true,
                );
            });
            return;
        }

        if (this._opts.driftWatchMs <= 0) return;
        const watch: NonNullable<History['watch']> = {
            disconnect: () => {},
            timeout: null,
            quiet: null,
        };
        hist.watch = watch;
        this._inFlight.add(target);
        const stop = () => {
            if (hist.watch !== watch) return;
            this._cancelVerification(hist);
            this._inFlight.delete(target);
        };
        watch.disconnect = target.onGeometryChanged(() => {
            if (hist.watch !== watch || hist.pending) return;
            if (sizeEquals(target.getFrameRect(), frame)) return;
            // the client changed its size on its own: let it finish, then
            // put it back once
            if (watch.quiet !== null) this._clock.cancel(watch.quiet);
            watch.quiet = this._clock.timeout(this._opts.quietMs, () => {
                watch.quiet = null;
                stop();
                if (!target.isAlive()) return;
                hist.retries = delays.length; // one correction, no retries
                this._request(
                    target,
                    hist,
                    dest,
                    dest,
                    target.getFrameRect(),
                    hist.lastOptions ?? {},
                    hist.lastOptions?.userOp ?? false,
                    true,
                );
            });
        });
        watch.timeout = this._clock.timeout(this._opts.driftWatchMs, () => {
            watch.timeout = null;
            stop();
        });
    }

    private _cancelVerification(hist: History): void {
        if (hist.retryTimeout !== null && hist.retryTimeout !== undefined) {
            this._clock.cancel(hist.retryTimeout);
            hist.retryTimeout = null;
        }
        const w = hist.watch;
        if (w) {
            hist.watch = undefined;
            w.disconnect();
            if (w.timeout !== null) this._clock.cancel(w.timeout);
            if (w.quiet !== null) this._clock.cancel(w.quiet);
        }
    }

    private _cancelPending(hist: History): void {
        const p = hist.pending;
        if (!p) return;
        hist.pending = undefined;
        p.disconnectGeometry();
        p.disconnectGone();
        if (p.timeout !== null) this._clock.cancel(p.timeout);
        if (p.quiet !== null) this._clock.cancel(p.quiet);
    }

    private _historyOf(target: PlacementTarget): History {
        let hist = this._history.get(target);
        if (!hist) {
            hist = { retries: 0, retryTimeout: null };
            this._history.set(target, hist);
        }
        return hist;
    }
}
