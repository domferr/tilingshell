/**
 * A deterministic model of the parts of mutter 50.4 that matter for window
 * placement on Wayland:
 *
 *  - MetaWindowActor freeze/thaw and geometry sync
 *    (src/compositor/meta-window-actor.c: meta_window_actor_sync_actor_geometry
 *    returns POSITION|SIZE *without applying* while frozen; thaw re-syncs)
 *  - the size-change effect accounting that logs
 *    "Error in size change accounting." when completed_size_change() is called
 *    more often than size_change() (meta_window_actor_effect_completed)
 *  - MetaWindow move/resize on Wayland
 *    (src/core/window.c meta_window_move_resize_internal +
 *    src/wayland/meta-window-wayland.c move_resize_internal / should_configure /
 *    finish_move_resize): a resize is a *request* answered by the client; a
 *    configuration equivalent to the last one sent is not re-sent; MOVED /
 *    RESIZED result flags decide whether the compositor syncs geometry, and
 *    only a geometry sync that reports a SIZE change emits shellwm
 *    'size-changed'.
 *  - a Wayland client with a pluggable ack policy.
 */
import { SimClock, TimeoutId } from './clock.ts';

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const rectEquals = (a: Rect, b: Rect): boolean =>
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const copy = (r: Rect): Rect => ({ ...r });

// ---------------------------------------------------------------- signals

type Handler = (...args: unknown[]) => void;

export class SignalBus<Name extends string> {
    private _handlers = new Map<number, { name: Name; cb: Handler }>();
    private _next = 1;

    connect(name: Name, cb: Handler): number {
        const id = this._next++;
        this._handlers.set(id, { name, cb });
        return id;
    }

    disconnect(id: number): void {
        this._handlers.delete(id);
    }

    emit(name: Name, ...args: unknown[]): void {
        // snapshot: handlers may connect/disconnect while we iterate
        for (const { name: n, cb } of [...this._handlers.values()])
            if (n === name) cb(...args);
    }
}

// --------------------------------------------------------------- actors

export interface EaseParams {
    duration: number;
    mode?: unknown;
    onStopped?: (finished: boolean) => void;
    [prop: string]: unknown;
}

const ANIMATABLE = [
    'x',
    'y',
    'width',
    'height',
    'scale_x',
    'scale_y',
    'translation_x',
    'translation_y',
    'opacity',
] as const;
type Animatable = (typeof ANIMATABLE)[number];

interface Transition {
    id: number;
    props: Partial<Record<Animatable, number>>;
    timeout: TimeoutId | null;
    onStopped?: (finished: boolean) => void;
    stopped: boolean;
}

/**
 * Minimal Clutter.Actor: animatable properties, per-ease transitions whose
 * `onStopped` fires with `false` when the transition is removed early and
 * `true` when it completes (gnome-shell environment.js semantics).
 */
export class SimActor {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    scale_x = 1;
    scale_y = 1;
    translation_x = 0;
    translation_y = 0;
    opacity = 255;
    parent: SimActor | null = null;
    children: SimActor[] = [];
    destroyed = false;

    private _transitions: Transition[] = [];
    private _nextTransition = 1;
    private _destroyHandlers: Array<() => void> = [];

    constructor(protected readonly clock: SimClock) {}

    add_child(child: SimActor): void {
        if (child.parent !== null)
            throw new Error(
                "clutter_actor_add_child: assertion 'child->priv->parent == NULL' failed",
            );
        child.parent = this;
        this.children.push(child);
    }

    remove_child(child: SimActor): void {
        this.children = this.children.filter((c) => c !== child);
        child.parent = null;
    }

    set_position(x: number, y: number): void {
        this.x = x;
        this.y = y;
    }

    set_size(width: number, height: number): void {
        this.width = width;
        this.height = height;
    }

    /**
     * gnome-shell environment.js `_easeActor`: the animated properties are
     * `Object.keys(params).map(p => p.replaceAll('_', '-'))`, looked up by
     * Clutter's kebab-case pspec names. A key that does not map to one (e.g.
     * camelCase `scaleX`) is still *set* by `actor.set(params)` but yields no
     * transition, and with no transition at all the callback runs at once.
     */
    ease(params: EaseParams): void {
        const { duration, onStopped, mode: _mode, ...rest } = params;
        const props: Partial<Record<Animatable, number>> = {};
        for (const [k, v] of Object.entries(rest)) {
            const kebab = k.replaceAll('_', '-');
            const snake = kebab.replaceAll('-', '_');
            if (
                kebab === k.replaceAll('_', '-') &&
                k === snake &&
                (ANIMATABLE as readonly string[]).includes(snake)
            ) {
                props[snake as Animatable] = v as number;
            } else {
                // GObject `set` accepts camelCase too: applied, not animated
                const camelToSnake = k.replace(
                    /[A-Z]/g,
                    (c) => `_${c.toLowerCase()}`,
                );
                if ((ANIMATABLE as readonly string[]).includes(camelToSnake))
                    (this as unknown as Record<string, number>)[camelToSnake] =
                        v as number;
            }
        }
        if (Object.keys(props).length === 0) {
            onStopped?.(true);
            return;
        }

        // Clutter replaces an in-flight transition on the same property; the
        // replaced transition is stopped early (onStopped(false)).
        for (const t of [...this._transitions])
            if (Object.keys(props).some((p) => p in t.props))
                this._stop(t, false);

        if (duration <= 0) {
            Object.assign(this, props);
            onStopped?.(true);
            return;
        }

        const transition: Transition = {
            id: this._nextTransition++,
            props,
            timeout: null,
            onStopped,
            stopped: false,
        };
        transition.timeout = this.clock.timeout(duration, () => {
            transition.timeout = null;
            Object.assign(this, props);
            this._stop(transition, true);
        });
        this._transitions.push(transition);
    }

    remove_all_transitions(): void {
        for (const t of [...this._transitions]) this._stop(t, false);
    }

    get_transition(prop: string): Transition | null {
        return this._transitions.find((t) => prop in t.props) ?? null;
    }

    get hasTransitions(): boolean {
        return this._transitions.length > 0;
    }

    connect(signal: 'destroy', cb: () => void): number {
        if (signal !== 'destroy')
            throw new Error(`unsupported signal ${signal}`);
        this._destroyHandlers.push(cb);
        return this._destroyHandlers.length;
    }

    /** gnome-shell's connectObject(signal, cb, owner): disconnected when `owner` is destroyed */
    connectObject(signal: 'destroy', cb: () => void, owner: SimActor): void {
        this.connect(signal, cb);
        owner.connect('destroy', () => {
            this._destroyHandlers = this._destroyHandlers.filter(
                (h) => h !== cb,
            );
        });
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.remove_all_transitions();
        this.parent?.remove_child(this);
        for (const h of [...this._destroyHandlers]) h();
        this._destroyHandlers = [];
    }

    private _stop(t: Transition, finished: boolean): void {
        if (t.stopped) return;
        t.stopped = true;
        if (t.timeout !== null) this.clock.cancel(t.timeout);
        this._transitions = this._transitions.filter((x) => x !== t);
        t.onStopped?.(finished);
    }
}

export const enum ActorChanges {
    NONE = 0,
    POSITION = 1,
    SIZE = 2,
}

export class SimContent {
    constructor(public readonly rect: Rect) {}
}

/** MetaWindowActor: freeze/thaw, geometry sync and size-change accounting. */
export class SimWindowActor extends SimActor {
    freezeCount = 0;
    sizeChangeInProgress = 0;
    /** client frames that reached the screen / were withheld while frozen */
    visibleFrame = 0;
    pendingDamage = 0;
    mapped = true;
    __animationInfo?: { clone: SimActor; oldRect: Rect; frozen: boolean };

    constructor(
        clock: SimClock,
        public readonly meta_window: SimWindow,
        private readonly compositor: SimCompositor,
    ) {
        super(clock);
        const b = meta_window.get_buffer_rect();
        this.set_position(b.x, b.y);
        this.set_size(b.width, b.height);
    }

    is_frozen(): boolean {
        return this.freezeCount > 0;
    }

    freeze(): void {
        this.freezeCount++;
    }

    thaw(): void {
        this.freezeCount--;
        if (this.freezeCount < 0) {
            this.compositor.warn('Error in freeze/thaw accounting');
            this.freezeCount = 0;
        }
        if (this.freezeCount > 0) return;
        // meta_window_actor_sync_thawed_state: geometry + withheld damage
        this.syncActorGeometry(false);
        this.visibleFrame += this.pendingDamage;
        this.pendingDamage = 0;
    }

    /** meta_window_actor_sync_actor_geometry */
    syncActorGeometry(didPlacement: boolean): ActorChanges {
        if (this.is_frozen() && !didPlacement)
            return ActorChanges.POSITION | ActorChanges.SIZE;
        if (this.destroyed) return ActorChanges.NONE;
        const b = this.meta_window.get_buffer_rect();
        let changes = ActorChanges.NONE;
        if (this.x !== b.x || this.y !== b.y) {
            this.set_position(b.x, b.y);
            changes |= ActorChanges.POSITION;
        }
        if (this.width !== b.width || this.height !== b.height) {
            this.set_size(b.width, b.height);
            changes |= ActorChanges.SIZE;
        }
        return changes;
    }

    processDamage(): void {
        if (this.is_frozen()) this.pendingDamage++;
        else this.visibleFrame++;
    }

    paint_to_content(rect: Rect): SimContent {
        return new SimContent(copy(rect));
    }

    get_texture(): boolean {
        return this.mapped;
    }

    /** meta_window_actor_size_change: counts the in-flight effect, then asks the plugin */
    sizeChange(which: SizeChange, oldFrame: Rect, oldBuffer: Rect): void {
        this.sizeChangeInProgress++;
        this.compositor.shellwm.emit(
            'size-change',
            this,
            which,
            copy(oldFrame),
            copy(oldBuffer),
        );
    }

    /** meta_window_actor_effect_completed (META_PLUGIN_SIZE_CHANGE) */
    sizeChangeCompleted(): void {
        this.sizeChangeInProgress--;
        if (this.sizeChangeInProgress < 0) {
            this.compositor.warn('Error in size change accounting.');
            this.sizeChangeInProgress = 0;
        }
    }
}

// --------------------------------------------------------------- windows

export const enum SizeChange {
    MAXIMIZE = 0,
    UNMAXIMIZE = 1,
    FULLSCREEN = 2,
    UNFULLSCREEN = 3,
    MONITOR_MOVE = 4,
}

export type AckPolicy =
    | { kind: 'comply' }
    /** acks inside move_resize_frame, like an X11 client under mutter */
    | { kind: 'sync' }
    | { kind: 'clampMin'; minWidth: number; minHeight: number }
    | { kind: 'ignore' }
    | { kind: 'delayed'; ms: number; then: AckPolicy };

export interface Configuration {
    serial: number;
    x: number;
    y: number;
    width: number;
    height: number;
    isResizing: boolean;
    maximized: boolean;
}

const configurationEquivalent = (
    a: Configuration,
    b: Configuration | null,
): boolean =>
    b !== null &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.isResizing === b.isResizing &&
    a.maximized === b.maximized;

const enum Flags {
    NONE = 0,
    MOVE_ACTION = 1 << 0,
    RESIZE_ACTION = 1 << 1,
    STATE_CHANGED = 1 << 2,
    FORCE_MOVE = 1 << 3,
    FINISH_MOVE_RESIZE = 1 << 4,
    UNMAXIMIZE = 1 << 5,
}

const enum Result {
    NONE = 0,
    MOVED = 1,
    RESIZED = 2,
    STATE_CHANGED = 4,
}

export type WindowSignal =
    'size-changed' | 'position-changed' | 'unmanaging' | 'unmanaged';

export interface WindowOptions {
    /** decorations/shadows around the frame (custom_frame_extents) */
    extents?: { left: number; right: number; top: number; bottom: number };
    /** min size the client advertises through xdg_toplevel.set_min_size */
    minSizeHint?: { width: number; height: number };
    /** how long the client takes to answer a configure (ms) */
    ackDelayMs?: number;
    maximized?: boolean;
}

/** MetaWindow (Wayland) plus the client on the other end of the socket. */
export class SimWindow {
    private _frame: Rect;
    private _bufferPos: { x: number; y: number };
    private readonly _extents: NonNullable<WindowOptions['extents']>;
    private readonly _minHint: { width: number; height: number };
    private readonly _ackDelay: number;
    private _actor: SimWindowActor | null = null;
    private _serial = 1;
    private _signals = new SignalBus<WindowSignal>();
    private _savedRect: Rect | null = null;

    maximized: boolean;
    unmanaging = false;
    monitor = 0;
    lastSentConfiguration: Configuration | null = null;
    lastAckedConfiguration: Configuration | null = null;
    pendingConfigurations: Configuration[] = [];
    /** every configure that actually went to the client */
    sentConfigurations: Configuration[] = [];

    constructor(
        public readonly id: string,
        frame: Rect,
        public policy: AckPolicy,
        private readonly compositor: SimCompositor,
        private readonly clock: SimClock,
        opts: WindowOptions = {},
    ) {
        this._frame = copy(frame);
        this._extents = opts.extents ?? {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        };
        this._bufferPos = {
            x: frame.x - this._extents.left,
            y: frame.y - this._extents.top,
        };
        this._minHint = opts.minSizeHint ?? { width: 1, height: 1 };
        this._ackDelay = opts.ackDelayMs ?? 16;
        this.maximized = opts.maximized ?? false;
        if (this.maximized) this._savedRect = copy(frame);
    }

    // -- MetaWindow API used by the extension --------------------------------

    get_frame_rect(): Rect {
        return copy(this._frame);
    }

    get_buffer_rect(): Rect {
        return {
            x: this._bufferPos.x,
            y: this._bufferPos.y,
            width: this._frame.width + this._extents.left + this._extents.right,
            height:
                this._frame.height + this._extents.top + this._extents.bottom,
        };
    }

    get_compositor_private(): SimWindowActor | null {
        return this._actor;
    }

    get_monitor(): number {
        return this.monitor;
    }

    get maximizedHorizontally(): boolean {
        return this.maximized;
    }

    get maximizedVertically(): boolean {
        return this.maximized;
    }

    move_to_monitor(index: number): void {
        this.monitor = index;
    }

    move_frame(userOp: boolean, x: number, y: number): void {
        void userOp;
        this._moveResizeInternal(Flags.MOVE_ACTION, {
            x,
            y,
            width: this._frame.width,
            height: this._frame.height,
        });
    }

    move_resize_frame(
        userOp: boolean,
        x: number,
        y: number,
        width: number,
        height: number,
    ): void {
        void userOp;
        this._moveResizeInternal(Flags.MOVE_ACTION | Flags.RESIZE_ACTION, {
            x,
            y,
            width,
            height,
        });
    }

    /** meta_window_unmaximize: mutter's own size-change effect, then a configure for the saved rect */
    unmaximize(): void {
        if (!this.maximized) return;
        const oldFrame = this.get_frame_rect();
        const oldBuffer = this.get_buffer_rect();
        this.maximized = false;
        const target = this._savedRect ?? oldFrame;
        this._actor?.sizeChange(SizeChange.UNMAXIMIZE, oldFrame, oldBuffer);
        this._moveResizeInternal(
            Flags.MOVE_ACTION |
                Flags.RESIZE_ACTION |
                Flags.STATE_CHANGED |
                Flags.UNMAXIMIZE,
            target,
        );
    }

    connect(signal: WindowSignal, cb: Handler): number {
        return this._signals.connect(signal, cb);
    }

    disconnect(id: number): void {
        this._signals.disconnect(id);
    }

    // -- lifecycle -------------------------------------------------------------

    /** @internal called by the compositor when the actor is created */
    _attachActor(actor: SimWindowActor): void {
        this._actor = actor;
    }

    /** meta_window_unmanage: actor goes away first, 'unmanaged' is emitted last */
    unmanage(): void {
        this.unmanaging = true;
        this._signals.emit('unmanaging', this);
        const actor = this._actor;
        this._actor = null; // meta_window_actor_queue_destroy clears compositor_private first
        actor?.destroy();
        this.compositor._removeWindow(this);
        this._signals.emit('unmanaged', this);
    }

    // -- the client ------------------------------------------------------------

    /** the client repaints (wl_surface.commit with damage, same size) */
    clientCommitFrame(): void {
        this._actor?.processDamage();
    }

    /** the client resizes itself, unprompted (e.g. Brave growing to 634px) */
    clientResize(width: number, height: number): void {
        this._finishMoveResize(null, { width, height });
    }

    /** the client acks the given (or latest pending) configure with a size */
    clientAck(
        size?: { width: number; height: number },
        configuration?: Configuration,
    ): void {
        const cfg =
            configuration ??
            this.pendingConfigurations[this.pendingConfigurations.length - 1];
        if (!cfg) return;
        this.pendingConfigurations = this.pendingConfigurations.filter(
            (c) => c.serial > cfg.serial,
        );
        this.lastAckedConfiguration = cfg;
        this._finishMoveResize(
            cfg,
            size ?? { width: cfg.width, height: cfg.height },
        );
    }

    private _scheduleClientResponse(
        cfg: Configuration,
        policy: AckPolicy = this.policy,
        extraDelay = 0,
    ): void {
        switch (policy.kind) {
            case 'ignore':
                return;
            case 'delayed':
                this._scheduleClientResponse(
                    cfg,
                    policy.then,
                    extraDelay + policy.ms,
                );
                return;
            case 'comply':
                this.clock.timeout(this._ackDelay + extraDelay, () =>
                    this.clientAck(undefined, cfg),
                );
                return;
            case 'sync':
                this.clientAck(undefined, cfg);
                return;
            case 'clampMin': {
                const size = {
                    width: Math.max(cfg.width, policy.minWidth),
                    height: Math.max(cfg.height, policy.minHeight),
                };
                this.clock.timeout(this._ackDelay + extraDelay, () =>
                    this.clientAck(size, cfg),
                );
            }
        }
    }

    // -- mutter internals ------------------------------------------------------

    private _constrain(rect: Rect): Rect {
        const wa = this.compositor.workArea;
        const r = copy(rect);
        // constrain_size_limits (client hints)
        r.width = Math.max(r.width, this._minHint.width);
        r.height = Math.max(r.height, this._minHint.height);
        // constrain_fully_onscreen: shift, never shrink
        if (r.x + r.width > wa.x + wa.width) r.x = wa.x + wa.width - r.width;
        if (r.y + r.height > wa.y + wa.height)
            r.y = wa.y + wa.height - r.height;
        if (r.x < wa.x) r.x = wa.x;
        if (r.y < wa.y) r.y = wa.y;
        return r;
    }

    /** meta-window-wayland.c should_configure() */
    private _shouldConfigure(constrained: Rect, flags: Flags): boolean {
        const last = this.lastSentConfiguration;
        if (!last) return true;
        if (
            flags & Flags.RESIZE_ACTION &&
            (constrained.width !== last.width ||
                constrained.height !== last.height)
        )
            return true;
        if (
            constrained.width !== this._frame.width ||
            constrained.height !== this._frame.height
        )
            return true;
        if (flags & Flags.STATE_CHANGED) return true;
        return false;
    }

    /** the client committed a buffer: meta_window_wayland_finish_move_resize */
    private _finishMoveResize(
        cfg: Configuration | null,
        size: { width: number; height: number },
    ): void {
        if (this.unmanaging) return;
        const rect: Rect = {
            x: cfg ? cfg.x : this._frame.x,
            y: cfg ? cfg.y : this._frame.y,
            width: size.width,
            height: size.height,
        };
        let flags = Flags.FINISH_MOVE_RESIZE | Flags.RESIZE_ACTION;
        if (cfg) flags |= Flags.MOVE_ACTION;
        this._moveResizeInternal(flags, rect);
    }

    /** meta_window_move_resize_internal + the Wayland move_resize_internal vfunc */
    private _moveResizeInternal(flags: Flags, unconstrained: Rect): void {
        if (this.unmanaging) return;
        const constrained = this._constrain(unconstrained);
        let result = Result.NONE;
        let canMoveNow = false;
        const frame = this._frame;

        if (flags & Flags.FORCE_MOVE) {
            canMoveNow = true;
        } else if (flags & Flags.FINISH_MOVE_RESIZE) {
            // the size is whatever the client committed
            if (
                frame.width !== unconstrained.width ||
                frame.height !== unconstrained.height
            ) {
                result |= Result.RESIZED;
                this._frame.width = unconstrained.width;
                this._frame.height = unconstrained.height;
            }
            canMoveNow = true;
        } else if (this._shouldConfigure(constrained, flags)) {
            const cfg: Configuration = {
                serial: this._serial++,
                x: constrained.x,
                y: constrained.y,
                width: constrained.width,
                height: constrained.height,
                isResizing: false,
                maximized: this.maximized,
            };
            if (!configurationEquivalent(cfg, this.lastSentConfiguration)) {
                this.lastSentConfiguration = cfg;
                this.pendingConfigurations.push(cfg);
                this.sentConfigurations.push(cfg);
                this._scheduleClientResponse(cfg);
                canMoveNow = false;
            }
            // equivalent configuration: dropped, and can_move_now stays FALSE
        } else {
            canMoveNow = true;
        }

        const newX = canMoveNow ? constrained.x : frame.x;
        const newY = canMoveNow ? constrained.y : frame.y;
        if (newX !== frame.x || newY !== frame.y) {
            result |= Result.MOVED;
            this._frame.x = newX;
            this._frame.y = newY;
        }
        const newBufferX = newX - this._extents.left;
        const newBufferY = newY - this._extents.top;
        if (
            newBufferX !== this._bufferPos.x ||
            newBufferY !== this._bufferPos.y
        ) {
            result |= Result.MOVED;
            this._bufferPos = { x: newBufferX, y: newBufferY };
        }
        if (canMoveNow && flags & Flags.STATE_CHANGED)
            result |= Result.STATE_CHANGED;

        // back in meta_window_move_resize_internal
        let movedOrResized = false;
        if (result & Result.MOVED) {
            movedOrResized = true;
            this._signals.emit('position-changed', this);
        }
        if (result & Result.RESIZED) {
            movedOrResized = true;
            this._signals.emit('size-changed', this);
        }
        if (movedOrResized || result & Result.STATE_CHANGED)
            this.compositor.syncWindowGeometry(this, false);
    }
}

// ------------------------------------------------------------ compositor

export type ShellWmSignal =
    'size-change' | 'size-changed' | 'kill-window-effects';

export class SimCompositor {
    readonly shellwm = new SignalBus<ShellWmSignal>();
    readonly warnings: string[] = [];
    readonly events: string[] = [];
    readonly windows: SimWindow[] = [];
    /** Main.uiGroup */
    readonly uiGroup: SimActor;

    constructor(
        public readonly clock: SimClock,
        public readonly workArea: Rect,
    ) {
        this.uiGroup = new SimActor(clock);
    }

    createWindow(
        id: string,
        frame: Rect,
        policy: AckPolicy,
        opts: WindowOptions = {},
    ): SimWindow {
        const window = new SimWindow(id, frame, policy, this, this.clock, opts);
        const actor = new SimWindowActor(this.clock, window, this);
        window._attachActor(actor);
        this.windows.push(window);
        return window;
    }

    warn(message: string): void {
        this.warnings.push(message);
        this.events.push(message);
    }

    log(message: string): void {
        this.events.push(message);
    }

    /** meta_compositor_sync_window_geometry */
    syncWindowGeometry(window: SimWindow, didPlacement: boolean): void {
        const actor = window.get_compositor_private();
        if (!actor) return;
        const changes = actor.syncActorGeometry(didPlacement);
        if (changes & ActorChanges.SIZE)
            this.shellwm.emit('size-changed', actor);
    }

    /** shellwm.completed_size_change */
    completed_size_change(actor: SimWindowActor): void {
        actor.sizeChangeCompleted();
    }

    /** @internal */
    _removeWindow(window: SimWindow): void {
        const i = this.windows.indexOf(window);
        if (i >= 0) this.windows.splice(i, 1);
    }
}

export function actorRect(a: SimActor): Rect {
    return { x: a.x, y: a.y, width: a.width, height: a.height };
}
