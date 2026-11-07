export enum LayoutEditorShortcut {
    MIDDLE = 'middle',
    CTRL_MIDDLE = 'ctrl-middle',
    ALT_MIDDLE = 'alt-middle',
    SUPER_MIDDLE = 'super-middle',
    DISABLED = 'disabled',
}

export const LAYOUT_EDITOR_SHORTCUTS = Object.values(LayoutEditorShortcut);

export function isLayoutEditorShortcut(
    value: string,
): value is LayoutEditorShortcut {
    return LAYOUT_EDITOR_SHORTCUTS.includes(value as LayoutEditorShortcut);
}

export function normalizeLayoutEditorShortcut(
    value: string,
    fallback: LayoutEditorShortcut,
): LayoutEditorShortcut {
    return isLayoutEditorShortcut(value) ? value : fallback;
}

export function matchesLayoutEditorShortcut(
    shortcut: LayoutEditorShortcut,
    modifiers: number,
    masks: { ctrl: number; alt: number; super: number },
): boolean {
    const relevantModifiers = modifiers & (masks.ctrl | masks.alt | masks.super);

    switch (shortcut) {
        case LayoutEditorShortcut.MIDDLE:
            return relevantModifiers === 0;
        case LayoutEditorShortcut.CTRL_MIDDLE:
            return relevantModifiers === masks.ctrl;
        case LayoutEditorShortcut.ALT_MIDDLE:
            return relevantModifiers === masks.alt;
        case LayoutEditorShortcut.SUPER_MIDDLE:
            return relevantModifiers === masks.super;
        default:
            return false;
    }
}