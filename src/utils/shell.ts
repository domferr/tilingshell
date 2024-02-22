import { Settings } from '@gi-types/gio2';

export const logger =
    (prefix: string) =>
        (content: string): void =>
            log(`[modernwindowmanager] [${prefix}] ${content}`);

export const getCurrentExtension = (): any => imports.misc.extensionUtils.getCurrentExtension();

export const getCurrentExtensionSettings = (): Settings => imports.misc.extensionUtils.getSettings();

export const _ = imports.gettext.domain(getCurrentExtension().metadata.uuid).gettext;