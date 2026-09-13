/**
 * Port of the size-change animation bookkeeping in GNOME Shell 50.4
 * js/ui/windowManager.js (extract with
 * `gresource extract /usr/lib64/gnome-shell/libshell-18.so /org/gnome/shell/ui/windowManager.js`):
 *   ctor state            L505-509   _resizing / _resizePending / _skippedActors
 *   kill-window-effects   L517-522
 *   signal connections    L530-531
 *   skipNextEffect        L1097-1099
 *   _shouldAnimateActor   L1142-1155
 *   _sizeChangeWindow     L1293-1304
 *   _prepareAnimationInfo L1306-1331
 *   _sizeChangedWindow    L1333-1389
 *   _clearAnimationInfo   L1391-1401
 *   _sizeChangeWindowDone L1403-1417
 * Kept as literal as the model allows so the harness fails when the shell
 * contract changes rather than when our reading of it does.
 */
import { SimClock } from './clock.ts';
import { Rect, SimActor, SimCompositor, SimWindowActor, SizeChange } from './mutter.ts';

export const WINDOW_ANIMATION_TIME = 250;

export class ShellWindowManager {
    readonly _resizing = new Set<SimWindowActor>();
    readonly _resizePending = new Set<SimWindowActor>();
    readonly _skippedActors = new Set<SimWindowActor>();
    private readonly _shellwm: SimCompositor;

    constructor(
        compositor: SimCompositor,
        private readonly clock: SimClock,
    ) {
        this._shellwm = compositor;
        compositor.shellwm.connect('kill-window-effects', (actor) => {
            this._sizeChangeWindowDone(this._shellwm, actor as SimWindowActor);
        });
        compositor.shellwm.connect('size-change', (actor, which, oldFrame, oldBuffer) =>
            this._sizeChangeWindow(
                this._shellwm,
                actor as SimWindowActor,
                which as SizeChange,
                oldFrame as Rect,
                oldBuffer as Rect,
            ),
        );
        compositor.shellwm.connect('size-changed', (actor) =>
            this._sizeChangedWindow(this._shellwm, actor as SimWindowActor),
        );
    }

    skipNextEffect(actor: SimWindowActor): void {
        this._skippedActors.add(actor);
    }

    _shouldAnimateActor(actor: SimWindowActor, _types: unknown[]): boolean {
        if (this._skippedActors.delete(actor)) return false;
        if (!actor.get_texture()) return false;
        return true; // window type NORMAL, no overview/gesture in the model
    }

    _sizeChangeWindow(
        shellwm: SimCompositor,
        actor: SimWindowActor,
        whichChange: SizeChange,
        oldFrameRect: Rect,
        _oldBufferRect: Rect,
    ): void {
        const shouldAnimate =
            this._shouldAnimateActor(actor, []) && oldFrameRect.width > 0 && oldFrameRect.height > 0;
        if (shouldAnimate) this._prepareAnimationInfo(shellwm, actor, oldFrameRect, whichChange);
        else shellwm.completed_size_change(actor);
    }

    _prepareAnimationInfo(
        _shellwm: SimCompositor,
        actor: SimWindowActor,
        oldFrameRect: Rect,
        _change: SizeChange,
    ): void {
        // Position a clone of the window on top of the old position,
        // while actor updates are frozen.
        actor.paint_to_content(oldFrameRect);
        const actorClone = new SimActor(this.clock);
        actorClone.set_position(oldFrameRect.x, oldFrameRect.y);
        actorClone.set_size(oldFrameRect.width, oldFrameRect.height);

        actor.freeze();

        if (this._clearAnimationInfo(actor)) {
            this._shellwm.log('Old animationInfo removed');
            this._shellwm.completed_size_change(actor);
        }

        actor.connectObject('destroy', () => this._clearAnimationInfo(actor), actorClone);

        this._resizePending.add(actor);
        actor.__animationInfo = {
            clone: actorClone,
            oldRect: oldFrameRect,
            frozen: true,
        };
    }

    _sizeChangedWindow(shellwm: SimCompositor, actor: SimWindowActor): void {
        if (!actor.__animationInfo) return;
        if (this._resizing.has(actor)) return;

        const actorClone = actor.__animationInfo.clone;
        const targetRect = actor.meta_window.get_frame_rect();
        const sourceRect = actor.__animationInfo.oldRect;

        const scaleX = targetRect.width / sourceRect.width;
        const scaleY = targetRect.height / sourceRect.height;

        this._resizePending.delete(actor);
        this._resizing.add(actor);

        try {
            this._shellwm.uiGroup.add_child(actorClone);
        } catch (e) {
            this._shellwm.warn((e as Error).message);
        }

        // Now scale and fade out the clone
        actorClone.ease({
            x: targetRect.x,
            y: targetRect.y,
            scale_x: scaleX,
            scale_y: scaleY,
            opacity: 0,
            duration: WINDOW_ANIMATION_TIME,
        });

        actor.translation_x = -targetRect.x + sourceRect.x;
        actor.translation_y = -targetRect.y + sourceRect.y;

        // Now set scale the actor to size it as the clone.
        actor.scale_x = 1 / scaleX;
        actor.scale_y = 1 / scaleY;

        // Scale it to its actual new size
        actor.ease({
            scale_x: 1,
            scale_y: 1,
            translation_x: 0,
            translation_y: 0,
            duration: WINDOW_ANIMATION_TIME,
            onStopped: () => this._sizeChangeWindowDone(shellwm, actor),
        });

        // ease didn't animate and cleared the info, we are done
        if (!actor.__animationInfo) return;

        // Now unfreeze actor updates, to get it to the new size.
        actor.thaw();
        actor.__animationInfo.frozen = false;
    }

    _clearAnimationInfo(actor: SimWindowActor): boolean {
        if (actor.__animationInfo) {
            actor.__animationInfo.clone.destroy();
            if (actor.__animationInfo.frozen) actor.thaw();
            delete actor.__animationInfo;
            return true;
        }
        return false;
    }

    _sizeChangeWindowDone(_shellwm: SimCompositor, actor: SimWindowActor): void {
        if (this._resizing.delete(actor)) {
            actor.remove_all_transitions();
            actor.scale_x = 1.0;
            actor.scale_y = 1.0;
            actor.translation_x = 0;
            actor.translation_y = 0;
            this._clearAnimationInfo(actor);
            this._shellwm.completed_size_change(actor);
        }

        if (this._resizePending.delete(actor)) {
            this._clearAnimationInfo(actor);
            this._shellwm.completed_size_change(actor);
        }
    }
}
