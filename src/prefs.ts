import Gtk from 'gi://Gtk'; // Starting from GNOME 40, the preferences dialog uses GTK4
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Settings, { ActivationKey } from './settings/settings';
import { logger } from './utils/shell';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Layout from '@components/layout/Layout';

/* import Layout from "@/components/layout/Layout";
import Cairo from "@gi-types/cairo1";*/

const debug = logger('prefs');

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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildPrefsWidget(): Gtk.Widget {
    return new Gtk.Label({
        label: 'Preferences',
    });
}

export default class TilingShellExtensionPreferences extends ExtensionPreferences {
    private readonly NAME = 'Tiling Shell';

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
            'Show Indicator',
            'Whether to show the panel indicator',
        );
        appearenceGroup.add(showIndicatorRow);

        const innerGapsRow = this._buildSpinButtonRow(
            Settings.SETTING_INNER_GAPS,
            'Inner gaps',
            'Gaps between windows',
        );
        appearenceGroup.add(innerGapsRow);

        const outerGapsRow = this._buildSpinButtonRow(
            Settings.SETTING_OUTER_GAPS,
            'Outer gaps',
            'Gaps between a window and the monitor borders',
        );
        appearenceGroup.add(outerGapsRow);

        const blur = new Adw.ExpanderRow({
            title: 'Blur (experimental feature)',
            subtitle: 'Apply blur effect to Snap Assistant and tile previews',
        });
        appearenceGroup.add(blur);

        const snapAssistantThresholdRow = this._buildSpinButtonRow(
            Settings.SETTING_SNAP_ASSISTANT_THRESHOLD,
            'Snap Assistant threshold',
            'Minimum distance from the Snap Assistant to the pointer to open it',
            0,
            512,
        );
        appearenceGroup.add(snapAssistantThresholdRow);

        blur.add_row(
            this._buildSwitchRow(
                Settings.SETTING_ENABLE_BLUR_SNAP_ASSISTANT,
                'Snap Assistant',
                'Apply blur effect to Snap Assistant',
            ),
        );
        blur.add_row(
            this._buildSwitchRow(
                Settings.SETTING_ENABLE_BLUR_SELECTED_TILEPREVIEW,
                'Selected tile preview',
                'Apply blur effect to selected tile preview',
            ),
        );

        // Behaviour section
        const behaviourGroup = new Adw.PreferencesGroup({
            title: 'Behaviour',
            description: `Configure the behaviour of ${this.NAME}`,
        });
        prefsPage.add(behaviourGroup);

        const snapAssistRow = this._buildSwitchRow(
            Settings.SETTING_SNAP_ASSIST,
            'Enable Snap Assistant',
            'Move the window on top of the screen to snap assist it',
        );
        behaviourGroup.add(snapAssistRow);

        const enableTilingSystemRow = this._buildSwitchRow(
            Settings.SETTING_TILING_SYSTEM,
            'Enable Tiling System',
            'Hold the activation key while moving a window to tile it',
            this._buildActivationKeysDropDown(
                Settings.get_tiling_system_activation_key(),
                (newVal: ActivationKey) =>
                    Settings.set_tiling_system_activation_key(newVal),
            ),
        );
        behaviourGroup.add(enableTilingSystemRow);

        const spanMultipleTilesRow = this._buildSwitchRow(
            Settings.SETTING_SPAN_MULTIPLE_TILES,
            'Span multiple tiles',
            'Hold the activation key to span multiple tiles',
            this._buildActivationKeysDropDown(
                Settings.get_span_multiple_tiles_activation_key(),
                (newVal: ActivationKey) =>
                    Settings.set_span_multiple_tiles_activation_key(newVal),
            ),
        );
        behaviourGroup.add(spanMultipleTilesRow);

        const resizeComplementingRow = this._buildSwitchRow(
            Settings.SETTING_RESIZE_COMPLEMENTING_WINDOWS,
            'Enable auto-resize of the complementing tiled windows',
            'When a tiled window is resized, auto-resize the other tiled windows near it',
        );
        behaviourGroup.add(resizeComplementingRow);

        const restoreToOriginalSizeRow = this._buildSwitchRow(
            Settings.SETTING_RESTORE_WINDOW_ORIGINAL_SIZE,
            'Restore window size',
            'Whether to restore the windows to their original size when untiled',
        );
        behaviourGroup.add(restoreToOriginalSizeRow);

        const overrideWindowMenuRow = this._buildSwitchRow(
            Settings.SETTING_OVERRIDE_WINDOW_MENU,
            'Add snap assistant and auto-tile buttons to window menu',
            'Add snap assistant and auto-tile buttons in the menu that shows up when you right click on a window title',
        );
        behaviourGroup.add(overrideWindowMenuRow);

        // Screen Edges section
        const activeScreenEdgesGroup = new Adw.PreferencesGroup({
            title: 'Screen Edges',
            description:
                'Drag windows against the top, left and right screen edges to resize them',
            headerSuffix: new Gtk.Switch({
                vexpand: false,
                valign: Gtk.Align.CENTER,
            }),
        });
        Settings.bind(
            Settings.SETTING_ACTIVE_SCREEN_EDGES,
            activeScreenEdgesGroup.headerSuffix,
            'active',
        );

        const topEdgeMaximize = this._buildSwitchRow(
            Settings.SETTING_TOP_EDGE_MAXIMIZE,
            'Drag against top edge to maximize window',
            'Drag windows against the top edge to maximize them',
        );
        Settings.bind(
            Settings.SETTING_ACTIVE_SCREEN_EDGES,
            topEdgeMaximize,
            'sensitive',
        );
        activeScreenEdgesGroup.add(topEdgeMaximize);

        const quarterTiling = this._buildScaleRow(
            'Quarter tiling activation area',
            'Activation area to trigger quarter tiling (% of the screen)',
            (sc: Gtk.Scale) => {
                Settings.set_quarter_tiling_threshold(sc.get_value());
            },
            Settings.get_quarter_tiling_threshold(),
            1,
            50,
            1,
        );
        Settings.bind(
            Settings.SETTING_ACTIVE_SCREEN_EDGES,
            quarterTiling,
            'sensitive',
        );
        activeScreenEdgesGroup.add(quarterTiling);

        prefsPage.add(activeScreenEdgesGroup);

        // Layouts section
        const layoutsGroup = new Adw.PreferencesGroup({
            title: 'Layouts',
            description: `Configure the layouts of ${this.NAME}`,
        });
        prefsPage.add(layoutsGroup);

        const editLayoutsBtn = this._buildButtonRow(
            'Edit layouts',
            'Edit layouts',
            'Open the layouts editor',
            () => this._openLayoutEditor(),
        );
        layoutsGroup.add(editLayoutsBtn);

        const exportLayoutsBtn = this._buildButtonRow(
            'Export layouts',
            'Export layouts',
            'Export layouts to a file',
            () => {
                const fc = new Gtk.FileChooserDialog({
                    title: 'Export layouts',
                    select_multiple: false,
                    action: Gtk.FileChooserAction.SAVE,
                    transient_for: window,
                    filter: new Gtk.FileFilter({
                        suffixes: ['json'],
                        name: 'JSON',
                    }),
                });
                fc.set_current_folder(
                    Gio.File.new_for_path(GLib.get_home_dir()),
                );
                fc.add_button('Cancel', Gtk.ResponseType.CANCEL);
                fc.add_button('Save', Gtk.ResponseType.OK);
                fc.connect(
                    'response',
                    (_source: Gtk.FileChooserDialog, response_id: number) => {
                        try {
                            if (response_id === Gtk.ResponseType.OK) {
                                const file = _source.get_file();
                                if (!file) throw new Error('no file selected');

                                debug(
                                    `Create file with path ${file.get_path()}`,
                                );
                                const content = JSON.stringify(
                                    Settings.get_layouts_json(),
                                );
                                file.replace_contents_bytes_async(
                                    new TextEncoder().encode(content),
                                    null,
                                    false,
                                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                                    null,
                                    (thisFile, res) => {
                                        try {
                                            thisFile?.replace_contents_finish(
                                                res,
                                            );
                                        } catch (e) {
                                            debug(e);
                                        }
                                    },
                                );
                            }
                        } catch (error: unknown) {
                            debug(error);
                        }

                        _source.destroy();
                    },
                );

                fc.present();
            },
        );
        layoutsGroup.add(exportLayoutsBtn);

        const importLayoutsBtn = this._buildButtonRow(
            'Import layouts',
            'Import layouts',
            'Import layouts from a file',
            () => {
                const fc = new Gtk.FileChooserDialog({
                    title: 'Select layouts file',
                    select_multiple: false,
                    action: Gtk.FileChooserAction.OPEN,
                    transient_for: window,
                    filter: new Gtk.FileFilter({
                        suffixes: ['json'],
                        name: 'JSON',
                    }),
                });
                fc.set_current_folder(
                    Gio.File.new_for_path(GLib.get_home_dir()),
                );
                fc.add_button('Cancel', Gtk.ResponseType.CANCEL);
                fc.add_button('Open', Gtk.ResponseType.OK);
                fc.connect(
                    'response',
                    (_source: Gtk.FileChooserDialog, response_id: number) => {
                        try {
                            if (response_id === Gtk.ResponseType.OK) {
                                const file = _source.get_file();
                                if (!file) {
                                    _source.destroy();
                                    return;
                                }
                                debug(`Selected path ${file.get_path()}`);
                                const [success, content] =
                                    file.load_contents(null);
                                if (success) {
                                    let importedLayouts = JSON.parse(
                                        new TextDecoder('utf-8').decode(
                                            content,
                                        ),
                                    ) as Layout[];
                                    if (importedLayouts.length === 0) {
                                        throw new Error(
                                            'At least one layout is required',
                                        );
                                    }

                                    importedLayouts = importedLayouts.filter(
                                        (layout) => layout.tiles.length > 0,
                                    );
                                    const newLayouts =
                                        Settings.get_layouts_json();
                                    newLayouts.push(...importedLayouts);
                                    Settings.save_layouts_json(newLayouts);
                                } else {
                                    debug('Error while opening file');
                                }
                            }
                        } catch (error: unknown) {
                            debug(error);
                        }

                        _source.destroy();
                    },
                );

                fc.present();
            },
        );
        layoutsGroup.add(importLayoutsBtn);

        const resetBtn = this._buildButtonRow(
            'Reset layouts',
            'Reset layouts',
            'Bring back the default layouts',
            () => {
                Settings.reset_layouts_json();
                const layouts = Settings.get_layouts_json();
                const selected = Settings.get_selected_layouts().map(
                    () => layouts[0].id,
                );
                Settings.save_selected_layouts_json(selected);
            },
            'destructive-action',
        );
        layoutsGroup.add(resetBtn);

        // Keybindings section
        const keybindingsGroup = new Adw.PreferencesGroup({
            title: 'Keybindings',
            description:
                'Use hotkeys to move the focused window through the tiles of the active layout',
            headerSuffix: new Gtk.Switch({
                vexpand: false,
                valign: Gtk.Align.CENTER,
            }),
        });
        Settings.bind(
            Settings.SETTING_ENABLE_MOVE_KEYBINDINGS,
            keybindingsGroup.headerSuffix,
            'active',
        );
        prefsPage.add(keybindingsGroup);

        const moveRightKB = this._buildShortcutButtonRow(
            Settings.get_kb_move_window_right(),
            'Move window to right tile',
            'Move the focused window to the tile on its right',
            (_: unknown, value: string) =>
                Settings.set_kb_move_window_right(value),
        );
        Settings.bind(
            Settings.SETTING_ENABLE_MOVE_KEYBINDINGS,
            moveRightKB,
            'sensitive',
        );
        keybindingsGroup.add(moveRightKB);

        const moveLeftKB = this._buildShortcutButtonRow(
            Settings.get_kb_move_window_left(),
            'Move window to left tile',
            'Move the focused window to the tile on its left',
            (_: unknown, value: string) =>
                Settings.set_kb_move_window_left(value),
        );
        Settings.bind(
            Settings.SETTING_ENABLE_MOVE_KEYBINDINGS,
            moveLeftKB,
            'sensitive',
        );
        keybindingsGroup.add(moveLeftKB);

        const moveUpKB = this._buildShortcutButtonRow(
            Settings.get_kb_move_window_up(),
            'Move window to tile above',
            'Move the focused window to the tile above',
            (_: unknown, value: string) =>
                Settings.set_kb_move_window_up(value),
        );
        Settings.bind(
            Settings.SETTING_ENABLE_MOVE_KEYBINDINGS,
            moveUpKB,
            'sensitive',
        );
        keybindingsGroup.add(moveUpKB);

        const moveDownKB = this._buildShortcutButtonRow(
            Settings.get_kb_move_window_down(),
            'Move window to tile below',
            'Move the focused window to the tile below',
            (_: unknown, value: string) =>
                Settings.set_kb_move_window_down(value),
        );
        Settings.bind(
            Settings.SETTING_ENABLE_MOVE_KEYBINDINGS,
            moveDownKB,
            'sensitive',
        );
        keybindingsGroup.add(moveDownKB);

        // footer
        const footerGroup = new Adw.PreferencesGroup();
        prefsPage.add(footerGroup);

        const buttons = new Gtk.Box({
            hexpand: false,
            spacing: 8,
            margin_bottom: 16,
            halign: Gtk.Align.CENTER,
        });
        buttons.append(
            this._buildLinkButton(
                '♥︎ Donate on ko-fi',
                'https://ko-fi.com/domferr',
            ),
        );
        buttons.append(
            this._buildLinkButton(
                'Report a bug',
                'https://github.com/domferr/tilingshell/issues/new?template=bug_report.md',
            ),
        );
        buttons.append(
            this._buildLinkButton(
                'Request a feature',
                'https://github.com/domferr/tilingshell/issues/new?template=feature_request.md',
            ),
        );
        footerGroup.add(buttons);

        footerGroup.add(
            new Gtk.Label({
                label: 'Have issues, you want to suggest a new feature or contribute?',
                margin_bottom: 4,
            }),
        );
        footerGroup.add(
            new Gtk.Label({
                label: 'Open a new issue on <a href="https://github.com/domferr/tilingshell">GitHub</a>!',
                useMarkup: true,
                margin_bottom: 32,
            }),
        );

        if (this.metadata['version-name']) {
            footerGroup.add(
                new Gtk.Label({
                    label: `· Tiling Shell v${this.metadata['version-name']} ·`,
                }),
            );
        }

        window.searchEnabled = true;
        window.connect('close-request', () => {
            Settings.destroy();
        });
    }

    _buildSwitchRow(
        settingsKey: string,
        title: string,
        subtitle: string,
        suffix?: Gtk.Widget,
    ): Adw.ActionRow {
        const gtkSwitch = new Gtk.Switch({
            vexpand: false,
            valign: Gtk.Align.CENTER,
        });
        const adwRow = new Adw.ActionRow({
            title,
            subtitle,
            activatableWidget: gtkSwitch,
        });
        if (suffix) adwRow.add_suffix(suffix);
        adwRow.add_suffix(gtkSwitch);
        Settings.bind(settingsKey, gtkSwitch, 'active');

        return adwRow;
    }

    _buildSpinButtonRow(
        settingsKey: string,
        title: string,
        subtitle: string,
        min = 0,
        max = 32,
    ) {
        const spinBtn = Gtk.SpinButton.new_with_range(min, max, 1);
        spinBtn.set_vexpand(false);
        spinBtn.set_valign(Gtk.Align.CENTER);
        const adwRow = new Adw.ActionRow({
            title,
            subtitle,
            activatableWidget: spinBtn,
        });
        adwRow.add_suffix(spinBtn);
        Settings.bind(settingsKey, spinBtn, 'value');

        return adwRow;
    }

    _buildButtonRow(
        label: string,
        title: string,
        subtitle: string,
        onClick: () => void,
        styleClass?: string,
    ) {
        const btn = Gtk.Button.new_with_label(label);
        if (styleClass) btn.add_css_class(styleClass);
        btn.connect('clicked', onClick);
        btn.set_vexpand(false);
        btn.set_valign(Gtk.Align.CENTER);
        const adwRow = new Adw.ActionRow({
            title,
            subtitle,
            activatableWidget: btn,
        });
        adwRow.add_suffix(btn);

        return adwRow;
    }

    _openLayoutEditor() {
        try {
            Gio.DBus.session.call_sync(
                'org.gnome.Shell',
                '/org/gnome/Shell/Extensions/TilingShell',
                'org.gnome.Shell.Extensions.TilingShell',
                'openLayoutEditor',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
            );
        } catch (e) {
            if (e instanceof Gio.DBusError) Gio.DBusError.strip_remote_error(e);

            console.error(e);
        }
    }

    _buildActivationKeysDropDown(
        value: ActivationKey,
        onSelected: (v: ActivationKey) => void,
        styleClass?: string,
    ) {
        const options = new Gtk.StringList();
        const activationKeys = [
            ActivationKey.CTRL,
            ActivationKey.ALT,
            ActivationKey.SUPER,
        ];
        activationKeys.forEach((k) => options.append(ActivationKey[k]));
        options.append('(None)');
        const dropdown = new Gtk.DropDown({
            model: options,
            selected: value,
        });
        dropdown.connect('notify::selected-item', (dd: Gtk.DropDown) => {
            const index = dd.get_selected();
            const selected =
                index < 0 || index >= activationKeys.length
                    ? ActivationKey.NONE
                    : activationKeys[index];
            onSelected(selected);
        });
        if (styleClass) dropdown.add_css_class(styleClass);
        dropdown.set_vexpand(false);
        dropdown.set_valign(Gtk.Align.CENTER);
        return dropdown;
    }

    _buildLinkButton(label: string, uri: string): Gtk.Button {
        const btn = new Gtk.Button({
            label,
            hexpand: false,
        });
        btn.connect('clicked', () => {
            Gtk.show_uri(null, uri, Gdk.CURRENT_TIME);
        });
        return btn;
    }

    _buildShortcutButtonRow(
        shortcut: string,
        title: string,
        subtitle: string,
        onChange: (_: unknown, value: string) => void,
        styleClass?: string,
    ) {
        const btn = new ShortcutSettingButton(shortcut);
        if (styleClass) btn.add_css_class(styleClass);
        btn.set_vexpand(false);
        btn.set_valign(Gtk.Align.CENTER);
        const adwRow = new Adw.ActionRow({
            title,
            subtitle,
            activatableWidget: btn,
        });
        adwRow.add_suffix(btn);

        btn.connect('changed', onChange);

        return adwRow;
    }

    _buildScaleRow(
        title: string,
        subtitle: string,
        onChange: (scale: Gtk.Scale) => void,
        initialValue: number,
        min: number,
        max: number,
        step: number,
        /* styleClass?: string,*/
    ): Adw.ActionRow {
        const scale = Gtk.Scale.new_with_range(
            Gtk.Orientation.HORIZONTAL,
            min,
            max,
            step,
        );
        scale.set_value(initialValue);
        scale.set_vexpand(false);
        scale.set_valign(Gtk.Align.CENTER);
        const adwRow = new Adw.ActionRow({
            title,
            subtitle,
            activatableWidget: scale,
        });
        scale.connect('value-changed', onChange);
        scale.set_size_request(150, -1);
        scale.set_digits(0);
        scale.set_draw_value(true);
        /* const controller = new Gtk.EventControllerScroll({
            propagation_phase: Gtk.PropagationPhase.CAPTURE,
            flags: Gtk.EventControllerScrollFlags.HORIZONTAL,
        });
        controller.connect('scroll', () => {
            console.debug('ON SCROOOOLL');
        });
        adwRow.add_controller(controller);*/
        adwRow.add_suffix(scale);
        return adwRow;
    }
}

// eslint-disable-next-line no-unused-vars
const ShortcutSettingButton = class extends Gtk.Button {
    static {
        GObject.registerClass(
            {
                Properties: {
                    shortcut: GObject.ParamSpec.string(
                        'shortcut',
                        'shortcut',
                        'The shortcut',
                        GObject.ParamFlags.READWRITE,
                        '',
                    ),
                },
                Signals: {
                    changed: { param_types: [GObject.TYPE_STRING] },
                },
            },
            this,
        );
    }

    private _editor: Adw.Window | null;
    private _label: Gtk.ShortcutLabel;
    private shortcut: string;

    constructor(value: string) {
        super({
            halign: Gtk.Align.CENTER,
            hexpand: false,
            vexpand: false,
            has_frame: false,
        });

        this._editor = null;
        this._label = new Gtk.ShortcutLabel({
            disabled_text: 'New accelerator…',
            valign: Gtk.Align.CENTER,
            hexpand: false,
            vexpand: false,
        });

        this.set_child(this._label);

        // Bind signals
        this.connect('clicked', this._onActivated.bind(this));
        this.shortcut = value;
        this._label.set_accelerator(this.shortcut);
        this.bind_property(
            'shortcut',
            this._label,
            'accelerator',
            GObject.BindingFlags.DEFAULT,
        );
    }

    _onActivated(widget: Gtk.Widget) {
        const ctl = new Gtk.EventControllerKey();

        const content = new Adw.StatusPage({
            title: 'New accelerator…',
            // description: this._description,
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
        });

        this._editor = new Adw.Window({
            modal: true,
            hide_on_close: true,
            // @ts-expect-error "widget has get_root function"
            transient_for: widget.get_root(),
            width_request: 480,
            height_request: 320,
            content,
        });

        this._editor.add_controller(ctl);
        ctl.connect('key-pressed', this._onKeyPressed.bind(this));
        this._editor.present();
    }

    _onKeyPressed(
        _widget: Gtk.Widget,
        keyval: number,
        keycode: number,
        state: number,
    ) {
        let mask = state & Gtk.accelerator_get_default_mod_mask();
        mask &= ~Gdk.ModifierType.LOCK_MASK;

        if (!mask && keyval === Gdk.KEY_Escape) {
            this._editor?.close();
            return Gdk.EVENT_STOP;
        }

        if (
            !this.isValidBinding(mask, keycode, keyval) ||
            !this.isValidAccel(mask, keyval)
        )
            return Gdk.EVENT_STOP;

        if (!keyval && !keycode) {
            this._editor?.destroy();
            return Gdk.EVENT_STOP;
        } else {
            this.shortcut = Gtk.accelerator_name_with_keycode(
                null,
                keyval,
                keycode,
                mask,
            );
            this._label.set_accelerator(this.shortcut);
            this.emit('changed', this.shortcut);
        }

        this._editor?.destroy();
        return Gdk.EVENT_STOP;
    }

    // Functions from https://gitlab.gnome.org/GNOME/gnome-control-center/-/blob/main/panels/keyboard/keyboard-shortcuts.c
    keyvalIsForbidden(keyval: number) {
        return [
            // Navigation keys
            Gdk.KEY_Home,
            Gdk.KEY_Left,
            Gdk.KEY_Up,
            Gdk.KEY_Right,
            Gdk.KEY_Down,
            Gdk.KEY_Page_Up,
            Gdk.KEY_Page_Down,
            Gdk.KEY_End,
            Gdk.KEY_Tab,

            // Return
            Gdk.KEY_KP_Enter,
            Gdk.KEY_Return,

            Gdk.KEY_Mode_switch,
        ].includes(keyval);
    }

    isValidBinding(mask: number, keycode: number, keyval: number) {
        return !(
            mask === 0 ||
            // @ts-expect-error "Gdk has SHIFT_MASK"
            (mask === Gdk.SHIFT_MASK &&
                keycode !== 0 &&
                ((keyval >= Gdk.KEY_a && keyval <= Gdk.KEY_z) ||
                    (keyval >= Gdk.KEY_A && keyval <= Gdk.KEY_Z) ||
                    (keyval >= Gdk.KEY_0 && keyval <= Gdk.KEY_9) ||
                    (keyval >= Gdk.KEY_kana_fullstop &&
                        keyval <= Gdk.KEY_semivoicedsound) ||
                    (keyval >= Gdk.KEY_Arabic_comma &&
                        keyval <= Gdk.KEY_Arabic_sukun) ||
                    (keyval >= Gdk.KEY_Serbian_dje &&
                        keyval <= Gdk.KEY_Cyrillic_HARDSIGN) ||
                    (keyval >= Gdk.KEY_Greek_ALPHAaccent &&
                        keyval <= Gdk.KEY_Greek_omega) ||
                    (keyval >= Gdk.KEY_hebrew_doublelowline &&
                        keyval <= Gdk.KEY_hebrew_taf) ||
                    (keyval >= Gdk.KEY_Thai_kokai &&
                        keyval <= Gdk.KEY_Thai_lekkao) ||
                    (keyval >= Gdk.KEY_Hangul_Kiyeog &&
                        keyval <= Gdk.KEY_Hangul_J_YeorinHieuh) ||
                    (keyval === Gdk.KEY_space && mask === 0) ||
                    this.keyvalIsForbidden(keyval)))
        );
    }

    isValidAccel(mask: number, keyval: number) {
        return (
            Gtk.accelerator_valid(keyval, mask) ||
            (keyval === Gdk.KEY_Tab && mask !== 0)
        );
    }
};

/* class LayoutWidget extends Gtk.DrawingArea {
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
/* ctx.setLineCap(Cairo.LineCap.SQUARE);
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
