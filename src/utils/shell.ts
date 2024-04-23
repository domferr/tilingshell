export const logger =
    (prefix: string) =>
        (...content: any[]): void =>
            console.log("[modernwindowmanager]",`[${prefix}]`, ...content);
