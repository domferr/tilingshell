import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import { St, Meta, Clutter } from '../../gi/ext';
import ExtendedWindow from '../../components/tilingsystem/extendedWindow';
import MultipleWindowsIcon from './MultipleWindowsIcon';
import { buildMargin, getWindows } from '../../utils/ui';
import Settings from '../../settings/settings';

const GAPS = 3;

export default class OverriddenAltTab {
    private static _enabled: boolean = false;
    private static _instance: OverriddenAltTab | null = null;
    private static _oldShow: AltTabShow | null = null;
    private static _overriddenShow: AltTabShow | null = null;

    // AltTab has these private fields
    private _switcherList: any;
    private _items: any;

    static get(): OverriddenAltTab {
        if (this._instance === null) this._instance = new OverriddenAltTab();
        return this._instance;
    }

    static enable() {
        // if it is already enabled, do not enable again
        if (this._enabled) return;

        const overriddenAltTab = this.get();
        const oldShow = AltTab.WindowSwitcherPopup.prototype.show as AltTabShow;
        const overriddenShow: AltTabShow = function (
            this: AltTabWindowSwitcherPopup,
            backward,
            binding,
            mask
        ) {
            return overriddenAltTab.newShow.call(
                this,
                oldShow,
                backward,
                binding,
                mask
            );
        };

        this._oldShow = oldShow;
        this._overriddenShow = overriddenShow;
        // @ts-expect-error "This is expected"
        AltTab.WindowSwitcherPopup.prototype.show = overriddenShow;

        this._enabled = true;
    }

    static disable() {
        // if it is not enabled, do not disable
        if (!this._enabled) return;

        // Do not overwrite a patch installed by another extension after ours.
        // In particular, leave GNOME's key-event handling chain intact so that
        // Escape continues to cancel the native switcher.
        if (
            AltTab.WindowSwitcherPopup.prototype.show ===
                this._overriddenShow &&
            this._oldShow
        ) {
            // @ts-expect-error "This is expected"
            AltTab.WindowSwitcherPopup.prototype.show = this._oldShow;
        }

        this._oldShow = null;
        this._overriddenShow = null;

        this._enabled = false;
    }

    static destroy() {
        this.disable();
        this._instance = null;
    }

    // the function will be treated as a method of class WindowMenu
    private newShow(
        this: AltTabWindowSwitcherPopup,
        oldShow: AltTabShow,
        backward: boolean,
        binding: any,
        mask: any
    ): boolean {
        // allow the list to show NON-squared widgets
        this._switcherList._list.get_layout_manager().homogeneous = false;
        this._switcherList._squareItems = false;

        // Call original show function. Note: show() may synchronously
        // destroy the popup if the modifier key was already released
        // (see GNOME bug 596695), so we must check liveness afterward.
        const res = oldShow.call(this, backward, binding, mask);

        // If the popup was destroyed during show(), bail out.
        if (!this._switcherList || !this._items?.length) return res;

        const tiledWindows: Meta.Window[] = (
            this._getWindowList() as Meta.Window[]
        ).filter(win => (win as ExtendedWindow).assignedTile);

        if (tiledWindows.length <= 1) return res;

        const tiles = tiledWindows
            .map(win => (win as ExtendedWindow).assignedTile)
            .filter(tile => tile !== undefined);

        const inner_gaps = Settings.get_inner_gaps();
        const height = this._items[0].height;
        const width = Math.floor((height * 16) / 9);
        const gaps =
            GAPS *
            St.ThemeContext.get_for_stage(global.stage as Clutter.Stage)
                .scale_factor;

        // Create new group entry
        const groupWindowsIcon = new MultipleWindowsIcon({
            tiles,
            width,
            height,
            innerGaps: buildMargin({
                top: inner_gaps.top === 0 ? 0 : gaps,
                bottom: inner_gaps.bottom === 0 ? 0 : gaps,
                left: inner_gaps.left === 0 ? 0 : gaps,
                right: inner_gaps.right === 0 ? 0 : gaps,
            }),
            windows: tiledWindows,
        });

        // Append the group item to the list
        this._switcherList.addItem(groupWindowsIcon, groupWindowsIcon.label);
        this._items.push(groupWindowsIcon);
        groupWindowsIcon.window.onAllWindowsUnmanaged(() => {
            this._switcherList._removeWindow(groupWindowsIcon.window);
        });

        return res;
    }

    private _getWindowList(): Meta.Window[] {
        return getWindows();
    }
}

type AltTabWindowSwitcherPopup = OverriddenAltTab & {
    _getWindowList(): Meta.Window[];
};

type AltTabShow = (
    this: AltTabWindowSwitcherPopup,
    backward: boolean,
    binding: any,
    mask: any
) => boolean;
