import Gtk from "@gi-types/gtk4"; // Starting from GNOME 40, the preferences dialog uses GTK4
import Adw from "@gi-types/adw1";
import { logger } from "../utils/shell";
import Settings from "../settings";

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const debug = logger("prefs")

/**
 * Like `extension.js` this is used for any one-time setup like translations.
 *
 * @param metadata - The metadata.json file, parsed as JSON
 */
function init(metadata: { name: any; }) {
    debug(`initializing ${metadata.name} Preferences`);
}


/**
 * This function is called when the preferences window is first created to build
 * and return a GTK4 widget. Prior to version 42, the prefs.js needed a 
 * buildPrefsWidget function, returning a GtkWidget to be inserted in the 
 * preferences dialog.
 *
 * The preferences window will be a `Adw.PreferencesWindow`, and the widget
 * returned by this function will be added to an `Adw.PreferencesPage` or
 * `Adw.PreferencesGroup` if necessary.
 *
 * @returns {Gtk.Widget} the preferences widget
 */
function buildPrefsWidget(): Gtk.Widget {
    return new Gtk.Label({
        label: Me.metadata.name,
    });
}

/**
 * This function is called when the preferences window is first created to fill
 * the `Adw.PreferencesWindow`.
 *
 * @param {Adw.PreferencesWindow} window - The preferences window
 */
function fillPreferencesWindow(window: Adw.PreferencesWindow) {
    Settings.initialize();

    const prefsPage = new Adw.PreferencesPage({
        name: 'general',
        title: 'General',
        icon_name: 'dialog-information-symbolic',
    });
    window.add(prefsPage);

    // Appearence section
    const appearenceGroup = new Adw.PreferencesGroup({
        title: 'Appearance',
        description: `Configure the appearance of ${Me.metadata.name}`,
    });
    prefsPage.add(appearenceGroup);

    const showIndicatorRow = buildSwitchRow(
        Settings.SETTING_SHOW_INDICATOR,
        "Show Indicator",
        "Whether to show the panel indicator"
    );
    appearenceGroup.add(showIndicatorRow);

    Settings.connect(Settings.SETTING_LAYOUTS, () => {
        debug(`changed ${Settings.SETTING_LAYOUTS} to ${JSON.stringify(Settings.get_layouts())}`)
    })

    const innerGapsRow = buildSpinButtonRow(
        Settings.SETTING_INNER_GAPS,
        "Inner gaps",
        "Gaps between windows"
    );
    appearenceGroup.add(innerGapsRow);

    const outerGapsRow = buildSpinButtonRow(
        Settings.SETTING_OUTER_GAPS,
        "Outer gaps",
        "Gaps between a window and the monitor borders"
    );
    appearenceGroup.add(outerGapsRow);

    // Behaviour section
    const behaviourGroup = new Adw.PreferencesGroup({
        title: 'Behaviour',
        description: `Configure the behaviour of ${Me.metadata.name}`,
    });
    prefsPage.add(behaviourGroup);

    const pressCtrlRow = buildSwitchRow(
        Settings.SETTING_TILING_SYSTEM,
        "Enable tiling system",
        "Hold CTRL while moving a window to tile it"
    );
    behaviourGroup.add(pressCtrlRow);

    const pressAltRow = buildSwitchRow(
        Settings.SETTING_SPAN_MULTIPLE_TILES,
        "Span multiple tiles",
        "Hold ALT to span multiple tiles"
    );
    behaviourGroup.add(pressAltRow);

    const snapAssistRow = buildSwitchRow(
        Settings.SETTING_SNAP_ASSIST,
        "Enable snap assist",
        "Move the window on top of the screen to snap assist it"
    );
    behaviourGroup.add(snapAssistRow);
}

function buildSwitchRow(settingsKey: string, title: string, subtitle: string): Adw.ActionRow {
    const gtkSwitch = new Gtk.Switch({ vexpand: false, valign: Gtk.Align.CENTER });
    const adwRow = new Adw.ActionRow({
        title: title,
        subtitle: subtitle,
        activatableWidget: gtkSwitch
    });
    adwRow.add_suffix(gtkSwitch);
    Settings.bind(settingsKey, gtkSwitch, 'active');

    return adwRow;
}

function buildSpinButtonRow(settingsKey: string, title: string, subtitle: string) {
    const spinBtn = Gtk.SpinButton.new_with_range(0, 32, 1);
    spinBtn.set_vexpand(false);
    spinBtn.set_valign(Gtk.Align.CENTER);
    const adwRow = new Adw.ActionRow({
        title: title,
        subtitle: subtitle,
        activatableWidget: spinBtn
    });
    adwRow.add_suffix(spinBtn);
    Settings.bind(settingsKey, spinBtn, 'value');

    return adwRow;
}

export default { init, fillPreferencesWindow };