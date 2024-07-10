import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

export const createButton = (iconName: string, text: string, path?: string): St.Button => {
  const btn = createIconButton(iconName, path);
  btn.child.add_child(
    new St.Label({
      marginBottom: 4,
      marginTop: 4,
      text: text,
      yAlign: Clutter.ActorAlign.CENTER,
    }),
  );
  return btn;
};

export const createIconButton = (iconName: string, path?: string): St.Button => {
  const btn = new St.Button({
    styleClass: 'message-list-clear-button button',
    canFocus: true,
    xExpand: true,
    child: new St.BoxLayout({
      vertical: false, // horizontal box layout
      clipToAllocation: true,
      xAlign: Clutter.ActorAlign.CENTER,
      yAlign: Clutter.ActorAlign.CENTER,
      reactive: true,
      xExpand: true,
      style: 'spacing: 8px',
    }),
  });

  const icon = new St.Icon({
    iconSize: 16,
    yAlign: Clutter.ActorAlign.CENTER,
    style: 'padding: 6px',
  });
  if (path) {
    icon.gicon = Gio.icon_new_for_string(`${path}/icons/${iconName}.svg`);
  } else {
    icon.iconName = iconName;
  }
  btn.child.add_child(icon);
  return btn;
};
