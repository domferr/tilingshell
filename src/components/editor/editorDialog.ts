import Settings from '@settings/settings';
import { registerGObjectClass } from '@/utils/gjs';
import { St, Clutter, Gio } from '@gi.ext';
import LayoutButton from '../../indicator/layoutButton';
import GlobalState from '@utils/globalState';
import Layout from '@/components/layout/Layout';

import Tile from '@/components/layout/Tile';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { enableScalingFactorSupport, getMonitorScalingFactor } from '@utils/ui';
import { _ } from '../../translations';
import { widgetOrientation } from '@utils/gnomesupport';

@registerGObjectClass
export default class EditorDialog extends ModalDialog.ModalDialog {
    private readonly _layoutHeight: number = 72;
    private readonly _layoutWidth: number = 128; // 16:9 ratio. -> (16*layoutHeight) / 9 and then rounded to int
    private readonly _gapsSize: number = 3;

    private _layoutsBoxLayout: St.BoxLayout;

    constructor(params: {
        enableScaling: boolean;
        onDeleteLayout: (ind: number, lay: Layout) => void;
        onSelectLayout: (ind: number, lay: Layout) => void;
        onNewLayout: () => void;
        legend: boolean;
        onClose: () => void;
        path: string;
    }) {
        super({
            destroyOnClose: true,
            styleClass: 'editor-dialog',
        });

        if (params.enableScaling) {
            const monitor = Main.layoutManager.findMonitorForActor(this);
            const scalingFactor = getMonitorScalingFactor(
                monitor?.index || Main.layoutManager.primaryIndex,
            );
            enableScalingFactorSupport(this, scalingFactor);
        }

        this.contentLayout.add_child(
            new St.Label({
                text: _('Select the layout to edit'),
                xAlign: Clutter.ActorAlign.CENTER,
                xExpand: true,
                styleClass: 'editor-dialog-title',
            }),
        );

        this._layoutsBoxLayout = new St.BoxLayout({
            styleClass: 'layouts-box-layout',
            xAlign: Clutter.ActorAlign.CENTER,
        });
        this.contentLayout.add_child(this._layoutsBoxLayout);

        if (!params.legend) {
            this._drawLayouts({
                layouts: GlobalState.get().layouts,
                ...params,
            });
            /* this._signals.connect(GlobalState.get(), GlobalState.SIGNAL_LAYOUTS_CHANGED, () => {
                this._drawLayouts({ layouts: GlobalState.get().layouts, ...params });
            });*/
        }

        this.addButton({
            label: _('Close'),
            default: true,
            key: Clutter.KEY_Escape,
            action: () => params.onClose(),
        });

        if (params.legend) {
            this._makeLegendDialog({
                onClose: params.onClose,
                path: params.path,
            });
        }
    }

    private _makeLegendDialog(params: { onClose: () => void; path: string }) {
        const suggestion1 = new St.BoxLayout();
        // LEFT-CLICK to split a tile
        suggestion1.add_child(
            new St.Label({
                text: 'LEFT CLICK',
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                styleClass: 'button kbd',
                xExpand: false,
                pseudoClass: 'active',
            }),
        );
        suggestion1.add_child(
            new St.Label({
                text: ` ${_('to split a tile')}.`,
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                styleClass: '',
                xExpand: false,
            }),
        );

        const suggestion2 = new St.BoxLayout();
        // LEFT-CLICK + CTRL to split a tile vertically
        suggestion2.add_child(
            new St.Label({
                text: 'LEFT CLICK',
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                styleClass: 'button kbd',
                xExpand: false,
                pseudoClass: 'active',
            }),
        );
        suggestion2.add_child(
            new St.Label({
                text: ' + ',
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                styleClass: '',
                xExpand: false,
            }),
        );
        suggestion2.add_child(
            new St.Label({
                text: 'CTRL',
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                styleClass: 'button kbd',
                xExpand: false,
                pseudoClass: 'active',
            }),
        );
        suggestion2.add_child(
            new St.Label({
                text: ` ${_('to split a tile vertically')}.`,
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                styleClass: '',
                xExpand: false,
            }),
        );

        const suggestion3 = new St.BoxLayout();
        // RIGHT-CLICK to delete a tile
        suggestion3.add_child(
            new St.Label({
                text: 'RIGHT CLICK',
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                styleClass: 'button kbd',
                xExpand: false,
                pseudoClass: 'active',
            }),
        );
        suggestion3.add_child(
            new St.Label({
                text: ` ${_('to delete a tile')}.`,
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                styleClass: '',
                xExpand: false,
            }),
        );

        const suggestion4 = new St.BoxLayout({
            xExpand: true,
            margin_top: 16,
        });
        // use indicator to save or cancel
        suggestion4.add_child(
            new St.Icon({
                iconSize: 16,
                yAlign: Clutter.ActorAlign.CENTER,
                gicon: Gio.icon_new_for_string(
                    `${params.path}/icons/indicator-symbolic.svg`,
                ),
                styleClass: 'button kbd',
                pseudoClass: 'active',
            }),
        );
        suggestion4.add_child(
            new St.Label({
                text: ` ${_('use the indicator button to save or cancel')}.`,
                xAlign: Clutter.ActorAlign.CENTER,
                yAlign: Clutter.ActorAlign.CENTER,
                styleClass: '',
                xExpand: false,
            }),
        );

        const legend = new St.BoxLayout({
            styleClass: 'legend',
            ...widgetOrientation(true),
        });
        legend.add_child(suggestion1);
        legend.add_child(suggestion2);
        legend.add_child(suggestion3);
        legend.add_child(suggestion4);

        this.contentLayout.destroy_all_children();
        this.contentLayout.add_child(
            new St.Label({
                text: _('How to use the editor'),
                xAlign: Clutter.ActorAlign.CENTER,
                xExpand: true,
                styleClass: 'editor-dialog-title',
            }),
        );
        this.contentLayout.add_child(legend);

        this.clearButtons();
        this.addButton({
            label: _('Start editing'),
            default: true,
            key: Clutter.KEY_Escape,
            action: params.onClose,
        });
    }

    private _drawLayouts(params: {
        layouts: Layout[];
        onDeleteLayout: (ind: number, lay: Layout) => void;
        onSelectLayout: (ind: number, lay: Layout) => void;
        onNewLayout: () => void;
        onClose: () => void;
        path: string;
    }) {
        const gaps = Settings.get_inner_gaps(1).top > 0 ? this._gapsSize : 0;
        this._layoutsBoxLayout.destroy_all_children();

        params.layouts.forEach((lay, btnInd) => {
            const box = new St.BoxLayout({
                xAlign: Clutter.ActorAlign.CENTER,
                styleClass: 'layout-button-container',
                ...widgetOrientation(true),
            });
            this._layoutsBoxLayout.add_child(box);
            const btn = new LayoutButton(
                box,
                lay,
                gaps,
                this._layoutHeight,
                this._layoutWidth,
            );
            if (params.layouts.length > 1) {
                const deleteBtn = new St.Button({
                    xExpand: false,
                    xAlign: Clutter.ActorAlign.CENTER,
                    styleClass:
                        'message-list-clear-button icon-button button delete-layout-button',
                });
                deleteBtn.child = new St.Icon({
                    gicon: Gio.icon_new_for_string(
                        `${params.path}/icons/delete-symbolic.svg`,
                    ),
                    iconSize: 16,
                });
                deleteBtn.connect('clicked', () => {
                    params.onDeleteLayout(btnInd, lay);
                    this._drawLayouts({
                        ...params,
                        layouts: GlobalState.get().layouts,
                    });
                });
                box.add_child(deleteBtn);
            }
            btn.connect('clicked', () => {
                params.onSelectLayout(btnInd, lay);
                this._makeLegendDialog({
                    onClose: params.onClose,
                    path: params.path,
                });
            });
            return btn;
        });

        const box = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.CENTER,
            styleClass: 'layout-button-container',
            ...widgetOrientation(true),
        });
        this._layoutsBoxLayout.add_child(box);
        const newLayoutBtn = new LayoutButton(
            box,
            new Layout(
                [new Tile({ x: 0, y: 0, width: 1, height: 1, groups: [] })],
                'New Layout',
            ),
            gaps,
            this._layoutHeight,
            this._layoutWidth,
        );
        const icon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                `${params.path}/icons/add-symbolic.svg`,
            ),
            iconSize: 32,
        });
        icon.set_size(newLayoutBtn.child.width, newLayoutBtn.child.height);
        newLayoutBtn.child.add_child(icon);
        newLayoutBtn.connect('clicked', () => {
            params.onNewLayout();
            this._makeLegendDialog({
                onClose: params.onClose,
                path: params.path,
            });
        });
    }
}
