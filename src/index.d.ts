import { LayoutManager } from "@gnome-shell/main";

export {};

declare global {
    export const imports: {
        lang: any;
        ui: {
            layout: any;
            lightbox: any;
            messageTray: any;
            main: {
                notify: (text: string, body: string) => void;
                messageTray: {
                    add(source: any): any;
                };
                panel: any;
                wm: any;
                layoutManager: LayoutManager;
                uiGroup: any;
                extensionManager: any;
                overview: {
                    hide(): any;
                };
            };
            panelMenu: any;
            popupMenu: any;
            modalDialog: any;
            dialog: any;
            switcherPopup: {
                SwitcherPopup: any;
            };
        };
        misc: {
            extensionUtils: {
                initTranslations: (domain: string) => void;
                getCurrentExtension: () => any;
                openPrefs: () => void;
                getSettings: () => any;
            };
            config: any;
        };
        byteArray: {
            fromString: (input: string) => Uint8Array;
            fromArray: (input: number[]) => any;
            fromGBytes: (input: any) => Uint8Array;
            toString: (x: Uint8Array) => string;
        };
        gettext: any;
    };
    export interface Monitor {
        index: number;
        width: number;
        height: number;
        x: number;
        y: number;
    }

    export const log: (arg: any) => void;
}

declare module '@gi-types/gobject2' {
    export interface MetaInfo {
        GTypeName: string;
        GTypeFlags?: TypeFlags;
        Implements?: Function[];
        Properties?: { [K: string]: ParamSpec };
        Signals?: { [K: string]: SignalDefinition };
        Requires?: Function[];
        CssName?: string;
        Template?: string;
        Children?: string[];
        InternalChildren?: string[];
    }
}