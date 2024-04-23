import Settings from '@/settings';
import { registerGObjectClass } from '@/utils/gjs';
import Clutter from "gi://Clutter";
import St from 'gi://St';
import LayoutButton from '../../indicator/layoutButton';
import GlobalState from '@/globalState';
import { logger } from '@/utils/shell';
import Layout from '@/components/layout/Layout';
import SignalHandling from '@/signalHandling';
import Tile from '@/components/layout/Tile';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

const debug = logger('EditorDialog');

@registerGObjectClass
export default class EditorDialog extends ModalDialog.ModalDialog {
    private readonly _layoutHeight: number = 72;
    private readonly _layoutWidth: number = 128; // 16:9 ratio. -> (16*layoutHeight) / 9 and then rounded to int
    private readonly _gapsSize: number = 3;
    private readonly _signals: SignalHandling;
    
    private _layoutsBoxLayout: St.BoxLayout;

    constructor(params: {
        scalingFactor: number,
        onDeleteLayout: (ind: number, lay: Layout) => void,
        onSelectLayout: (ind: number, lay: Layout) => void,
        onNewLayout: () => void,
        legend: boolean
    }) {
        super({
            destroyOnClose: false,
            styleClass: 'editor-dialog',
        });
        
        this._signals = new SignalHandling();

        this.contentLayout.add_child(new St.Label({
            text: "Select the layout to edit", 
            xAlign: Clutter.ActorAlign.CENTER, 
            xExpand: true, 
            styleClass: 'editor-dialog-title'
        }));
        
        this._layoutsBoxLayout = new St.BoxLayout({
            vertical: false, // horizontal box layout
            styleClass: "layouts-box-layout",
            xAlign: Clutter.ActorAlign.CENTER,
        });
        this.contentLayout.add_child(this._layoutsBoxLayout);

        if (!params.legend) {
            this._drawLayouts({ layouts: GlobalState.get().layouts, ...params });
            this._signals.connect(GlobalState.get(), "layouts-changed", () => {
                this._drawLayouts({ layouts: GlobalState.get().layouts, ...params });
            });
        }

        this.addButton({
            label: 'Close',
            default: true,
            key: Clutter.KEY_Escape,
            action: () => {
                this.destroy();
            },
        });

        if (params.legend) this._makeLegendDialog();

        this.connect("destroy", () => this._signals.disconnect());
    }

    private _makeLegendDialog() {
        const suggestion1 = new St.BoxLayout({ vertical: false });
        // LEFT-CLICK to split a tile
        suggestion1.add_child(new St.Label({ 
            text: "LEFT-CLICK", 
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: 'button kbd',
            xExpand: false
        }));
        suggestion1.add_child(new St.Label({ 
            text: " to split a tile.", 
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: '',
            xExpand: false
        }));

        const suggestion2 = new St.BoxLayout({ vertical: false });
        // LEFT-CLICK + CTRL to split a tile vertically
        suggestion2.add_child(new St.Label({ 
            text: "LEFT-CLICK", 
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: 'button kbd',
            xExpand: false
        }));
        suggestion2.add_child(new St.Label({ 
            text: " + ", 
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: '',
            xExpand: false
        }));
        suggestion2.add_child(new St.Label({ 
            text: "CTRL", 
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: 'button kbd',
            xExpand: false
        }));
        suggestion2.add_child(new St.Label({ 
            text: " to split a tile vertically.", 
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: '',
            xExpand: false
        }));

        const suggestion3 = new St.BoxLayout({ vertical: false });
        // RIGHT-CLICK to delete a tile
        suggestion3.add_child(new St.Label({ 
            text: "RIGHT-CLICK",
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: 'button kbd',
            xExpand: false
        }));
        suggestion3.add_child(new St.Label({ 
            text: " to delete a tile.", 
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            styleClass: '',
            xExpand: false
        }));
        
        const legend = new St.BoxLayout({ vertical: true, styleClass: "legend" });
        legend.add_child(suggestion1);
        legend.add_child(suggestion2);
        legend.add_child(suggestion3);
        this._signals.disconnect();
        this.contentLayout.remove_all_children();
        this.contentLayout.add_child(new St.Label({
            text: "How to use the editor", 
            xAlign: Clutter.ActorAlign.CENTER, 
            xExpand: true, 
            styleClass: 'editor-dialog-title'
        }));
        this.contentLayout.add_child(legend);

        this.clearButtons();
        this.addButton({
            label: 'Start editing',
            default: true,
            key: Clutter.KEY_Escape,
            action: () => {
                this.destroy();
            },
        });
    }

    private _drawLayouts(params: {
        layouts: Layout[],
        scalingFactor: number,
        onDeleteLayout: (ind: number, lay: Layout) => void,
        onSelectLayout: (ind: number, lay: Layout) => void,
        onNewLayout: () => void
    }) {
        const gaps = Settings.get_inner_gaps(1).top > 0 ? this._gapsSize:0
        this._layoutsBoxLayout.remove_all_children();
        
        params.layouts.forEach((lay, btnInd) => {
            const box = new St.BoxLayout({ 
                vertical: true, 
                xAlign: Clutter.ActorAlign.CENTER,
                styleClass: "layout-button-container" 
            });
            this._layoutsBoxLayout.add_child(box);
            const btn = new LayoutButton(box, lay, gaps, params.scalingFactor, this._layoutHeight, this._layoutWidth);
            if (params.layouts.length > 1) {
                const deleteBtn = new St.Button({xExpand: false, xAlign: Clutter.ActorAlign.CENTER, styleClass: "message-list-clear-button icon-button button delete-layout-button"});
                deleteBtn.child = new St.Icon({ iconName: "edit-delete-symbolic", iconSize: 16 });
                deleteBtn.connect('clicked', (self) => {
                    params.onDeleteLayout(btnInd, lay);
                });
                box.add_child(deleteBtn);
            }
            btn.connect('clicked', (self) => {
                params.onSelectLayout(btnInd, lay);
                this._makeLegendDialog();
            });
            return btn;
        });

        const box = new St.BoxLayout({ 
            vertical: true, 
            xAlign: Clutter.ActorAlign.CENTER,
            styleClass: "layout-button-container" 
        });
        this._layoutsBoxLayout.add_child(box);
        const newLayoutBtn = new LayoutButton(box, new Layout([new Tile({x: 0, y: 0, width: 1, height: 1, groups: []})], "New Layout"), gaps, params.scalingFactor, this._layoutHeight, this._layoutWidth);
        const icon = new St.Icon({ iconName: "list-add-symbolic", iconSize: 32 });
        icon.set_size(newLayoutBtn.child.width, newLayoutBtn.child.height);
        newLayoutBtn.child.add_child(icon);
        newLayoutBtn.connect('clicked', (self) => {
            params.onNewLayout();
            this._makeLegendDialog();
        });
    }
}