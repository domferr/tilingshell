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

/** The bits of Meta.Window the placer needs. */
export interface PlacementTarget {
    /** identity of the underlying window, used as a WeakMap key */
    readonly key: object;
    /** false once the compositor actor is gone (before/after unmanage) */
    isAlive(): boolean;
    getFrameRect(): Rect;
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
}

export type PlaceResult =
    | 'requested'
    | 'requested-move-only'
    | 'skipped-identical'
    | 'skipped-settled'
    | 'skipped-dead'
    | 'coalesced';

export interface PlacerOptions {
    monitorIndex: number;
    /** give up waiting for the client after this long */
    settleTimeoutMs: number;
    /** after a geometry change that is not yet the target, wait this long for more */
    quietMs: number;
    animationMs: number;
}

interface Pending {
    dest: Rect;
    before: Rect;
    animate: boolean;
    disconnectGeometry: () => void;
    disconnectGone: () => void;
    timeout: unknown;
    quiet: unknown;
}

interface History {
    lastRequested?: Rect;
    settledFrame?: Rect;
    pending?: Pending;
}

export class WindowPlacer {
    private readonly _opts: PlacerOptions;
    private readonly _history = new WeakMap<object, History>();
    private readonly _inFlight = new Set<PlacementTarget>();

    /** Called once a request settled, with what was asked and what the client gave. */
    public onSettled?: (
        target: PlacementTarget,
        requested: Rect,
        actual: Rect,
    ) => void;

    constructor(
        private readonly _clock: PlacerClock,
        opts: Partial<PlacerOptions> = {},
    ) {
        this._opts = {
            monitorIndex: 0,
            settleTimeoutMs: 300,
            quietMs: 40,
            animationMs: 250,
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

        if (rectEquals(frame, dest)) {
            hist.lastRequested = copyRect(dest);
            hist.settledFrame = copyRect(frame);
            return 'skipped-identical';
        }

        if (hist.pending && rectEquals(hist.pending.dest, dest))
            return 'coalesced';

        const sameAsLast =
            hist.lastRequested !== undefined &&
            rectEquals(hist.lastRequested, dest) &&
            hist.settledFrame !== undefined;
        if (sameAsLast && rectEquals(frame, hist.settledFrame!)) {
            // the client already answered exactly this request with this
            // frame and nothing moved it since; mutter would drop the
            // configure anyway (meta-window-wayland.c: equivalent
            // configurations are not re-sent), so do not wait on it
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

        this._request(target, hist, dest, dest, frame, options, userOp);
        return 'requested';
    }

    /** Drop everything known about a window (it is no longer managed). */
    public forget(target: PlacementTarget): void {
        const hist = this._history.get(target.key);
        if (hist?.pending) this._cancelPending(hist);
        this._history.delete(target.key);
        this._inFlight.delete(target);
    }

    public destroy(): void {
        for (const target of [...this._inFlight]) this.forget(target);
        this.onSettled = undefined;
    }

    private _request(
        target: PlacementTarget,
        hist: History,
        dest: Rect,
        request: Rect,
        before: Rect,
        options: PlaceOptions,
        userOp: boolean,
    ): void {
        // a newer request supersedes the previous one, but the animation
        // still starts from where the window was before the first of them
        const earlierBefore = hist.pending?.before;
        if (hist.pending) this._cancelPending(hist);
        target.getActor()?.cancelTransitions();

        const pending: Pending = {
            dest: copyRect(dest),
            before: copyRect(earlierBefore ?? before),
            animate: options.animate ?? false,
            disconnectGeometry: () => {},
            disconnectGone: () => {},
            timeout: null,
            quiet: null,
        };
        hist.pending = pending;
        this._inFlight.add(target);

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
                actor.setTransform(
                    before.width / frame.width,
                    before.height / frame.height,
                    before.x - frame.x,
                    before.y - frame.y,
                );
                actor.easeToIdentity(this._opts.animationMs, () => {
                    // whether it finished or was cancelled, never leave a
                    // transform behind
                    actor.setTransform(1, 1, 0, 0);
                });
            }
        }

        this.onSettled?.(target, pending.dest, frame);
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
        let hist = this._history.get(target.key);
        if (!hist) {
            hist = {};
            this._history.set(target.key, hist);
        }
        return hist;
    }
}
