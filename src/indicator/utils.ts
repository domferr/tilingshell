import { St, Clutter, Gio } from '../gi/ext';

export const createButton = (
    iconName: string,
    text: string,
    path?: string,
): St.Button => {
    const btn = createIconButton(iconName, path, 8);
    btn.set_style('padding-left: 5px !important;'); // bring back the right padding
    btn.child.add_child(
        new St.Label({
            marginBottom: 4,
            marginTop: 4,
            text,
            yAlign: Clutter.ActorAlign.CENTER,
        }),
    );
    return btn;
};

/**
 * Creates a styled St.Button containing an icon suited for use in an indicator/toolbar.
 *
 * The returned button is pre-configured with:
 * - styleClass: "message-list-clear-button button"
 * - canFocus: true
 * - xExpand: true
 * - child: an St.BoxLayout (center-aligned, reactive, clipToAllocation)
 *
 * The icon is created as an St.Icon with a fixed iconSize of 16 and padding.
 * If a `path` is provided, the icon will be loaded from the file system using
 * Gio.icon_new_for_string(`${path}/icons/${iconName}.svg`). Otherwise the
 * system icon theme name is set via `icon.iconName = iconName`.
 *
 * @param iconName - The icon identifier or filename (without ".svg") to use.
 *                   When `path` is omitted this should be a name present in the
 *                   icon theme; when `path` is provided the function loads
 *                   `${path}/icons/${iconName}.svg`.
 * @param path - Optional base path to load a custom SVG icon from. If omitted,
 *               the iconName is treated as a theme icon name.
 * @param spacing - Optional spacing (in pixels) applied to the inner BoxLayout.
 *                  Defaults to 0. When > 0 the layout's `style` will include
 *                  `spacing: {spacing}px`.
 * @returns A configured St.Button instance containing the icon. The caller is
 *          responsible for adding it to the UI and wiring up any signal handlers.
 */
export const createIconButton = (
    iconName: string,
    path?: string,
    spacing = 0,
): St.Button => {
    const btn = new St.Button({
        styleClass: 'message-list-clear-button button',
        canFocus: true,
        xExpand: true,
        style: 'padding-left: 5px !important; padding-right: 5px !important;',
        child: new St.BoxLayout({
            clipToAllocation: true,
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            reactive: true,
            xExpand: true,
            style: spacing > 0 ? `spacing: ${spacing}px` : '',
        }),
    });

    const icon = new St.Icon({
        iconSize: 16,
        yAlign: Clutter.ActorAlign.CENTER,
        style: 'padding: 6px',
    });
    if (path)
        icon.gicon = Gio.icon_new_for_string(`${path}/icons/${iconName}.svg`);
    else icon.iconName = iconName;

    btn.child.add_child(icon);
    return btn;
};
