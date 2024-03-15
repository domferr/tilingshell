export const logger =
    (prefix: string) =>
        (content: string): void =>
            log(`[modernwindowmanager] [${prefix}] ${content}`);

export const getCurrentExtension = (): any => imports.misc.extensionUtils.getCurrentExtension();

export const _ = imports.gettext.domain(getCurrentExtension().metadata.uuid).gettext;