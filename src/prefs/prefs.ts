import Gtk from "@gi-types/gtk4"; // Starting from GNOME 40, the preferences dialog uses GTK4
import Adw from "@gi-types/adw1";
import Settings from "../settings";
import { logger } from "../utils/shell";
/*import Layout from "@/components/layout/Layout";
import GObject from "@gi-types/gobject2";
import Cairo from "@gi-types/cairo1";*/

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

    // Layouts section
    const layoutsGroup = new Adw.PreferencesGroup({
        title: 'Layouts',
        description: `Configure the layouts of ${Me.metadata.name}`,
    });
    prefsPage.add(layoutsGroup);

    const resetBtn = buildButtonRow(
        "Reset layouts", 
        "Reset layouts",
        "Bring back the default layouts",
        () => {
            Settings.reset_layouts_json();
            const layouts = Settings.get_layouts_json();
            const selected = Settings.get_selected_layouts().map(val => layouts[0].id);
            Settings.save_selected_layouts_json(selected);
        }
    );
    layoutsGroup.add(resetBtn);
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

function buildButtonRow(label: string, title: string, subtitle: string, onClick: () => void) {
    const btn = Gtk.Button.new_with_label(label);
    btn.connect("clicked", onClick);
    btn.set_vexpand(false);
    btn.set_valign(Gtk.Align.CENTER);
    const adwRow = new Adw.ActionRow({
        title: title,
        subtitle: subtitle,
        activatableWidget: btn
    });
    adwRow.add_suffix(btn);

    return adwRow;
}

export default { init, fillPreferencesWindow };

/*class LayoutWidget extends Gtk.DrawingArea {
    private _layout: Layout;
    
    static {
        GObject.registerClass(this);
    }

    constructor(
        params: Partial<Gtk.DrawingArea.ConstructorProperties> | undefined,
        layout: Layout
    ) {
        super(params);
        this._layout = layout;
        this.set_draw_func(this.drawFunc.bind(this));
    }

    private drawFunc(superDa: Gtk.DrawingArea, ctx: Cairo.Context) {
        const da = superDa as LayoutWidget;
        const maxHeight = da.get_allocated_height();
        const maxWidth = da.get_allocated_width();
        
        //const color = da.get_style_context().lookup_color("yellow");
        const color = da.get_style_context().get_color();
        //@ts-ignore
        ctx.setSourceRGBA(color.red, color.green, color.blue, color.alpha);
        // Because the cairo module isn't real, we have to use these to ignore `any`.
        // We keep them to the minimum possible scope to catch real errors.
        /* eslint-disable @typescript-eslint/no-unsafe-call */
        /* eslint-disable @typescript-eslint/no-unsafe-member-access */
        //@ts-ignore
        /*ctx.setLineCap(Cairo.LineCap.SQUARE);
        //@ts-ignore
        ctx.setAntialias(Cairo.Antialias.NONE);
        //@ts-ignore
        ctx.setLineWidth(1);

        //da.setSourceRGBA(ctx, dividerColor);
        const gaps = 8;

        this._layout.tiles.forEach(tile => {
            //@ts-ignore
            ctx.rectangle(tile.x * maxWidth + gaps, tile.y * maxHeight + gaps, (tile.width * maxWidth) - (gaps*2), (tile.height * maxHeight) - (gaps*2));
            //@ts-ignore
            ctx.fill();
        });

        //@ts-ignore
        ctx.setLineWidth(2);
    }
}*/