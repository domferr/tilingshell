import type { PlacementActor, PlacementTarget, Rect } from './windowPlacer';

/**
 * Structural view of Meta.Window / Meta.WindowActor, so one adapter serves
 * both the extension and the mutter simulation and neither can drift from
 * the other.
 */
export interface ActorLike {
    scale_x: number;
    scale_y: number;
    translation_x: number;
    translation_y: number;
    ease(params: Record<string, unknown>): void;
    remove_all_transitions(): void;
}

export interface WindowLike<A extends ActorLike> {
    get_compositor_private(): A | null;
    get_frame_rect(): Rect;
    get_buffer_rect(): Rect;
    move_to_monitor(index: number): void;
    move_frame(userOp: boolean, x: number, y: number): void;
    move_resize_frame(
        userOp: boolean,
        x: number,
        y: number,
        width: number,
        height: number,
    ): void;
    connect(signal: string, cb: () => void): number;
    disconnect(id: number): void;
}

const plainRect = (r: Rect): Rect => ({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
});

export function adaptActor(
    actor: ActorLike,
    easeMode?: unknown,
): PlacementActor {
    return {
        setTransform(scaleX, scaleY, tx, ty) {
            actor.scale_x = scaleX;
            actor.scale_y = scaleY;
            actor.translation_x = tx;
            actor.translation_y = ty;
        },
        easeToIdentity(durationMs, onStopped) {
            // snake_case on purpose: gnome-shell's ease() finds the Clutter
            // transitions by `key.replaceAll('_', '-')`; camelCase keys are
            // set but never animated
            actor.ease({
                scale_x: 1,
                scale_y: 1,
                translation_x: 0,
                translation_y: 0,
                duration: durationMs,
                mode: easeMode,
                onStopped,
            });
        },
        cancelTransitions() {
            actor.remove_all_transitions();
        },
    };
}

export function adaptWindow<A extends ActorLike>(
    window: WindowLike<A>,
    easeMode?: unknown,
): PlacementTarget {
    return {
        isAlive: () => window.get_compositor_private() !== null,
        getFrameRect: () => plainRect(window.get_frame_rect()),
        getBufferRect: () => plainRect(window.get_buffer_rect()),
        moveToMonitor: (index) => window.move_to_monitor(index),
        moveFrame: (userOp, x, y) => window.move_frame(userOp, x, y),
        moveResizeFrame: (userOp, r) =>
            window.move_resize_frame(userOp, r.x, r.y, r.width, r.height),
        getActor: () => {
            const actor = window.get_compositor_private();
            return actor ? adaptActor(actor, easeMode) : null;
        },
        onGeometryChanged: (cb) => {
            const a = window.connect('size-changed', cb);
            const b = window.connect('position-changed', cb);
            return () => {
                window.disconnect(a);
                window.disconnect(b);
            };
        },
        onGone: (cb) => {
            const id = window.connect('unmanaging', cb);
            return () => window.disconnect(id);
        },
    };
}
