export {};

declare module 'gi://GObject' {
    export interface MetaInfo {
        GTypeName: string;
        //@ts-ignore
        GTypeFlags?: TypeFlags;
        Implements?: Function[];
        //@ts-ignore
        Properties?: { [K: string]: ParamSpec };
        //@ts-ignore
        Signals?: { [K: string]: SignalDefinition };
        Requires?: Function[];
        CssName?: string;
        Template?: string;
        Children?: string[];
        InternalChildren?: string[];
    }
}