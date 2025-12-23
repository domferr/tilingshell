import { Gtk, Adw } from '@gi.prefs';
import Settings from '@settings/settings';
import { logger } from '@utils/logger';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { ConfigRules } from './customRulesManager';

const debug = logger('customApplicationRulePrefs');

interface ApplicationRowData {
    row: Adw.ExpanderRow;
    switches: {
        customBorder: Gtk.Switch;
        autoTiling: Gtk.Switch;
        snapAssist: Gtk.Switch;
        windowSuggestions: Gtk.Switch;
        resizeComplementing: Gtk.Switch;
        spanMultipleTiles: Gtk.Switch;
    };
}

export class CustomApplicationRulePrefs {
    private existingWmClasses: Set<string> = new Set<string>();
    private applicationRows: ApplicationRowData[] = [];
    private customRulesGroup!: Adw.PreferencesGroup;

    /**
     * Build the custom rules preferences group
     */
    buildCustomRulesGroup(
        parentWindow: Adw.PreferencesWindow,
    ): Adw.PreferencesGroup {
        this.customRulesGroup = new Adw.PreferencesGroup({
            title: _('Application Custom Rules'),
            description: _(
                'Configure which features are enabled for specific applications',
            ),
        });

        // Add fullscreen default rule first (non-deletable)
        const fullscreenDefaultRow = this.createCustomRulesApplicationRow(
            _('Fullscreen Applications'),
            'fullscreen',
            {
                customBorder: false,
                autoTiling: false,
                snapAssist: false,
                windowSuggestions: false,
                resizeComplementing: false,
                spanMultipleTiles: false,
            },
            true, // isDefault
        );
        this.customRulesGroup.add(fullscreenDefaultRow);

        // Load customRules from settings
        const savedCustomRules = Settings.get_application_custom_rules();
        savedCustomRules.forEach((app) => {
            const appRow = this.createCustomRulesApplicationRow(
                app.name,
                app.wmClass,
                app.ruleConfig,
            );
            this.customRulesGroup.add(appRow);
        });

        // Add button to add new application to customRules
        const addAppBtn = this.buildButtonRow(
            _('Add Application'),
            _('Add application to customRules'),
            _('Configure features for a new application'),
            () => {
                this.showAddApplicationDialog(
                    parentWindow,
                    (appName, wmClass) => {
                        debug(`Adding application: ${appName} (${wmClass})`);
                        const newAppRow = this.createCustomRulesApplicationRow(
                            appName,
                            wmClass,
                        );
                        // Insert before the "Add Application" button
                        // Remove button, add new row, then re-add button to keep it at the bottom
                        this.customRulesGroup.remove(addAppBtn);
                        this.customRulesGroup.add(newAppRow);
                        this.customRulesGroup.add(addAppBtn);
                        this.saveCustomRules();
                    },
                );
            },
        );
        this.customRulesGroup.add(addAppBtn);

        return this.customRulesGroup;
    }

    /**
     * Save custom rules to settings
     */
    private saveCustomRules(): void {
        const customRules = this.applicationRows.map(({ row, switches }) => {
            const wmClass = row.get_subtitle().replace('WM Class: ', '');
            return {
                name: row.get_title(),
                wmClass,
                ruleConfig: {
                    customBorder: switches.customBorder.get_active(),
                    autoTiling: switches.autoTiling.get_active(),
                    snapAssist: switches.snapAssist.get_active(),
                    windowSuggestions: switches.windowSuggestions.get_active(),
                    resizeComplementing:
                        switches.resizeComplementing.get_active(),
                    spanMultipleTiles: switches.spanMultipleTiles.get_active(),
                },
            };
        });
        Settings.save_application_custom_rules(customRules);
    }

    /**
     * Create a custom rules application row
     */
    private createCustomRulesApplicationRow(
        appName: string,
        wmClass: string,
        config: ConfigRules = {
            customBorder: true,
            autoTiling: true,
            snapAssist: true,
            windowSuggestions: true,
            resizeComplementing: true,
            spanMultipleTiles: true,
        },
        isDefault = false,
    ): Adw.ExpanderRow {
        const ruleConfig = Object.assign(
            {
                customBorder: true,
                autoTiling: true,
                snapAssist: true,
                windowSuggestions: true,
                resizeComplementing: true,
                spanMultipleTiles: true,
            },
            config,
        );

        const appRow = new Adw.ExpanderRow({
            title: appName,
            subtitle: isDefault
                ? _('Default rule (cannot be deleted)')
                : `WM Class: ${wmClass}`,
        });

        if (!isDefault) this.existingWmClasses.add(wmClass.toLowerCase());

        // Custom border toggle
        const customBorderSwitch = new Gtk.Switch({
            vexpand: false,
            valign: Gtk.Align.CENTER,
            active: ruleConfig.customBorder,
            sensitive: !isDefault,
        });
        if (!isDefault) {
            customBorderSwitch.connect('notify::active', () =>
                this.saveCustomRules(),
            );
        }
        const customBorderRow = new Adw.ActionRow({
            title: _('Custom border'),
            subtitle: _('Show custom border for this application'),
            activatableWidget: customBorderSwitch,
        });
        customBorderRow.add_suffix(customBorderSwitch);
        appRow.add_row(customBorderRow);

        // Auto-tiling toggle
        const autoTilingSwitch = new Gtk.Switch({
            vexpand: false,
            valign: Gtk.Align.CENTER,
            active: ruleConfig.autoTiling,
            sensitive: !isDefault,
        });
        if (!isDefault) {
            autoTilingSwitch.connect('notify::active', () =>
                this.saveCustomRules(),
            );
        }
        const appAutoTilingRow = new Adw.ActionRow({
            title: _('Auto-tiling'),
            subtitle: _('Automatically tile new windows for this application'),
            activatableWidget: autoTilingSwitch,
        });
        appAutoTilingRow.add_suffix(autoTilingSwitch);
        appRow.add_row(appAutoTilingRow);

        // Snap assistant toggle
        const snapAssistSwitch = new Gtk.Switch({
            vexpand: false,
            valign: Gtk.Align.CENTER,
            active: ruleConfig.snapAssist,
            sensitive: !isDefault,
        });
        if (!isDefault) {
            snapAssistSwitch.connect('notify::active', () =>
                this.saveCustomRules(),
            );
        }
        const appSnapAssistRow = new Adw.ActionRow({
            title: _('Snap assistant'),
            subtitle: _('Enable snap assistant for this application'),
            activatableWidget: snapAssistSwitch,
        });
        appSnapAssistRow.add_suffix(snapAssistSwitch);
        appRow.add_row(appSnapAssistRow);

        // Window suggestions toggle
        const windowSuggestionsSwitch = new Gtk.Switch({
            vexpand: false,
            valign: Gtk.Align.CENTER,
            active: ruleConfig.windowSuggestions,
            sensitive: !isDefault,
        });
        if (!isDefault) {
            windowSuggestionsSwitch.connect('notify::active', () =>
                this.saveCustomRules(),
            );
        }
        const appWindowSuggestionsRow = new Adw.ActionRow({
            title: _('Window suggestions'),
            subtitle: _(
                "Suggest this application's windows to fill empty tiles",
            ),
            activatableWidget: windowSuggestionsSwitch,
        });
        appWindowSuggestionsRow.add_suffix(windowSuggestionsSwitch);
        appRow.add_row(appWindowSuggestionsRow);

        // Resize complementing windows toggle
        const resizeComplementingSwitch = new Gtk.Switch({
            vexpand: false,
            valign: Gtk.Align.CENTER,
            active: ruleConfig.resizeComplementing,
            sensitive: !isDefault,
        });
        if (!isDefault) {
            resizeComplementingSwitch.connect('notify::active', () =>
                this.saveCustomRules(),
            );
        }
        const appResizeComplementingRow = new Adw.ActionRow({
            title: _('Resize complementing windows'),
            subtitle: _(
                'Auto-resize nearby windows when this window is resized',
            ),
            activatableWidget: resizeComplementingSwitch,
        });
        appResizeComplementingRow.add_suffix(resizeComplementingSwitch);
        appRow.add_row(appResizeComplementingRow);

        // Span multiple tiles toggle
        const spanMultipleTilesSwitch = new Gtk.Switch({
            vexpand: false,
            valign: Gtk.Align.CENTER,
            active: ruleConfig.spanMultipleTiles,
            sensitive: !isDefault,
        });
        if (!isDefault) {
            spanMultipleTilesSwitch.connect('notify::active', () =>
                this.saveCustomRules(),
            );
        }
        const appSpanMultipleTilesRow = new Adw.ActionRow({
            title: _('Span multiple tiles'),
            subtitle: _('Allow this application to span multiple tiles'),
            activatableWidget: spanMultipleTilesSwitch,
        });
        appSpanMultipleTilesRow.add_suffix(spanMultipleTilesSwitch);
        appRow.add_row(appSpanMultipleTilesRow);

        // Store row with switch references (only for custom rules)
        if (!isDefault) {
            const rowData: ApplicationRowData = {
                row: appRow,
                switches: {
                    customBorder: customBorderSwitch,
                    autoTiling: autoTilingSwitch,
                    snapAssist: snapAssistSwitch,
                    windowSuggestions: windowSuggestionsSwitch,
                    resizeComplementing: resizeComplementingSwitch,
                    spanMultipleTiles: spanMultipleTilesSwitch,
                },
            };
            this.applicationRows.push(rowData);
        }

        // Delete button or info row
        if (isDefault) {
            const infoRow = new Adw.ActionRow({
                title: _('This is a default rule'),
                subtitle: _(
                    `All features are disabled for ${appName} by default`,
                ),
                activatable: false,
            });
            infoRow.add_prefix(
                new Gtk.Image({
                    icon_name: 'dialog-information-symbolic',
                    valign: Gtk.Align.CENTER,
                }),
            );
            appRow.add_row(infoRow);
        } else {
            const deleteButton = new Gtk.Button({
                label: _('Delete'),
                css_classes: ['destructive-action'],
                halign: Gtk.Align.CENTER,
                margin_top: 12,
                margin_bottom: 6,
            });
            deleteButton.connect('clicked', () => {
                this.existingWmClasses.delete(wmClass.toLowerCase());
                // Remove from array
                const index = this.applicationRows.findIndex(
                    (item) => item.row === appRow,
                );
                if (index > -1) this.applicationRows.splice(index, 1);

                this.customRulesGroup.remove(appRow);
                this.saveCustomRules();
            });
            const deleteRow = new Adw.ActionRow({
                activatable: false,
            });
            deleteRow.set_child(deleteButton);
            appRow.add_row(deleteRow);
        }

        return appRow;
    }

    /**
     * Show dialog for adding a new application
     */
    private showAddApplicationDialog(
        parentWindow: Adw.PreferencesWindow,
        onAdd: (appName: string, wmClass: string) => void,
    ): void {
        // Create dialog window
        const dialog = new Adw.Window({
            modal: true,
            hide_on_close: true,
            transient_for: parentWindow,
            default_width: 400,
            default_height: 300,
        });

        // Create header bar
        const headerBar = new Adw.HeaderBar();
        dialog.set_title(_('Add Application'));

        // Create content
        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(headerBar);

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
            spacing: 18,
        });

        // Application name entry
        const nameEntry = new Gtk.Entry({
            placeholder_text: _('Application Name (e.g., Firefox)'),
            hexpand: true,
        });
        const nameRow = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
        });
        nameRow.append(
            new Gtk.Label({
                label: _('Application Name'),
                halign: Gtk.Align.START,
            }),
        );
        nameRow.append(nameEntry);

        // WM Class entry
        const wmClassEntry = new Gtk.Entry({
            placeholder_text: _('WM Class (e.g., firefox, gnome-terminal)'),
            hexpand: true,
        });
        const wmClassRow = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
        });
        wmClassRow.append(
            new Gtk.Label({
                label: _('WM Class'),
                halign: Gtk.Align.START,
            }),
        );
        wmClassRow.append(wmClassEntry);

        // Error label for duplicate WM Class
        const errorLabel = new Gtk.Label({
            label: _('This WM Class already exists in the list'),
            wrap: true,
            halign: Gtk.Align.START,
            css_classes: ['error', 'caption'],
            visible: false,
        });

        // Help text
        const helpLabel = new Gtk.Label({
            label: _(
                'Tip: You can find the WM Class by running "xprop WM_CLASS" in terminal and clicking the application window.',
            ),
            wrap: true,
            halign: Gtk.Align.START,
            css_classes: ['dim-label', 'caption'],
        });

        contentBox.append(nameRow);
        contentBox.append(wmClassRow);
        contentBox.append(errorLabel);
        contentBox.append(helpLabel);

        // Buttons
        const buttonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.END,
            margin_top: 12,
        });

        const cancelButton = new Gtk.Button({
            label: _('Cancel'),
        });
        cancelButton.connect('clicked', () => {
            dialog.close();
        });

        const addButton = new Gtk.Button({
            label: _('Add'),
            css_classes: ['suggested-action'],
        });
        addButton.connect('clicked', () => {
            const appName = nameEntry.get_text().trim();
            const wmClass = wmClassEntry.get_text().trim();

            if (appName && wmClass) {
                onAdd(appName, wmClass);
                dialog.close();
            }
        });

        // Enable/disable add button based on input and validation
        const updateAddButton = () => {
            const hasName = nameEntry.get_text().trim().length > 0;
            const wmClass = wmClassEntry.get_text().trim();
            const hasWmClass = wmClass.length > 0;
            const isDuplicate =
                hasWmClass && this.existingWmClasses.has(wmClass.toLowerCase());

            // Show/hide error message
            errorLabel.set_visible(isDuplicate);

            // Enable button only if both fields have values and no duplicate
            addButton.set_sensitive(hasName && hasWmClass && !isDuplicate);
        };

        nameEntry.connect('changed', updateAddButton);
        wmClassEntry.connect('changed', updateAddButton);
        updateAddButton(); // Initial state

        buttonBox.append(cancelButton);
        buttonBox.append(addButton);
        contentBox.append(buttonBox);

        toolbarView.set_content(contentBox);
        dialog.set_content(toolbarView);
        dialog.present();
    }

    /**
     * Build a button row
     */
    private buildButtonRow(
        label: string,
        title: string,
        subtitle: string,
        onClick: () => void,
        styleClass?: string,
    ): Adw.ActionRow {
        const btn = new Gtk.Button({
            label,
            vexpand: false,
            valign: Gtk.Align.CENTER,
        });
        if (styleClass) btn.add_css_class(styleClass);
        btn.connect('clicked', onClick);

        const row = new Adw.ActionRow({ title, subtitle });
        row.add_suffix(btn);
        row.set_activatable_widget(btn);
        return row;
    }
}
