// entry point file for all the translation related stuff. It is easier for the build system to
// work with this file only to support GNOME shells <= 44 (e.g converting the imports)
// Note: DO NOT import this file from prefs.ts or any preferences related file

// eslint-disable-next-line prettier/prettier
import { gettext as _, ngettext, pgettext } from 'resource:///org/gnome/shell/extensions/extension.js';

export {
    _,
    ngettext, // meant for strings that may or may not be plural like "1 Apple" and "2 Apples"
    pgettext, // used when the translator may require context for the string. For example, irregular verbs like "Read" in English, or two elements like a window title and a button which use the same word (e.g. "Restart")
};
