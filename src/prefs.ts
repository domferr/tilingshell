import Gtk from "gi://Gtk"; // Starting from GNOME 40, the preferences dialog uses GTK4
import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Settings from "./settings";
import { logger } from "./utils/shell";
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
/*import Layout from "@/components/layout/Layout";
import GObject from "gi://GObject";
import Cairo from "@gi-types/cairo1";*/

const debug = logger("prefs");

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
        label: "Preferences",
    });
}

export default class TilingShellExtensionPreferences extends ExtensionPreferences {
    private readonly NAME = "Tiling Shell";

    /**
     * This function is called when the preferences window is first created to fill
     * the `Adw.PreferencesWindow`.
     *
     * @param {Adw.PreferencesWindow} window - The preferences window
     */
    fillPreferencesWindow(window: Adw.PreferencesWindow) {
        Settings.initialize(this.getSettings());

        const prefsPage = new Adw.PreferencesPage({
            name: 'general',
            title: 'General',
            iconName: 'dialog-information-symbolic',
        });
        window.add(prefsPage);

        // Appearence section
        const appearenceGroup = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: `Configure the appearance of ${this.NAME}`,
        });
        prefsPage.add(appearenceGroup);

        const showIndicatorRow = this._buildSwitchRow(
            Settings.SETTING_SHOW_INDICATOR,
            "Show Indicator",
            "Whether to show the panel indicator"
        );
        appearenceGroup.add(showIndicatorRow);

        const innerGapsRow = this._buildSpinButtonRow(
            Settings.SETTING_INNER_GAPS,
            "Inner gaps",
            "Gaps between windows"
        );
        appearenceGroup.add(innerGapsRow);

        const outerGapsRow = this._buildSpinButtonRow(
            Settings.SETTING_OUTER_GAPS,
            "Outer gaps",
            "Gaps between a window and the monitor borders"
        );
        appearenceGroup.add(outerGapsRow);

        // Behaviour section
        const behaviourGroup = new Adw.PreferencesGroup({
            title: 'Behaviour',
            description: `Configure the behaviour of ${this.NAME}`,
        });
        prefsPage.add(behaviourGroup);

        const restoreToOriginalSizeRow = this._buildSwitchRow(
            Settings.SETTING_RESTORE_WINDOW_ORIGINAL_SIZE,
            "Restore window size",
            "Whether to restore the windows to their original size when untiled"
        );
        behaviourGroup.add(restoreToOriginalSizeRow);

        const pressCtrlRow = this._buildSwitchRow(
            Settings.SETTING_TILING_SYSTEM,
            "Enable tiling system",
            "Hold CTRL while moving a window to tile it"
        );
        behaviourGroup.add(pressCtrlRow);

        const pressAltRow = this._buildSwitchRow(
            Settings.SETTING_SPAN_MULTIPLE_TILES,
            "Span multiple tiles",
            "Hold ALT to span multiple tiles"
        );
        behaviourGroup.add(pressAltRow);

        const resizeComplementingRow = this._buildSwitchRow(
            Settings.SETTING_RESIZE_COMPLEMENTING_WINDOWS,
            "Enable auto-resize of the complementing tiled windows",
            "When a tiled window is resized, auto-resize the other tiled windows near it"
        );
        behaviourGroup.add(resizeComplementingRow);

        const snapAssistRow = this._buildSwitchRow(
            Settings.SETTING_SNAP_ASSIST,
            "Enable snap assist",
            "Move the window on top of the screen to snap assist it"
        );
        behaviourGroup.add(snapAssistRow);

        // Layouts section
        const layoutsGroup = new Adw.PreferencesGroup({
            title: 'Layouts',
            description: `Configure the layouts of ${this.NAME}`,
        });
        prefsPage.add(layoutsGroup);

        const editLayoutsBtn =this._buildButtonRow(
            "Edit layouts", 
            "Edit layouts",
            "Open the layouts editor",
            () => this._openLayoutEditor()
        );
        layoutsGroup.add(editLayoutsBtn);

        const resetBtn =this._buildButtonRow(
            "Reset layouts", 
            "Reset layouts",
            "Bring back the default layouts",
            () => {
                Settings.reset_layouts_json();
                const layouts = Settings.get_layouts_json();
                const selected = Settings.get_selected_layouts().map(val => layouts[0].id);
                Settings.save_selected_layouts_json(selected);
            },
            "destructive-action"
        );
        layoutsGroup.add(resetBtn);

        window.searchEnabled = true;
    }

    _buildSwitchRow(settingsKey: string, title: string, subtitle: string): Adw.ActionRow {
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

    _buildSpinButtonRow(settingsKey: string, title: string, subtitle: string) {
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

    _buildButtonRow(label: string, title: string, subtitle: string, onClick: () => void, styleClass?: string) {
        const btn = Gtk.Button.new_with_label(label);
        if (styleClass) btn.add_css_class(styleClass);
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

    _openLayoutEditor() {
        try {
            Gio.DBus.session.call_sync(
                'org.gnome.Shell',
                '/org/gnome/shell/extensions/TilingShell',
                'org.gnome.Shell.Extensions.TilingShell',
                'openLayoutEditor',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
        } catch (e) {
            //@ts-ignore
            if (e instanceof Gio.DBusError) //@ts-ignore
                Gio.DBusError.strip_remote_error(e);
        
            console.error(e);
        }
    }
}

//export default { init, fillPreferencesWindow };

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