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
    private static _old_show: {
        (): boolean;
        (_backward: boolean, _binding: any, _mask: any): boolean;
    } | null;

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

        const owm = this.get();

        OverriddenAltTab._old_show = AltTab.WindowSwitcherPopup.prototype.show;
        // @ts-expect-error "This is expected"
        AltTab.WindowSwitcherPopup.prototype.show = owm.newShow;

        this._enabled = true;
    }

    static disable() {
        // if it is not enabled, do not disable
        if (!this._enabled) return;

        // @ts-expect-error "This is expected"
        AltTab.WindowSwitcherPopup.prototype.show = OverriddenAltTab._old_show;
        this._old_show = null;

        this._enabled = false;
    }

    static destroy() {
        this.disable();
        this._instance = null;
    }

    // the function will be treated as a method of class WindowMenu
    private newShow(backward: boolean, binding: any, mask: any): boolean {
        // allow the list to show NON-squared widgets
        this._switcherList._list.get_layout_manager().homogeneous = false;
        this._switcherList._squareItems = false;

        // Call original show function. Note: show() may synchronously
        // destroy the popup if the modifier key was already released
        // (see GNOME bug 596695), so we must check liveness afterward.
        const oldFunction = OverriddenAltTab._old_show?.bind(this);
        const res = !oldFunction || oldFunction(backward, binding, mask);

        // If the popup was destroyed during show(), bail out.
        if (!this._switcherList || !this._items?.length) return res;

        const tiledWindows: Meta.Window[] = (
            this._getWindowList() as Meta.Window[]
        ).filter((win) => (win as ExtendedWindow).assignedTile);

        if (tiledWindows.length <= 1) return res;

        const tiles = tiledWindows
            .map((win) => (win as ExtendedWindow).assignedTile)
            .filter((tile) => tile !== undefined);

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
