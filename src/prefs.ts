// eslint-disable-next-line spaced-comment
/*!
 * Tiling Shell: advanced and modern window management for GNOME
 *
 * Copyright (C) 2025 Domenico Ferraro
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Gtk, Adw, Gio, GLib, Gdk, GObject } from './gi/prefs';
import Settings from './settings/settings';
import { EdgeSnapMode, ActivationKey } from './settings/settings';
import { logger } from './utils/logger';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Layout from './components/layout/Layout';
import SettingsExport from './settings/settingsExport';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
// @ts-expect-error "Module exists"
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';

const debug = logger('prefs');
const RESOURCES_PREFIX = "/org/gnome/Shell/Extensions/tilingshell"; // must match the prefix in resources.gresources.xml

export default class TilingShellExtensionPreferences extends ExtensionPreferences {
    private GNOME_VERSION_MAJOR = Number(Config.PACKAGE_VERSION.split('.')[0]);

    loadCssAndResources() {
        const resource = Gio.Resource.load(`${this.path}/resources.gresource`);
        Gio.resources_register(resource);

        const provider = new Gtk.CssProvider();
        provider.load_from_path(`${this.path}/prefs.css`);

        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        Gtk.IconTheme
            .get_for_display(Gdk.Display.get_default())
            .add_resource_path(`${RESOURCES_PREFIX}/icons`);
    }

    /**
     * This function is called when the preferences window is first created to fill
     * the `Adw.PreferencesWindow`.
     *
     * @param {Adw.PreferencesWindow} window - The preferences window
     */
    fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        Settings.initialize(this.getSettings());
        this.loadCssAndResources();

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

        const windowBorderExpanderRow = new Adw.ExpanderRow({
            title: _('Window border'),
            subtitle: _('Show a border around focused window'),
        });
        appearenceGroup.add(windowBorderExpanderRow);
        windowBorderExpanderRow.add_row(
            this._buildSwitchRow(
                Settings.KEY_ENABLE_WINDOW_BORDER,
                _('Enable'),
                _('Show a border around focused window'),
            ),
        );
        windowBorderExpanderRow.add_row(
            this._buildSwitchRow(
                Settings.KEY_ENABLE_SMART_WINDOW_BORDER_RADIUS,
                _('Smart border radius'),
                _("Dynamically adapt to the window's actual border radius"),
            ),
        );
        windowBorderExpanderRow.add_row(
            this._buildSpinButtonRow(
                Settings.KEY_WINDOW_BORDER_WIDTH,
                _('Width'),
                _('The size of the border'),
                1,
            ),
        );
        const colorButton = this._buildColorButton(
            this._getRGBAFromString(Settings.WINDOW_BORDER_COLOR),
            (val: string) => (Settings.WINDOW_BORDER_COLOR = val),
        );
        const windowBorderColorRow = new Adw.ActionRow({
            title: _('Border color'),
            subtitle: _('Choose the color of the border'),
        });
        windowBorderColorRow.add_suffix(colorButton);
        colorButton.set_visible(Settings.WINDOW_USE_CUSTOM_BORDER_COLOR);
        if (this.GNOME_VERSION_MAJOR >= 47) {
            const customColorDropDown = this._buildCustomColorDropDown(
                Settings.WINDOW_USE_CUSTOM_BORDER_COLOR,
                (use_custom_color: boolean) => {
                    colorButton.set_visible(use_custom_color);
                    Settings.WINDOW_USE_CUSTOM_BORDER_COLOR = use_custom_color;
                },
            );
            windowBorderColorRow.add_suffix(customColorDropDown);
        }
        windowBorderExpanderRow.add_row(windowBorderColorRow);

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

        const snapAssistSyncLayoutRow = this._buildSwitchRow(
            Settings.KEY_SNAP_ASSIST_SYNC_LAYOUT,
            _('Sync layout when tiling with Snap Assistant'),
            _(
                'Change the desktop layout to match the layout used when tiling a window with Snap Assistant',
            ),
        );
        Settings.bind(
            Settings.KEY_SNAP_ASSIST,
            snapAssistSyncLayoutRow,
            'sensitive',
        );
        behaviourGroup.add(snapAssistSyncLayoutRow);

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

        const overrideWindowMenuRow = this._buildSwitchRow(
            Settings.KEY_OVERRIDE_WINDOW_MENU,
            _('Add snap assistant and auto-tile buttons to window menu'),
            _(
                'Add snap assistant and auto-tile buttons in the menu that shows up when you right click on a window title',
            ),
        );
        behaviourGroup.add(overrideWindowMenuRow);

        const overrideAltTabRow = this._buildSwitchRow(
            Settings.KEY_OVERRIDE_ALT_TAB,
            _('Add tiled windows to ALT+TAB menu'),
            _(
                'Add the tiled windows to the ALT+TAB menu to open all the tiled windows at once',
            ),
        );
        behaviourGroup.add(overrideAltTabRow);

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
            _('Activation area to trigger quarter tiling (%% of the screen)'),
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

        const edgeTilingOffset = this._buildScaleRow(
            _('Edge tiling offset'),
            _('Offset from the screen edge to trigger edge tiling (in pixels)'),
            (sc: Gtk.Scale) => {
                Settings.EDGE_TILING_OFFSET = sc.get_value();
            },
            Settings.EDGE_TILING_OFFSET,
            1,
            250,
            1,
        );
        Settings.bind(
            Settings.KEY_ACTIVE_SCREEN_EDGES,
            edgeTilingOffset,
            'sensitive',
        );
        activeScreenEdgesGroup.add(edgeTilingOffset);

        // Create dropdown for edge snap mode
        const edgeTilingBehaviourRow = this._buildEdgeTilingBehaviourRow(
            Settings.EDGE_SNAP_MODE,
            (newMode: EdgeSnapMode) => Settings.EDGE_SNAP_MODE = newMode,
        );
        activeScreenEdgesGroup.add(edgeTilingBehaviourRow);

        prefsPage.add(activeScreenEdgesGroup);

        // Windows suggestions section
        const windowsSuggestionsGroup = new Adw.PreferencesGroup({
            title: _('Windows suggestions'),
            description: _('Enable and disable windows suggestions'),
        });
        prefsPage.add(behaviourGroup);

        const tilingSystemWindowSuggestionRow = this._buildSwitchRow(
            Settings.KEY_ENABLE_TILING_SYSTEM_WINDOWS_SUGGESTIONS,
            _('Enable window suggestions for the tiling system'),
            _(
                'Provides smart suggestions to fill empty tiles when using the tiling system',
            ),
        );
        windowsSuggestionsGroup.add(tilingSystemWindowSuggestionRow);

        const snapAssistWindowSuggestionRow = this._buildSwitchRow(
            Settings.KEY_ENABLE_SNAP_ASSISTANT_WINDOWS_SUGGESTIONS,
            _('Enable window suggestions for the snap assistant'),
            _(
                'Offers suggestions to populate empty tiles when using the snap assistant',
            ),
        );
        windowsSuggestionsGroup.add(snapAssistWindowSuggestionRow);

        const screenEdgesWindowSuggestionRow = this._buildSwitchRow(
            Settings.KEY_ENABLE_SCREEN_EDGES_WINDOWS_SUGGESTIONS,
            _('Enable window suggestions for screen edge snapping'),
            _(
                'Suggests windows to occupy empty tiles when snapping to screen edges',
            ),
        );
        windowsSuggestionsGroup.add(screenEdgesWindowSuggestionRow);

        prefsPage.add(windowsSuggestionsGroup);

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
                    _('Save'),
                    _('Cancel'),
                    new Gtk.FileFilter({
                        suffixes: ['json'],
                        name: 'JSON',
                    }),
                    (_source: Gtk.FileChooserNative, response_id: number) => {
                        try {
                            if (response_id === Gtk.ResponseType.ACCEPT) {
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
                fc.show();
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
                    _('Open'),
                    _('Cancel'),
                    new Gtk.FileFilter({
                        suffixes: ['json'],
                        name: 'JSON',
                    }),
                    (_source: Gtk.FileChooserNative, response_id: number) => {
                        try {
                            if (response_id === Gtk.ResponseType.ACCEPT) {
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

                fc.show();
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
            [
                Settings.SETTING_HIGHLIGHT_CURRENT_WINDOW,
                _('Highlight focused window'),
                _(
                    'Minimize all the other windows and show only the focused window',
                ),
                false,
                false,
            ],
            [
                Settings.SETTING_CYCLE_LAYOUTS,
                _('Cycle layouts'),
                _('Cycle through available workspace layouts'),
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

        const wrapAroundRow = this._buildSwitchRow(
            Settings.KEY_WRAPAROUND_FOCUS,
            _('Enable next/previous window focus to wrap around'),
            _(
                'When focusing next or previous window, wrap around at the window edge',
            ),
        );
        keybindingsGroup.add(wrapAroundRow);

        const directionalFocusTiledWindows = this._buildSwitchRow(
            Settings.KEY_ENABLE_DIRECTIONAL_FOCUS_TILED_ONLY,
            _('Restrict directional focus to tiled windows'),
            _(
                'When using directional focus navigation, only consider tiled windows',
            ),
        );
        keybindingsGroup.add(directionalFocusTiledWindows);

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
                    _('Save'),
                    _('Cancel'),
                    new Gtk.FileFilter({
                        suffixes: ['txt'],
                        name: _('Text file'),
                    }),
                    (_source: Gtk.FileChooserNative, response_id: number) => {
                        try {
                            if (response_id === Gtk.ResponseType.ACCEPT) {
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
                fc.show();
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
                    _('Open'),
                    _('Cancel'),
                    new Gtk.FileFilter({
                        suffixes: ['txt'],
                        name: 'Text file',
                    }),
                    (_source: Gtk.FileChooserNative, response_id: number) => {
                        try {
                            if (response_id === Gtk.ResponseType.ACCEPT) {
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

                fc.show();
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

        return Promise.resolve();
    }

    _createEdgeTilingBehaviourOption(title: string, subtitle: string, iconName: string) {
        const button = new Gtk.ToggleButton({
            canFocus: true,
            valign: Gtk.Align.FILL,
            cssClasses: ['option'],
            hexpand: true,
            vexpand: false,
        });

        const distance = 12;

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 0,
            margin_bottom: distance,
            margin_start: 0,
            margin_end: 0,
        });

        const image = new Gtk.Image({
            iconName: iconName,
            pixel_size: 96,
            margin_top: distance,
            margin_bottom: distance,
            margin_start: 0,
            margin_end: 0,
        });

        const titleLabel = new Gtk.Label({
            label: title,
            wrap: true,
            xalign: 0,
            css_classes: ['title']
        });

        const subtitleLabel = new Gtk.Label({
            label: subtitle,
            wrap: true,
            xalign: 0,
            css_classes: ['caption']
        });

        content.append(image);
        content.append(titleLabel);
        content.append(subtitleLabel);

        button.set_child(content);

        return button;
    }

    _buildEdgeTilingBehaviourRow(currentMode: EdgeSnapMode, onModeChange: (newMode: EdgeSnapMode) => void) {
        const row = new Adw.ActionRow({
            activatable: false,
            title: _("Choose how windows snap to screen edges"),
            cssClasses: ['edge-tiling-behaviour']
        });
        (row.get_child() as Gtk.Box).set_orientation(Gtk.Orientation.VERTICAL);

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.FILL,
            valign: Gtk.Align.FILL,
            homogeneous: true, // all children same size
            spacing: 2,
            cssClasses: ['content'],
            margin_bottom: 6,
        });
        const defaultBtn = this._createEdgeTilingBehaviourOption(
            _('Default'),
            _('Follow quarters or screen halves'),
            'edge-default-symbolic'
        );
        defaultBtn.connect("toggled", () => onModeChange(EdgeSnapMode.DEFAULT));
        const adaptiveBtn = this._createEdgeTilingBehaviourOption(
            _('Adaptive'),
            _('Follow corners of selected layout or screen halves'),
            'edge-adaptive-symbolic'
        );
        adaptiveBtn.connect("toggled", () => onModeChange(EdgeSnapMode.ADAPTIVE));
        const granularBtn = this._createEdgeTilingBehaviourOption(
            _('Granular'),
            _('Follow currently selected layout'),
            'edge-granular-symbolic'
        );
        granularBtn.connect("toggled", () => onModeChange(EdgeSnapMode.GRANULAR));
        content.append(defaultBtn);
        content.append(adaptiveBtn);
        content.append(granularBtn);
        // make them mutually exclusive
        defaultBtn.set_group(adaptiveBtn);
        granularBtn.set_group(adaptiveBtn);
        // set the currently activated one
        if (currentMode === EdgeSnapMode.ADAPTIVE) adaptiveBtn.set_active(true);
        else if (currentMode === EdgeSnapMode.GRANULAR) granularBtn.set_active(true);
        else defaultBtn.set_active(true);
        (row.get_child() as Gtk.Box).append(content);

        return row;
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
        onChange: (_scale: Gtk.Scale) => void,
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

    _buildColorButton(
        rgba: Gdk.RGBA,
        onChange: (_s: string) => void,
    ): Gtk.ColorButton {
        const colorButton = new Gtk.ColorButton({
            rgba,
            use_alpha: true,
            valign: Gtk.Align.CENTER,
        });
        colorButton.connect('color-set', () => {
            onChange(colorButton.get_rgba().to_string());
        });
        return colorButton;
    }

    _buildCustomColorDropDown(
        initialValue: boolean,
        onChange: (_: boolean) => void,
        styleClass?: string,
    ) {
        const options = new Gtk.StringList();
        options.append(_('Choose custom color')); // true
        options.append(_('Use system accent color')); // false
        const dropdown = new Gtk.DropDown({
            model: options,
            selected: initialValue ? 0 : 1,
        });
        dropdown.connect('notify::selected-item', (dd: Gtk.DropDown) => {
            const index = dd.get_selected();
            const selected = index === 0; // 0 is true, which means to use custom color
            onChange(selected);
        });
        if (styleClass) dropdown.add_css_class(styleClass);
        dropdown.set_vexpand(false);
        dropdown.set_valign(Gtk.Align.CENTER);
        return dropdown;
    }

    _buildFileChooserDialog(
        title: string,
        action: Gtk.FileChooserAction,
        window: Gtk.Window,
        accept: string,
        cancel: string,
        filter: Gtk.FileFilter,
        onResponse: (
            _source: Gtk.FileChooserNative,
            _response_id: number,
        ) => void,
    ): Gtk.FileChooserNative {
        const fc = new Gtk.FileChooserNative({
            title,
            action,
            select_multiple: false,
            modal: true,
            accept_label: accept,
            cancel_label: cancel,
        });
        window.connect('map', () => {
            fc.set_transient_for(window);
        });
        // due to a bug, file chooser doesn't open on GNOME 42 when a filter is set
        // filter is then enabled for GNOME 43+
        if (this.GNOME_VERSION_MAJOR >= 43) fc.set_filter(filter);
        fc.set_current_folder(Gio.File.new_for_path(GLib.get_home_dir()));
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
            disabled_text: _('New accelerator…'),
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
            title: _('New accelerator…'),
            // description: this._description,
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
            description: _('Use Backspace to clear'),
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
