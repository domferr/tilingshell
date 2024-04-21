# Modern Window Manager #

This is a Gnome Shell extension implementing modern windows tiling system by extending GNOME's default 2 columns to any layout you want!
- 🤩 first and only extension that provides Windows 11's **snap assistant**
- 🖥️🖥️ **multiple monitors support**, even with different scaling factors!
- ⚙️ manage, edit, create and delete layouts with a **built-in editor**
- 💡 layouts are not strict, you can **span multiple tiles** if you want
- 🚀 automatically sets the same UI of your GNOME theme, for a **seamless integration**!

Can be installed on Gnome Shells from 40 to 44 on X11 and Wayland. This extension also provides all the functionalities of Windows 11 Snap Assistant and Windows PowerToys FancyZones.

Have issues, you want to suggest a new feature or contribute? Please open a new [issue](https://github.com/domferr/modernwindowmanager/issues)!

## Usage ##

### Tiling System ###
When grabbing and moving a window, press <kbd>CTRL</kbd> key to show the tiling layout. When moving on a tile, it will highlight. Ungrab the window to place that window on the highlighted tile.

[tiling_system.webm](https://github.com/domferr/modernwindowmanager/assets/14203981/a45ec416-ad39-458d-9b9f-cddce8b25666)

### Snap Assistant ###
When grabbing and moving a window, the snap assistant will be available on top of the screen. Move the window near it to activate the snap assistant. While still grabbing the window, move your mouse to the tile you are interested in. By stopping grabbing the window will be tiled to the selected tile!

[snap_assistant.webm](https://github.com/domferr/modernwindowmanager/assets/14203981/33511582-fa92-445e-b1ba-8b08f9a8e43a)

### Select a layout ###
Click on ModernWindowManager's panel indicator and the available layouts will be shown. Select the one you prefer by clicking on it. That layout will be applied to every monitor in case you have more than one.

[layout_selection.webm](https://github.com/domferr/modernwindowmanager/assets/14203981/f4956a34-64e3-4c24-b177-8f9b08fcc45c)

### Select multiple tiles ###

The layout is not strict. You can select multiple tiles too! Just hold <kbd>SHIFT</kbd> while using the tiling system.

[multiple_selection.webm](https://github.com/domferr/modernwindowmanager/assets/14203981/92b29130-260c-479d-9237-bf5c87427e52)

### Layout editor ###

> <kbd>LEFT CLICK</kbd> to split a tile. <kbd>LEFT CLICK</kbd> + <kbd>CTRL</kbd> to split a tile _vertically_. <kbd>RIGHT CLICK</kbd> to delete a tile.

[layout_editor.webm](https://github.com/domferr/modernwindowmanager/assets/14203981/c6e05589-69d9-4fa3-a4df-61ee875cf9e1)

## Installation

Download the latest [release](https://github.com/domferr/modernwindowmanager/releases). Extract the downloaded archive. Copy the folder to `~/.local/share/gnome-shell/extensions` directory. You need to reload GNOME Shell afterwards (e.g. by logging out). Then you can enable the extension:
```bash
/usr/bin/gnome-extensions enable modernwindowmanager@ferrarodomenico.com
```
Currently, this extension is not on [extensions.gnome.org](https://extensions.gnome.org/). However, if you are interested we can publish it there. Let us know by opening a new [issue](https://github.com/domferr/modernwindowmanager/issues)!

### Install via Source

Clone the repo then run ```npm i``` to install dependencies and then run ```npm run build``` to build the extension. To finally install the extension run
```bash
npm run install:extension
```
You can restart your GNOME shell e.g. logout then login, or restart in place with an `alt-F2` and entering `r` (X11 only) and enable the extension. Enjoy it!
To enable via the command line you can run 
```bash
/usr/bin/gnome-extensions enable modernwindowmanager@ferrarodomenico.com
```

### Uninstall ModernWindowManager

To uninstall, first disable the extension and then remove it. To disable via the command line you can run 
```bash
/usr/bin/gnome-extensions disable modernwindowmanager@ferrarodomenico.com
```

## Contributing

Feel free to submit [issues](https://github.com/domferr/modernwindowmanager/issues/new/choose) and [Pull Requests](https://github.com/domferr/modernwindowmanager/pulls)!
