// import this file from places that are imported by both prefs.js and extension.js
// ensuring you do not import GNOME Shell libraries in Preferences (Clutter, Meta, St or Shell)
// and you do not import GTK libraries in GNOME Shell (Gdk, Gtk or Adw)

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

export { Gio, GLib, GObject };
