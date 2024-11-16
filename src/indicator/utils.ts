import { St, Clutter, Gio } from '@gi.ext';

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
            vertical: false, // horizontal box layout
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
