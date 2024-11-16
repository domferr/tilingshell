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

export { Extension, openPrefs };
