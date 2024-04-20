import St from '@gi-types/st1';
import Clutter from '@gi-types/clutter10';

export const createButton = (icon_name: string, text: string) : St.Button => {
    const btn = new St.Button({ 
        style_class: "message-list-clear-button button default",
        can_focus: true,
        x_expand: true,
        child: new St.BoxLayout({
            vertical: false, // horizontal box layout
            clip_to_allocation: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            x_expand: true,
            style: "spacing: 8px",
        })
    });
    btn.child.add_child(new St.Icon({ icon_name: icon_name, icon_size: 16 }));
    btn.child.add_child(new St.Label({ margin_bottom: 4, margin_top: 4, text: text, yAlign: Clutter.ActorAlign.CENTER }));
    return btn;
}