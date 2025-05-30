import Layout from '@components/layout/Layout';
import LayoutButton from '@indicator/layoutButton';
import GlobalState from '@utils/globalState';
import Settings from '@settings/settings';
import { St, Clutter, GLib } from '@gi.ext';
import { Gtk } from '@gi.prefs';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { getWindows } from '@utils/ui';
import ExtendedWindow from '@components/tilingsystem/extendedWindow';

export class LayoutSwitcherPopup {
    private _popup!: St.Widget;
    private _layoutList!: St.BoxLayout;
    private _layouts: Layout[];
    private _layoutButtons: LayoutButton[];
    private _monitorIndex: number = 0;
    private _selectedIndex: number;
    private _haveModal: boolean;
    private _grab: object | null;
    private _keybindingStrings: string[];
    private _expectedKeyval: number = 0;
    private _expectedModifiers: number = 0;
    private _modifierCheckTimeoutId: number = 0;

    constructor(keybindingStrings: string[]) {
        this._layouts = GlobalState.get().layouts;
        this._selectedIndex = 0;
        this._haveModal = false;
        this._grab = null;
        this._layoutButtons = [];
        this._monitorIndex = this._getCurrentMonitorIndex();
        this._keybindingStrings = keybindingStrings;
        this._parseKeybinding();

        this._createPopup();
        this._createLayoutList();

        const selectedLayoutId = this._getCurrentLayoutId();
        this._selectedIndex = this._layouts.findIndex(
            (lay) => lay.id === selectedLayoutId,
        );

        this._populateLayouts();
    }

    private _getCurrentMonitorIndex(): number {
        const focusWindow = global.display.focus_window;
        if (focusWindow) return focusWindow.get_monitor();

        return Main.layoutManager.primaryIndex;
    }

    private _createPopup() {
        this._popup = new St.Widget({
            style_class: 'layout-switcher-popup',
            reactive: true,
            visible: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        Main.layoutManager.uiGroup.add_child(this._popup);

        this._popup.connect('key-press-event', this._onKeyPress.bind(this));
        this._popup.connect('key-release-event', this._onKeyRelease.bind(this));
    }

    private _positionPopupOnMonitor() {
        const monitor = Main.layoutManager.monitors[this._monitorIndex];

        this._popup.get_allocation_box();
        const [popupWidth, popupHeight] = this._popup.get_preferred_size();

        const x = monitor.x + Math.floor((monitor.width - popupWidth) / 2);
        const y = monitor.y + Math.floor((monitor.height - popupHeight) / 2);

        this._popup.set_position(x, y);
    }

    private _parseKeybinding(): void {
        if (!this._keybindingStrings || this._keybindingStrings.length === 0)
            return;

        const keybinding = this._keybindingStrings[0];
        if (!keybinding) return;

        try {
            const [_, keyval, modifiers] = Gtk.accelerator_parse(keybinding);

            if (modifiers) {
                this._expectedKeyval = keyval;
                this._expectedModifiers = modifiers;
            }
        } catch (error) {
            console.error('Error parsing keybinding:', keybinding, error);
        }
    }

    private _getProperModifierMask(): number {
        const defaultMask = Gtk.accelerator_get_default_mod_mask();
        const ACTUAL_SUPER_MASK = 64;
        return defaultMask | ACTUAL_SUPER_MASK;
    }

    private _normalizeEventModifiers(event: Clutter.KeyEvent): number {
        const eventState = (
            event as unknown as { get_state(): number }
        ).get_state();
        const properModMask = this._getProperModifierMask();
        return eventState & properModMask;
    }

    private _normalizeExpectedModifiers(): number {
        const ACTUAL_SUPER_MASK = 64;

        // Handle Super key conversion
        if (this._expectedModifiers & (1 << 26)) return ACTUAL_SUPER_MASK;

        // For other modifiers (Ctrl, Alt, Shift), the GTK values should match Clutter values
        let normalizedMods = 0;

        if (this._expectedModifiers & (1 << 0))
            normalizedMods |= Clutter.ModifierType.SHIFT_MASK; // Shift
        if (this._expectedModifiers & (1 << 2))
            normalizedMods |= Clutter.ModifierType.CONTROL_MASK; // Control
        if (this._expectedModifiers & (1 << 3))
            normalizedMods |= Clutter.ModifierType.MOD1_MASK; // Alt

        return normalizedMods;
    }

    private _matchesAssignedKeybinding(event: Clutter.KeyEvent): boolean {
        if (this._expectedKeyval === 0) return false;

        const eventKeyval = (
            event as unknown as { get_key_symbol(): number }
        ).get_key_symbol();
        const normalizedModifiers = this._normalizeEventModifiers(event);
        const normalizedExpected = this._normalizeExpectedModifiers();

        const keyMatches = eventKeyval === this._expectedKeyval;
        const modifiersMatch = normalizedModifiers === normalizedExpected;

        return keyMatches && modifiersMatch;
    }

    private _getCurrentLayoutId(): string {
        const selected_layouts = Settings.get_selected_layouts();
        const ws_index = global.workspaceManager.get_active_workspace_index();

        const ws_selected_layouts =
            ws_index < selected_layouts.length
                ? selected_layouts[ws_index]
                : [];

        const selectedId =
            this._monitorIndex < ws_selected_layouts.length
                ? ws_selected_layouts[this._monitorIndex]
                : GlobalState.get().layouts[0].id;

        return selectedId;
    }

    private _createLayoutList(): void {
        this._layoutList = new St.BoxLayout({
            style_class: 'layout-switcher-list',
            orientation: Clutter.Orientation.HORIZONTAL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._popup.add_child(this._layoutList);
    }

    private _populateLayouts() {
        const buttonSize = { width: 142, height: 80 };
        const hasGaps = Settings.get_inner_gaps(1).top > 0;
        const gapSize = hasGaps ? 2 : 0;

        this._layoutButtons = this._layouts.map((layout, ind) => {
            const container = new St.Widget({
                style_class: 'layout-switcher-item',
            });

            this._layoutList.add_child(container);

            const button = new LayoutButton(
                container,
                layout,
                gapSize,
                buttonSize.height,
                buttonSize.width,
            );

            if (ind === this._selectedIndex) button.set_checked(true);
            return button;
        });
    }

    private _selectLayout(index: number) {
        this._layoutButtons.forEach((button, i) => {
            if (i === index) {
                button.set_checked(true);
                this._selectedIndex = index;
            } else {
                button.set_checked(false);
            }
        });
    }

    private _onKeyPress(_actor: St.Widget, event: Clutter.KeyEvent) {
        if (this._matchesAssignedKeybinding(event)) {
            this._next();
            return Clutter.EVENT_STOP;
        }

        const keysym = (
            event as unknown as { get_key_symbol(): number }
        ).get_key_symbol();

        switch (keysym) {
            case Clutter.KEY_Left:
                this._previous();
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Right:
                this._next();
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
            case Clutter.KEY_ISO_Enter:
            case Clutter.KEY_space:
                this._finish();
                return Clutter.EVENT_STOP;
            case Clutter.KEY_Escape:
                this._cancel();
                return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    private _onKeyRelease(_actor: St.Widget, _event: Clutter.KeyEvent) {
        return Clutter.EVENT_PROPAGATE;
    }

    private _next() {
        const newIndex = (this._selectedIndex + 1) % this._layouts.length;
        this._selectLayout(newIndex);
    }

    private _previous() {
        const newIndex =
            (this._selectedIndex - 1 + this._layouts.length) %
            this._layouts.length;
        this._selectLayout(newIndex);
    }

    private _finish() {
        this._applyLayout(this._layouts[this._selectedIndex].id);

        if (this._haveModal) {
            Main.popModal(this._grab);
            this._haveModal = false;
        }

        this._popup.destroy();
    }

    private _cancel() {
        this.destroy();
    }

    private _applyLayout(layoutId: string) {
        const selected = Settings.get_selected_layouts();
        selected[global.workspaceManager.get_active_workspace_index()][
            this._monitorIndex
        ] = layoutId;

        const n_workspaces = global.workspaceManager.get_n_workspaces();
        if (
            global.workspaceManager.get_active_workspace_index() ===
            n_workspaces - 2
        ) {
            const lastWs = global.workspaceManager.get_workspace_by_index(
                n_workspaces - 1,
            );
            if (!lastWs) return;

            const tiledWindows = getWindows(lastWs).find(
                (win) =>
                    (win as ExtendedWindow).assignedTile &&
                    win.get_monitor() === this._monitorIndex,
            );
            if (!tiledWindows)
                selected[lastWs.index()][this._monitorIndex] = layoutId;
        }

        Settings.save_selected_layouts(selected);
    }

    public show(): boolean {
        if (this._layouts.length === 0) return false;

        this._popup.visible = true;
        this._popup.opacity = 255;

        this._positionPopupOnMonitor();

        const grab = Main.pushModal(this._popup);
        if ((grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            Main.popModal(grab);
            this._popup.visible = false;
            return false;
        }

        this._grab = grab;
        this._haveModal = true;

        this._startModifierPolling();

        return true;
    }

    private _startModifierPolling(): void {
        this._modifierCheckTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_HIGH,
            16,
            () => {
                const [x_, y_, mods] = global.get_pointer();

                const expectedModifiers = this._normalizeExpectedModifiers();

                // Check if the expected modifiers are still pressed
                const properModMask = this._getProperModifierMask();
                const currentRelevantMods = mods & properModMask;
                const modifiersStillPressed = !!(
                    currentRelevantMods & expectedModifiers
                );

                if (!modifiersStillPressed) {
                    this._finish();
                    return GLib.SOURCE_REMOVE;
                }

                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    public destroy() {
        if (this._modifierCheckTimeoutId !== 0) {
            GLib.source_remove(this._modifierCheckTimeoutId);
            this._modifierCheckTimeoutId = 0;
        }

        if (this._haveModal) {
            Main.popModal(this._grab);
            this._haveModal = false;
        }

        this._popup.destroy();
    }
}
