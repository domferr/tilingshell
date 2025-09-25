import { Meta } from '@gi.ext';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

function openPrefs() {
    // @ts-expect-error "This will be ok in GNOME <= 44 because
    // the build system will provide such function"
    if (Extension.openPrefs) {
        // GNOME <= 44
        // @ts-expect-error "This will be ok in GNOME"
        Extension.openPrefs();
    } else {
        // GNOME 45+
        Extension.lookupByUUID(
            'tilingshell@ferrarodomenico.com',
        )?.openPreferences();
    }
}

function getIsMaximized(window: Meta.Window) {
    if (window.get_maximized) {
        // GNOME <=48
        return window.get_maximized();
    }

    // GNOME 49+
    return window.is_maximized();
}

function setMaximizeFlags(window: Meta.Window, flags: Meta.MaximizeFlags) {
    if (!window.set_maximize_flags) {
        // GNOME <=48
        return window.maximize(flags);
    }

    // GNOME 49+
    return window.set_maximize_flags(flags);
}

function setUnmaximizeFlags(window: Meta.Window, flags: Meta.MaximizeFlags) {
    if (!window.set_maximize_flags) {
        // GNOME <=48
        return window.unmaximize(flags);
    }

    // GNOME 49+
    return window.set_unmaximize_flags(flags);
}

export {
    Extension,
    openPrefs,
    getIsMaximized,
    setMaximizeFlags,
    setUnmaximizeFlags,
};
