# ModernWindowManager #

This is a [Gnome Shell](https://wiki.gnome.org/Projects/GnomeShell) extension which provides a windows tiling system, supporting multiple monitors and focused on providing the best UX. It is also the first and only extension which provides Windows 11's snap assistant!

Can be installed on Gnome Shells from 40 to 44 on X11 and Wayland.

Have issues, you want to suggest a new feature or contribute? Please open a new [issue](https://github.com/domferr/modernwindowmanager/issues)!

If you're in search of features akin to Windows 11 Snap Assistant or Windows PowerToys FancyZones, this extension is the perfect solution for you!

## Installation

Currently, this extension is not on [extensions.gnome.org](https://extensions.gnome.org/extension/6099/paperwm/). However, if you are interestered we can publish it there. Let us know by opening a new [issue](https://github.com/domferr/modernwindowmanager/issues)!

### Install via Source

Clone the repo then run
```bash
npm run install:extension
```
You can restart your GNOME shell e.g. logout then login, or restart in place with an `alt-F2` and entering `r` (X11 only) and enable the extension. Enjoy it!
To enable via the command line you can run `/usr/bin/gnome-extensions enable modernwindowmanager@ferrarodomenico.com`.

### Uninstall ModernWindowManager
To uninstall simply disable the extension and remove it. To disable via the command line you can run `/usr/bin/gnome-extensions disable modernwindowmanager@ferrarodomenico.com`.

## Contributing

Feel free to submit [issues](https://github.com/paperwm/PaperWM/issues/new/choose) and [Pull Requests](https://github.com/paperwm/PaperWM/pulls)!

## Usage ##

### Tiling System ###
When grabbing and moving a window, press <kbd>CTRL</kbd> key to show the tiling layout. When moving on a tile, it will highlight. Ungrab the window to place that window on the highlighted tile.
You can select multiple tiles too! Just press <kbd>SHIFT</kbd> while using the tiling system.

### Snap Assistance ###
When grabbing and moving a window, the snap assistant will be available on top of the screen. Move the window near it to activate the snap assistance. While still grabbing the window, move your mouse to the tile you are interested in. By stopping grabbing the window will be tiled to the selected tile!

### Select a layout ###
Click on ModernWindowManager's panel indicator and the available layouts will be shown. Select the one you prefer by clicking on it. That layout will be applied to every monitor in case you have more than one.
