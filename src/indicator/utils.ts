import St from 'gi://St';
import Clutter from 'gi://Clutter';

export const createButton = (icon_name: string, text: string) : St.Button => {
    const btn = new St.Button({ 
        styleClass: "button",
        canFocus: true,
        xExpand: true,
        child: new St.BoxLayout({
            vertical: false, // horizontal box layout
            clipToAllocation: true,
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            reactive: true,
            xExpand: true,
            style: "spacing: 8px",
        })
    });
    btn.child.add_child(new St.Icon({ iconName: icon_name, iconSize: 16 }));
    btn.child.add_child(new St.Label({ marginBottom: 4, marginTop: 4, text: text, yAlign: Clutter.ActorAlign.CENTER }));
    return btn;
}