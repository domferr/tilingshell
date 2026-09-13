/**
 * Verbatim transcriptions (modulo the sim types) of `_easeWindowRect` as it
 * is at HEAD (src/components/tilingsystem/tilingManager.ts, commit a6d5e9c
 * L1074-1112) and in the Aug-14 working tree (branch wip/worktree-snapshot,
 * L1115-1168). They exist so the harness can characterise the bug; they are
 * not used by the extension.
 */
import { Rect, SimWindow, SizeChange } from './mutter.ts';
import { ShellWindowManager } from './shellWindowManager.ts';

export function easeWindowRectHead(
    wm: ShellWindowManager,
    window: SimWindow,
    destRect: Rect,
    user_op = false,
    force = false,
    monitorIndex = 0,
): void {
    const windowActor = window.get_compositor_private()!;

    const beforeRect = window.get_frame_rect();
    // do not animate the window if it will not move or scale
    if (
        destRect.x === beforeRect.x &&
        destRect.y === beforeRect.y &&
        destRect.width === beforeRect.width &&
        destRect.height === beforeRect.height
    )
        return;

    // apply animations when tiling the window
    windowActor.remove_all_transitions();
    wm._prepareAnimationInfo(
        undefined as never,
        windowActor,
        { ...beforeRect },
        SizeChange.UNMAXIMIZE,
    );

    // move and resize the window to the current selection
    window.move_to_monitor(monitorIndex);
    if (force) window.move_frame(user_op, destRect.x, destRect.y);
    window.move_resize_frame(
        user_op,
        destRect.x,
        destRect.y,
        destRect.width,
        destRect.height,
    );
}

export function easeWindowRectWorkingTree(
    wm: ShellWindowManager,
    window: SimWindow,
    destRect: Rect,
    user_op = false,
    force = false,
    monitorIndex = 0,
): void {
    const windowActor = window.get_compositor_private()!;

    const beforeRect = window.get_frame_rect();
    if (
        destRect.x === beforeRect.x &&
        destRect.y === beforeRect.y &&
        destRect.width === beforeRect.width &&
        destRect.height === beforeRect.height
    )
        return;

    windowActor.remove_all_transitions();

    const alreadyAnimating = !!windowActor.__animationInfo;
    if (!alreadyAnimating) {
        wm._prepareAnimationInfo(
            undefined as never,
            windowActor,
            { ...beforeRect },
            SizeChange.UNMAXIMIZE,
        );
    }

    window.move_to_monitor(monitorIndex);
    if (force) window.move_frame(user_op, destRect.x, destRect.y);
    window.move_resize_frame(
        user_op,
        destRect.x,
        destRect.y,
        destRect.width,
        destRect.height,
    );
}
