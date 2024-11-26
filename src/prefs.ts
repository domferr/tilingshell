import { Gtk, Adw, Gio, GLib, Gdk, GObject } from '@gi.prefs';
import Settings, { ActivationKey } from './settings/settings';
import { logger } from './utils/logger';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Layout from '@components/layout/Layout';
import SettingsExport from '@settings/settingsExport';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
// @ts-expect-error "Module exists"
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';

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
            title: _('General'),
            iconName: 'dialog-information-symbolic',
        });
        window.add(prefsPage);

        // Appearence section
        const appearenceGroup = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Configure the appearance of Tiling Shell'),
        });
        prefsPage.add(appearenceGroup);

        const showIndicatorRow = this._buildSwitchRow(
            Settings.KEY_SHOW_INDICATOR,
            _('Show Indicator'),
            _('Whether to show the panel indicator'),
        );
        appearenceGroup.add(showIndicatorRow);

        const innerGapsRow = this._buildSpinButtonRow(
            Settings.KEY_INNER_GAPS,
            _('Inner gaps'),
            _('Gaps between windows'),
        );
        appearenceGroup.add(innerGapsRow);

        const outerGapsRow = this._buildSpinButtonRow(
            Settings.KEY_OUTER_GAPS,
            _('Outer gaps'),
            _('Gaps between a window and the monitor borders'),
        );
        appearenceGroup.add(outerGapsRow);

        const blurRow = new Adw.ExpanderRow({
            title: _('Blur (experimental feature)'),
            subtitle: _(
                'Apply blur effect to Snap Assistant and tile previews',
            ),
        });
        appearenceGroup.add(blurRow);

        const snapAssistantThresholdRow = this._buildSpinButtonRow(
            Settings.KEY_SNAP_ASSISTANT_THRESHOLD,
            _('Snap Assistant threshold'),
            _(
                'Minimum distance from the Snap Assistant to the pointer to open it',
            ),
            0,
            512,
        );
        appearenceGroup.add(snapAssistantThresholdRow);

        blurRow.add_row(
            this._buildSwitchRow(
                Settings.KEY_ENABLE_BLUR_SNAP_ASSISTANT,
                _('Snap Assistant'),
                _('Apply blur effect to Snap Assistant'),
            ),
        );
        blurRow.add_row(
            this._buildSwitchRow(
                Settings.KEY_ENABLE_BLUR_SELECTED_TILEPREVIEW,
                _('Selected tile preview'),
                _('Apply blur effect to selected tile preview'),
            ),
        );

        const windowBorderRow = new Adw.ExpanderRow({
            title: _('Window border'),
            subtitle: _('Show a border around focused window'),
        });
        appearenceGroup.add(windowBorderRow);
        windowBorderRow.add_row(
            this._buildSwitchRow(
                Settings.KEY_ENABLE_SMART_WINDOW_BORDER_RADIUS,
                _('Smart border radius'),
                _('Dynamically adapt to the window’s actual border radius'),
            ),
        );
        windowBorderRow.add_row(
            this._buildSwitchRow(
                Settings.KEY_ENABLE_WINDOW_BORDER,
                _('Enable'),
                _('Show a border around focused window'),
            ),
        );
        windowBorderRow.add_row(
            this._buildSpinButtonRow(
                Settings.KEY_WINDOW_BORDER_WIDTH,
                _('Width'),
                _('The size of the border'),
                1,
            ),
        );
        windowBorderRow.add_row(
            this._buildColorRow(
                _('Border color'),
                _('Choose the color of the border'),
                this._getRGBAFromString(Settings.WINDOW_BORDER_COLOR),
                (val: string) => (Settings.WINDOW_BORDER_COLOR = val),
            ),
        );

        const animationsRow = new Adw.ExpanderRow({
            title: _('Animations'),
            subtitle: _('Customize animations'),
        });
        appearenceGroup.add(animationsRow);
        animationsRow.add_row(
            this._buildSpinButtonRow(
                Settings.KEY_SNAP_ASSISTANT_ANIMATION_TIME,
                _('Snap assistant animation time'),
                _('The snap assistant animation time in milliseconds'),
                0,
                2000,
            ),
        );
        animationsRow.add_row(
            this._buildSpinButtonRow(
                Settings.KEY_TILE_PREVIEW_ANIMATION_TIME,
                _('Tiles animation time'),
                _('The tiles animation time in milliseconds'),
                0,
                2000,
            ),
        );

        // Behaviour section
        const behaviourGroup = new Adw.PreferencesGroup({
            title: _('Behaviour'),
            description: _('Configure the behaviour of Tiling Shell'),
        });
        prefsPage.add(behaviourGroup);

        const snapAssistRow = this._buildSwitchRow(
            Settings.KEY_SNAP_ASSIST,
            _('Enable Snap Assistant'),
            _('Move the window on top of the screen to snap assist it'),
        );
        behaviourGroup.add(snapAssistRow);

        const enableTilingSystemRow = this._buildSwitchRow(
            Settings.KEY_TILING_SYSTEM,
            _('Enable Tiling System'),
            _('Hold the activation key while moving a window to tile it'),
            this._buildActivationKeysDropDown(
                Settings.TILING_SYSTEM_ACTIVATION_KEY,
                (val: ActivationKey) =>
                    (Settings.TILING_SYSTEM_ACTIVATION_KEY = val),
            ),
        );
        behaviourGroup.add(enableTilingSystemRow);

        const tilingSystemDeactivationRow = this._buildDropDownRow(
            _('Tiling System deactivation key'),
            _(
                'Hold the deactivation key while moving a window to deactivate the tiling system',
            ),
            Settings.TILING_SYSTEM_DEACTIVATION_KEY,
            (val: ActivationKey) =>
                (Settings.TILING_SYSTEM_DEACTIVATION_KEY = val),
        );
        behaviourGroup.add(tilingSystemDeactivationRow);

        const spanMultipleTilesRow = this._buildSwitchRow(
            Settings.KEY_SPAN_MULTIPLE_TILES,
            _('Span multiple tiles'),
            _('Hold the activation key to span multiple tiles'),
            this._buildActivationKeysDropDown(
                Settings.SPAN_MULTIPLE_TILES_ACTIVATION_KEY,
                (val: ActivationKey) =>
                    (Settings.SPAN_MULTIPLE_TILES_ACTIVATION_KEY = val),
            ),
        );
        behaviourGroup.add(spanMultipleTilesRow);

        const autoTilingRow = this._buildSwitchRow(
            Settings.KEY_ENABLE_AUTO_TILING,
            _('Enable Auto Tiling'),
            _('Automatically tile new windows to the best tile'),
        );
        behaviourGroup.add(autoTilingRow);

        const resizeComplementingRow = this._buildSwitchRow(
            Settings.KEY_RESIZE_COMPLEMENTING_WINDOWS,
            _('Enable auto-resize of the complementing tiled windows'),
            _(
                'When a tiled window is resized, auto-resize the other tiled windows near it',
            ),
        );
        behaviourGroup.add(resizeComplementingRow);

        const restoreToOriginalSizeRow = this._buildSwitchRow(
            Settings.KEY_RESTORE_WINDOW_ORIGINAL_SIZE,
            _('Restore window size'),
            _(
                'Whether to restore the windows to their original size when untiled',
            ),
        );
        behaviourGroup.add(restoreToOriginalSizeRow);

        const wrapAroundRow = this._buildSwitchRow(
            Settings.KEY_WRAPAROUND_FOCUS,
            _('Enable next/previous window focus to wrap around'),
            _('When focusing next or previous window, wrap around at the window edge'),
        );
        behaviourGroup.add(wrapAroundRow);

        const overrideWindowMenuRow = this._buildSwitchRow(
            Settings.KEY_OVERRIDE_WINDOW_MENU,
            _('Add snap assistant and auto-tile buttons to window menu'),
            _(
                'Add snap assistant and auto-tile buttons in the menu that shows up when you right click on a window title',
            ),
        );
        behaviourGroup.add(overrideWindowMenuRow);

        // Screen Edges section
        const activeScreenEdgesGroup = new Adw.PreferencesGroup({
            title: _('Screen Edges'),
            description: _(
                'Drag windows against the top, left and right screen edges to resize them',
            ),
            headerSuffix: new Gtk.Switch({
                vexpand: false,
                valign: Gtk.Align.CENTER,
            }),
        });
        Settings.bind(
            Settings.KEY_ACTIVE_SCREEN_EDGES,
            activeScreenEdgesGroup.headerSuffix,
            'active',
        );

        const topEdgeMaximize = this._buildSwitchRow(
            Settings.KEY_TOP_EDGE_MAXIMIZE,
            _('Drag against top edge to maximize window'),
            _('Drag windows against the top edge to maximize them'),
        );
        Settings.bind(
            Settings.KEY_ACTIVE_SCREEN_EDGES,
            topEdgeMaximize,
            'sensitive',
        );
        activeScreenEdgesGroup.add(topEdgeMaximize);

        const quarterTiling = this._buildScaleRow(
            _('Quarter tiling activation area'),
            _('Activation area to trigger quarter tiling (% of the screen)'),
            (sc: Gtk.Scale) => {
                Settings.QUARTER_TILING_THRESHOLD = sc.get_value();
            },
            Settings.QUARTER_TILING_THRESHOLD,
            1,
            50,
            1,
        );
        Settings.bind(
            Settings.KEY_ACTIVE_SCREEN_EDGES,
            quarterTiling,
            'sensitive',
        );
        activeScreenEdgesGroup.add(quarterTiling);

        prefsPage.add(activeScreenEdgesGroup);

        // Layouts section
        const layoutsGroup = new Adw.PreferencesGroup({
            title: _('Layouts'),
            description: _('Configure the layouts of Tiling Shell'),
        });
        prefsPage.add(layoutsGroup);

        const editLayoutsBtn = this._buildButtonRow(
            _('Edit layouts'),
            _('Edit layouts'),
            _('Open the layouts editor'),
            () => this._openLayoutEditor(),
        );
        layoutsGroup.add(editLayoutsBtn);

        const exportLayoutsBtn = this._buildButtonRow(
            _('Export layouts'),
            _('Export layouts'),
            _('Export layouts to a file'),
            () => {
                const fc = this._buildFileChooserDialog(
                    _('Export layouts'),
                    Gtk.FileChooserAction.SAVE,
                    window,
                    [
                        [_('Cancel'), Gtk.ResponseType.CANCEL],
                        [_('Save'), Gtk.ResponseType.OK],
                    ],
                    new Gtk.FileFilter({
                        suffixes: ['json'],
                        name: 'JSON',
                    }),
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
                fc.set_current_name('tilingshell-layouts.json');
                fc.present();
            },
        );
        layoutsGroup.add(exportLayoutsBtn);

        const importLayoutsBtn = this._buildButtonRow(
            _('Import layouts'),
            _('Import layouts'),
            _('Import layouts from a file'),
            () => {
                const fc = this._buildFileChooserDialog(
                    _('Select layouts file'),
                    Gtk.FileChooserAction.OPEN,
                    window,
                    [
                        [_('Cancel'), Gtk.ResponseType.CANCEL],
                        [_('Open'), Gtk.ResponseType.OK],
                    ],
                    new Gtk.FileFilter({
                        suffixes: ['json'],
                        name: 'JSON',
                    }),
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
            _('Reset layouts'),
            _('Reset layouts'),
            _('Bring back the default layouts'),
            () => {
                Settings.reset_layouts_json();
                const layouts = Settings.get_layouts_json();
                const newSelectedLayouts = Settings.get_selected_layouts().map(
                    (monitors_selected) =>
                        monitors_selected.map(() => layouts[0].id),
                );
                Settings.save_selected_layouts(newSelectedLayouts);
            },
            'destructive-action',
        );
        layoutsGroup.add(resetBtn);

        // Keybindings section
        const keybindingsGroup = new Adw.PreferencesGroup({
            title: _('Keybindings'),
            description: _(
                'Use hotkeys to perform actions on the focused window',
            ),
            headerSuffix: new Gtk.Switch({
                vexpand: false,
                valign: Gtk.Align.CENTER,
            }),
        });
        Settings.bind(
            Settings.KEY_ENABLE_MOVE_KEYBINDINGS,
            keybindingsGroup.headerSuffix,
            'active',
        );
        prefsPage.add(keybindingsGroup);

        const gioSettings = this.getSettings();
        const keybindings: [
            string, // settings key
            string, // title
            string | undefined, // subtitle
            boolean, // is set
            boolean, // is on main page
        ][] = [
            [
                Settings.SETTING_MOVE_WINDOW_RIGHT, // settings key
                _('Move window to right tile'), // title
                _('Move the focused window to the tile on its right'), // subtitle
                false, // is set
                true, // is on main page
            ],
            [
                Settings.SETTING_MOVE_WINDOW_LEFT,
                _('Move window to left tile'),
                _('Move the focused window to the tile on its left'),
                false,
                true,
            ],
            [
                Settings.SETTING_MOVE_WINDOW_UP,
                _('Move window to tile above'),
                _('Move the focused window to the tile above'),
                false,
                true,
            ],
            [
                Settings.SETTING_MOVE_WINDOW_DOWN,
                _('Move window to tile below'),
                _('Move the focused window to the tile below'),
                false,
                true,
            ],
            [
                Settings.SETTING_SPAN_WINDOW_RIGHT,
                _('Span window to right tile'),
                _('Span the focused window to the tile on its right'),
                false,
                false,
            ],
            [
                Settings.SETTING_SPAN_WINDOW_LEFT,
                _('Span window to left tile'),
                _('Span the focused window to the tile on its left'),
                false,
                false,
            ],
            [
                Settings.SETTING_SPAN_WINDOW_UP,
                _('Span window above'),
                _('Span the focused window to the tile above'),
                false,
                false,
            ],
            [
                Settings.SETTING_SPAN_WINDOW_DOWN,
                _('Span window down'),
                _('Span the focused window to the tile below'),
                false,
                false,
            ],
            [
                Settings.SETTING_SPAN_WINDOW_ALL_TILES,
                _('Span window to all tiles'),
                _('Span the focused window to all the tiles'),
                false,
                false,
            ],
            [
                Settings.SETTING_UNTILE_WINDOW,
                _('Untile focused window'),
                undefined,
                false,
                false,
            ],
            [
                Settings.SETTING_MOVE_WINDOW_CENTER, // settings key
                _('Move window to the center'), // title
                _('Move the focused window to the center of the screen'), // subtitle
                false, // is set
                false, // is on main page
            ],
            [
                Settings.SETTING_FOCUS_WINDOW_RIGHT,
                _('Focus window to the right'),
                _(
                    'Focus the window to the right of the current focused window',
                ),
                false,
                false,
            ],
            [
                Settings.SETTING_FOCUS_WINDOW_LEFT,
                _('Focus window to the left'),
                _('Focus the window to the left of the current focused window'),
                false,
                false,
            ],
            [
                Settings.SETTING_FOCUS_WINDOW_UP,
                _('Focus window above'),
                _('Focus the window above the current focused window'),
                false,
                false,
            ],
            [
                Settings.SETTING_FOCUS_WINDOW_DOWN,
                _('Focus window below'),
                _('Focus the window below the current focused window'),
                false,
                false,
            ],
            [
                Settings.SETTING_FOCUS_WINDOW_NEXT,
                _('Focus next window'),
                _('Focus the window next to the current focused window'),
                false,
                false,
            ],
            [
                Settings.SETTING_FOCUS_WINDOW_PREV,
                _('Focus previous window'),
                _('Focus the window prior to the current focused window'),
                false,
                false,
            ],
        ];

        // set if the keybinding was set or not by the user
        for (let i = 0; i < keybindings.length; i++) {
            keybindings[i][3] =
                gioSettings.get_strv(keybindings[i][0])[0].length > 0;
        }

        // draw keybindings set or not optional
        keybindings.forEach(
            ([settingsKey, title, subtitle, isSet, isOnMainPage]) => {
                if (!isSet && !isOnMainPage) return;

                const row = this._buildShortcutButtonRow(
                    settingsKey,
                    gioSettings,
                    title,
                    subtitle,
                );

                Settings.bind(
                    Settings.KEY_ENABLE_MOVE_KEYBINDINGS,
                    row,
                    'sensitive',
                );
                keybindingsGroup.add(row);
            },
        );
        const openKeybindingsDialogRow = new Adw.ActionRow({
            title: _('View and Customize all the Shortcuts'),
            activatable: true,
        });
        openKeybindingsDialogRow.add_suffix(
            new Gtk.Image({
                icon_name: 'go-next-symbolic',
                valign: Gtk.Align.CENTER,
            }),
        );
        Settings.bind(
            Settings.KEY_ENABLE_MOVE_KEYBINDINGS,
            openKeybindingsDialogRow,
            'sensitive',
        );
        keybindingsGroup.add(openKeybindingsDialogRow);

        const keybindingsDialog = new Adw.PreferencesWindow({
            searchEnabled: true,
            modal: true,
            hide_on_close: true,
            transient_for: window,
            width_request: 480,
            height_request: 320,
        });
        openKeybindingsDialogRow.connect('activated', () =>
            keybindingsDialog.present(),
        );
        const keybindingsPage = new Adw.PreferencesPage({
            name: _('View and Customize Shortcuts'),
            title: _('View and Customize Shortcuts'),
            iconName: 'dialog-information-symbolic',
        });
        keybindingsDialog.add(keybindingsPage);
        const keybindingsDialogGroup = new Adw.PreferencesGroup();
        keybindingsPage.add(keybindingsDialogGroup);

        // draw all the keybindings in the dialog
        keybindings.forEach(([settingsKey, title, subtitle]) => {
            const row = this._buildShortcutButtonRow(
                settingsKey,
                gioSettings,
                title,
                subtitle,
            );

            Settings.bind(
                Settings.KEY_ENABLE_MOVE_KEYBINDINGS,
                row,
                'sensitive',
            );
            keybindingsDialogGroup.add(row);
        });

        // Import/export/reset section
        const importExportGroup = new Adw.PreferencesGroup({
            title: _('Import, export and reset'),
            description: _(
                'Import, export and reset the settings of Tiling Shell',
            ),
        });
        prefsPage.add(importExportGroup);

        const exportSettingsBtn = this._buildButtonRow(
            _('Export settings'),
            _('Export settings'),
            _('Export settings to a file'),
            () => {
                const fc = this._buildFileChooserDialog(
                    _('Export settings to a text file'),
                    Gtk.FileChooserAction.SAVE,
                    window,
                    [
                        [_('Cancel'), Gtk.ResponseType.CANCEL],
                        [_('Save'), Gtk.ResponseType.OK],
                    ],
                    new Gtk.FileFilter({
                        suffixes: ['txt'],
                        name: 'Text file',
                    }),
                    (_source: Gtk.FileChooserDialog, response_id: number) => {
                        try {
                            if (response_id === Gtk.ResponseType.OK) {
                                const file = _source.get_file();
                                if (!file) throw new Error('no file selected');

                                debug(
                                    `Create file with path ${file.get_path()}`,
                                );
                                const settingsExport = new SettingsExport(
                                    this.getSettings(),
                                );
                                const content = settingsExport.exportToString();
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

                fc.set_current_name('tilingshell-settings.txt');
                fc.present();
            },
        );
        importExportGroup.add(exportSettingsBtn);

        const importSettingsBtn = this._buildButtonRow(
            _('Import settings'),
            _('Import settings'),
            _('Import settings from a file'),
            () => {
                const fc = this._buildFileChooserDialog(
                    _('Select a text file to import from'),
                    Gtk.FileChooserAction.OPEN,
                    window,
                    [
                        [_('Cancel'), Gtk.ResponseType.CANCEL],
                        [_('Open'), Gtk.ResponseType.OK],
                    ],
                    new Gtk.FileFilter({
                        suffixes: ['txt'],
                        name: 'Text file',
                    }),
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
                                    const imported = new TextDecoder(
                                        'utf-8',
                                    ).decode(content);
                                    const settingsExport = new SettingsExport(
                                        this.getSettings(),
                                    );
                                    settingsExport.importFromString(imported);
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
        importExportGroup.add(importSettingsBtn);

        const resetSettingsBtn = this._buildButtonRow(
            _('Reset settings'),
            _('Reset settings'),
            _('Bring back the default settings'),
            () => new SettingsExport(this.getSettings()).restoreToDefault(),
            'destructive-action',
        );
        importExportGroup.add(resetSettingsBtn);

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
                `♥︎ ${_('Donate on ko-fi')}`,
                'https://ko-fi.com/domferr',
            ),
        );
        buttons.append(
            this._buildLinkButton(
                _('Report a bug'),
                'https://github.com/domferr/tilingshell/issues/new?template=bug_report.md',
            ),
        );
        buttons.append(
            this._buildLinkButton(
                _('Request a feature'),
                'https://github.com/domferr/tilingshell/issues/new?template=feature_request.md',
            ),
        );
        footerGroup.add(buttons);

        footerGroup.add(
            new Gtk.Label({
                label: _(
                    'Have issues, you want to suggest a new feature or contribute?',
                ),
                margin_bottom: 4,
            }),
        );
        footerGroup.add(
            new Gtk.Label({
                label: `${_('Open a new issue on')} <a href="https://github.com/domferr/tilingshell">GitHub</a>!`,
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

    _buildDropDownRow(
        title: string,
        subtitle: string,
        initialValue: ActivationKey,
        onChange: (_: ActivationKey) => void,
        styleClass?: string,
    ): Adw.ActionRow {
        const dropDown = this._buildActivationKeysDropDown(
            initialValue,
            onChange,
            styleClass,
        );
        dropDown.set_vexpand(false);
        dropDown.set_valign(Gtk.Align.CENTER);
        const adwRow = new Adw.ActionRow({
            title,
            subtitle,
            activatableWidget: dropDown,
        });
        adwRow.add_suffix(dropDown);

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
        initialValue: ActivationKey,
        onChange: (_: ActivationKey) => void,
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
            selected: initialValue,
        });
        dropdown.connect('notify::selected-item', (dd: Gtk.DropDown) => {
            const index = dd.get_selected();
            const selected =
                index < 0 || index >= activationKeys.length
                    ? ActivationKey.NONE
                    : activationKeys[index];
            onChange(selected);
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
        settingsKey: string,
        gioSettings: Gio.Settings,
        title: string,
        subtitle: string | undefined,
        styleClass?: string,
    ) {
        const btn = new ShortcutSettingButton(settingsKey, gioSettings);
        if (styleClass) btn.add_css_class(styleClass);
        btn.set_vexpand(false);
        btn.set_valign(Gtk.Align.CENTER);
        const adwRow = new Adw.ActionRow({
            title,
            activatableWidget: btn,
        });
        if (subtitle) adwRow.set_subtitle(subtitle);
        adwRow.add_suffix(btn);

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
        adwRow.add_suffix(scale);
        return adwRow;
    }

    _getRGBAFromString(str: string): Gdk.RGBA {
        const rgba = new Gdk.RGBA();
        rgba.parse(str);
        return rgba;
    }

    _buildColorRow(
        title: string,
        subtitle: string,
        rgba: Gdk.RGBA,
        onChange: (s: string) => void,
    ): Adw.ActionRow {
        const colorButton = new Gtk.ColorButton({
            rgba,
            use_alpha: true,
            valign: Gtk.Align.CENTER,
        });
        colorButton.connect('color-set', () => {
            onChange(colorButton.get_rgba().to_string());
        });
        const adwRow = new Adw.ActionRow({
            title,
            subtitle,
            activatableWidget: colorButton,
        });
        adwRow.add_suffix(colorButton);
        return adwRow;
    }

    _buildFileChooserDialog(
        title: string,
        action: Gtk.FileChooserAction,
        window: Gtk.Window,
        buttons: [string, Gtk.ResponseType][],
        filter: Gtk.FileFilter,
        onResponse: (
            _source: Gtk.FileChooserDialog,
            response_id: number,
        ) => void,
    ): Gtk.FileChooserDialog {
        const fc = new Gtk.FileChooserDialog({
            title,
            action,
            select_multiple: false,
            transientFor: window,
        });
        const [major] = Config.PACKAGE_VERSION.split('.').map((s: string) =>
            Number(s),
        );
        // due to a bug, file chooser doesn't open on GNOME 42 when a filter is set
        // filter is then enabled for GNOME 43+
        if (major >= 43) fc.set_filter(filter);
        fc.set_current_folder(Gio.File.new_for_path(GLib.get_home_dir()));
        buttons.forEach(([name, type]) => fc.add_button(name, type));
        fc.connect('response', onResponse);

        return fc;
    }
}

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
    private _shortcut: string;
    private _settingsKey: string;
    private _gioSettings: Gio.Settings;

    constructor(settingsKey: string, gioSettings: Gio.Settings) {
        super({
            halign: Gtk.Align.CENTER,
            hexpand: false,
            vexpand: false,
            has_frame: false,
        });

        this._shortcut = '';
        this._settingsKey = settingsKey;
        this._gioSettings = gioSettings;
        this._editor = null;
        this._label = new Gtk.ShortcutLabel({
            disabled_text: 'New accelerator…',
            valign: Gtk.Align.CENTER,
            hexpand: false,
            vexpand: false,
        });

        // Bind signals
        this.connect('clicked', this._onActivated.bind(this));
        gioSettings.connect(`changed::${settingsKey}`, () => {
            [this.shortcut] = gioSettings.get_strv(settingsKey);
            this._label.set_accelerator(this.shortcut);
        });
        [this.shortcut] = gioSettings.get_strv(settingsKey);
        this._label.set_accelerator(this.shortcut);
        this.set_child(this._label);
    }

    private set shortcut(value: string) {
        this._shortcut = value;
    }

    private get shortcut(): string {
        return this._shortcut;
    }

    _onActivated(widget: Gtk.Widget) {
        const ctl = new Gtk.EventControllerKey();

        const content = new Adw.StatusPage({
            title: 'New accelerator…',
            // description: this._description,
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
            description: 'Use Backspace to clear',
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

        if (keyval === Gdk.KEY_BackSpace) {
            this._updateShortcut(''); // Clear
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
            const val = Gtk.accelerator_name_with_keycode(
                null,
                keyval,
                keycode,
                mask,
            );
            this._updateShortcut(val);
        }

        this._editor?.destroy();
        return Gdk.EVENT_STOP;
    }

    private _updateShortcut(val: string): void {
        this.shortcut = val;
        this._label.set_accelerator(this.shortcut);
        this._gioSettings.set_strv(this._settingsKey, [this.shortcut]);
        this.emit('changed', this.shortcut);
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
