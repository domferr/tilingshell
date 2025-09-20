import Layout from '@components/layout/Layout';
import LayoutButton from '@indicator/layoutButton';
import GlobalState from '@utils/globalState';
import Settings from '@settings/settings';
import { St, Clutter } from '@gi.ext';
import { enableScalingFactorSupport, getMonitorScalingFactor } from '@utils/ui';
import * as SwitcherPopup from 'resource:///org/gnome/shell/ui/switcherPopup.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { registerGObjectClass } from '@utils/gjs';
import { widgetOrientation } from '@utils/gnomesupport';

const LAYOUT_HEIGHT: number = 72;
const LAYOUT_WIDTH: number = 128; // 16:9 ratio. -> (16*layoutHeight) / 9 and then rounded to int
const GAPS = 3;

@registerGObjectClass
class LayoutSwitcherList extends SwitcherPopup.SwitcherList {
    // those are defined in the parent but we lack them in the type definition
    // @esbuild-drop-next-line
    private _items!: St.Widget[];
    // @esbuild-drop-next-line
    private _highlighted!: number;

    private _buttons: LayoutButton[];

    constructor(
        items: Layout[],
        parent: LayoutSwitcherPopup,
        monitorScalingFactor?: number,
    ) {
        // @ts-expect-error "Parent can take a boolean"
        super(false); // false since layouts won't be squared
        this.add_style_class_name('layout-switcher-list');
        this._buttons = [];
        // we need to add this as child before adding the layouts
        // so those can call get_theme_node on their parent
        // then we can remove this as child
        parent.add_child(this);
        enableScalingFactorSupport(this, monitorScalingFactor);
        items.forEach((lay) => this._addLayoutItem(lay));
        parent.remove_child(this);
    }

    _addLayoutItem(layout: Layout) {
        const box = new St.BoxLayout({
            style_class: 'alt-tab-app',
            ...widgetOrientation(true),
        });
        // @ts-expect-error "addItem can take a St.Widget"
        this.addItem(box, new St.Widget());

        this._buttons.push(
            new LayoutButton(
                box,
                layout,
                Settings.get_inner_gaps(1).top > 0 ? GAPS : 0,
                LAYOUT_HEIGHT,
                LAYOUT_WIDTH,
            ),
        );
    }

    highlight(index: number, justOutline: boolean): void {
        // highlight the new button
        this._buttons[index].set_checked(true);
        super.highlight(index, justOutline);

        // prevent the default behaviour to highlight switcher's item since we have our own CSS way
        this._items[this._highlighted].remove_style_pseudo_class('outlined');
        this._items[this._highlighted].remove_style_pseudo_class('selected');
    }

    public unhighlight(index: number): void {
        this._buttons[index].set_checked(false);
    }
}

@registerGObjectClass
export class LayoutSwitcherPopup extends SwitcherPopup.SwitcherPopup {
    // those are defined in the parent but we lack them in the type definition
    // @esbuild-drop-next-line
    private _switcherList: LayoutSwitcherList;
    // @esbuild-drop-next-line
    private _items!: Layout[];
    // @esbuild-drop-next-line
    private _selectedIndex!: number;

    private _action: number;

    constructor(action: number, enableScaling: boolean) {
        // @ts-expect-error "Parent can take a list"
        super(GlobalState.get().layouts);

        this._action = action;
        // handle scale factor of the monitor
        const monitorScalingFactor = enableScaling
            ? getMonitorScalingFactor(this._getCurrentMonitorIndex())
            : undefined;
        this._switcherList = new LayoutSwitcherList(
            this._items,
            this,
            monitorScalingFactor,
        );
    }

    _initialSelection(backward: boolean, _binding: number) {
        const selectedLay = GlobalState.get().getSelectedLayoutOfMonitor(
            this._getCurrentMonitorIndex(),
            global.workspaceManager.get_active_workspace_index(),
        );
        this._selectedIndex = GlobalState.get().layouts.findIndex(
            (lay) => lay.id === selectedLay.id,
        );
        if (backward) this._select(this._previous());
        else this._select(this._next());
    }

    _keyPressHandler(keysym: number, action: number) {
        if (keysym === Clutter.KEY_Left) this._select(this._previous());
        else if (keysym === Clutter.KEY_Right) this._select(this._next());
        else if (action !== this._action) return Clutter.EVENT_PROPAGATE;
        else this._select(this._next());

        return Clutter.EVENT_STOP;
    }

    _select(num: number) {
        this._switcherList.unhighlight(this._selectedIndex);
        super._select(num);
    }

    _finish(timestamp: number) {
        super._finish(timestamp);

        GlobalState.get().setSelectedLayoutOfMonitor(
            this._items[this._selectedIndex].id,
            this._getCurrentMonitorIndex(),
        );
    }

    private _getCurrentMonitorIndex(): number {
        const focusWindow = global.display.focus_window;
        if (focusWindow) return focusWindow.get_monitor();

        return Main.layoutManager.primaryIndex;
    }
}
