import { Gtk, Adw, Gio } from '@gi.prefs';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { logger } from '@utils/logger';

const debug = logger('ApplicationPicker');

interface ApplicationInfo {
    name: string;
    appId: string;
    icon?: string;
}

export class ApplicationPicker {
    /**
     * Get a list of installed applications with their application IDs
     */
    private static getInstalledApplications(): ApplicationInfo[] {
        const applications: ApplicationInfo[] = [];
        const appInfos = Gio.AppInfo.get_all();

        for (const appInfo of appInfos) {
            if (!appInfo.should_show()) continue;

            const desktopApp = appInfo as Gio.DesktopAppInfo;
            const name = appInfo.get_display_name() || appInfo.get_name();

            if (!name) continue;
            const appId = ApplicationPicker.tryGetAppId(desktopApp);

            if (!appId) continue;

            // Get icon
            const iconObj = appInfo.get_icon();
            const icon = iconObj ? iconObj.to_string() || '' : '';

            applications.push({ name, appId, icon });
        }

        // Sort by name
        applications.sort((a, b) => a.name.localeCompare(b.name));

        return applications;
    }

    private static tryGetAppId(
        desktopApp: Gio.DesktopAppInfo,
    ): string | undefined {
        const desktopId = desktopApp.get_id();
        if (!desktopId) return undefined;

        // Remove .desktop extension and convert to lowercase
        const appId = desktopId.replace(/\.desktop$/, '').toLowerCase();

        return appId;
    }

    /**
     * Show application picker dialog
     */
    static showPicker(
        parentWindow: Gtk.Window,
        existingAppIds: Set<string>,
        onSelect: (appName: string, appId: string) => void,
    ): void {
        // Create dialog window
        const dialog = new Adw.Window({
            modal: true,
            hide_on_close: true,
            transient_for: parentWindow,
            default_width: 500,
            default_height: 600,
        });

        // Create header bar
        const headerBar = new Adw.HeaderBar();
        dialog.set_title(_('Select Application'));

        // Create toolbar view
        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(headerBar);

        // Create main content box
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
        });

        // Search entry
        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: _('Search applications...'),
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 6,
        });

        contentBox.append(searchEntry);

        // Scrolled window for app list
        const scrolledWindow = new Gtk.ScrolledWindow({
            vexpand: true,
            hexpand: true,
        });

        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
            margin_start: 12,
            margin_end: 12,
            margin_top: 6,
            margin_bottom: 12,
        });

        scrolledWindow.set_child(listBox);
        contentBox.append(scrolledWindow);

        // Info label
        const infoLabel = new Gtk.Label({
            label: _(
                'Tip: If an application is not listed, you can enter it manually below.',
            ),
            wrap: true,
            margin_start: 12,
            margin_end: 12,
            margin_bottom: 12,
            css_classes: ['dim-label', 'caption'],
            halign: Gtk.Align.START,
        });
        contentBox.append(infoLabel);

        // Manual entry section
        const manualBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_start: 12,
            margin_end: 12,
            margin_bottom: 12,
        });

        const manualLabel = new Gtk.Label({
            label: _('Or enter manually:'),
            halign: Gtk.Align.START,
            css_classes: ['heading'],
        });
        manualBox.append(manualLabel);

        // Manual name entry
        const nameEntry = new Gtk.Entry({
            placeholder_text: _('Application Name'),
            hexpand: true,
        });
        manualBox.append(nameEntry);

        // Manual application ID entry
        const appIdEntry = new Gtk.Entry({
            placeholder_text: _('Application ID (e.g., org.gnome.Nautilus)'),
            hexpand: true,
        });
        manualBox.append(appIdEntry);

        // Error label for duplicates
        const errorLabel = new Gtk.Label({
            label: _('This application is already in the list'),
            wrap: true,
            halign: Gtk.Align.START,
            css_classes: ['error', 'caption'],
            visible: false,
        });
        manualBox.append(errorLabel);

        // Manual add button
        const addManualButton = new Gtk.Button({
            label: _('Add Manually'),
            css_classes: ['suggested-action'],
            halign: Gtk.Align.END,
            sensitive: false,
        });
        manualBox.append(addManualButton);

        contentBox.append(manualBox);

        // Get applications
        const applications = this.getInstalledApplications();
        const rows = new Map<Gtk.ListBoxRow, ApplicationInfo>();

        // Populate list
        for (const app of applications) {
            const isDuplicate = existingAppIds.has(app.appId.toLowerCase());

            const row = new Gtk.ListBoxRow({
                activatable: !isDuplicate,
            });

            const rowBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                margin_start: 12,
                margin_end: 12,
                margin_top: 8,
                margin_bottom: 8,
            });

            // App icon
            if (app.icon) {
                const icon = new Gtk.Image({
                    icon_name: app.icon,
                    pixel_size: 32,
                    valign: Gtk.Align.CENTER,
                });
                rowBox.append(icon);
            }

            // App info
            const labelBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 2,
                hexpand: true,
                valign: Gtk.Align.CENTER,
            });

            const nameLabel = new Gtk.Label({
                label: app.name,
                halign: Gtk.Align.START,
                wrap: false,
                ellipsize: 3, // PANGO_ELLIPSIZE_END
            });
            labelBox.append(nameLabel);

            const appIdLabel = new Gtk.Label({
                label: isDuplicate
                    ? `${app.appId} (${_('already added')})`
                    : app.appId,
                halign: Gtk.Align.START,
                css_classes: isDuplicate
                    ? ['dim-label', 'caption', 'error']
                    : ['dim-label', 'caption'],
                wrap: false,
                ellipsize: 3,
            });
            labelBox.append(appIdLabel);

            rowBox.append(labelBox);

            if (!isDuplicate) {
                // Add chevron
                const chevron = new Gtk.Image({
                    icon_name: 'go-next-symbolic',
                    valign: Gtk.Align.CENTER,
                });
                rowBox.append(chevron);
            }

            row.set_child(rowBox);
            listBox.append(row);

            if (!isDuplicate) rows.set(row, app);
            else row.set_sensitive(false);
        }

        // Handle row activation
        listBox.connect('row-activated', (_listBox, row) => {
            const app = rows.get(row);
            if (app) {
                onSelect(app.name, app.appId);
                dialog.close();
            }
        });

        // Search functionality
        listBox.set_filter_func((row) => {
            const searchText = searchEntry.get_text().toLowerCase();
            if (!searchText) return true;

            const app = rows.get(row);
            if (!app) {
                // Check disabled rows too
                const child = row.get_child() as Gtk.Box;
                if (!child) return false;

                // Get the text from labels
                const labelBox = child
                    .get_first_child()
                    ?.get_next_sibling() as Gtk.Box;
                if (!labelBox) return false;

                const nameLabel = labelBox.get_first_child() as Gtk.Label;
                const appIdLabel = nameLabel?.get_next_sibling() as Gtk.Label;

                const name = nameLabel?.get_label().toLowerCase() || '';
                const appId = appIdLabel?.get_label().toLowerCase() || '';

                return name.includes(searchText) || appId.includes(searchText);
            }

            return (
                app.name.toLowerCase().includes(searchText) ||
                app.appId.toLowerCase().includes(searchText)
            );
        });

        searchEntry.connect('search-changed', () => {
            listBox.invalidate_filter();
        });

        // Manual entry validation
        const updateManualButton = () => {
            const name = nameEntry.get_text().trim();
            const appId = appIdEntry.get_text().trim();
            const isDuplicate =
                appId.length > 0 && existingAppIds.has(appId.toLowerCase());

            errorLabel.set_visible(isDuplicate);
            addManualButton.set_sensitive(
                name.length > 0 && appId.length > 0 && !isDuplicate,
            );
        };

        nameEntry.connect('changed', updateManualButton);
        appIdEntry.connect('changed', updateManualButton);

        addManualButton.connect('clicked', () => {
            const name = nameEntry.get_text().trim();
            const appId = appIdEntry.get_text().trim();
            if (name && appId) {
                onSelect(name, appId);
                dialog.close();
            }
        });

        toolbarView.set_content(contentBox);
        dialog.set_content(toolbarView);
        dialog.present();

        // Focus search entry
        searchEntry.grab_focus();
    }
}
