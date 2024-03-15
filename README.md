# ModernWindowManager #

This is a Gnome Shell extension implementing modern windows tiling system by extending GNOME's default 2 columns to any layout you want! It has the same UI of your GNOME theme, it supports multiple monitors and spanning of multiple tiles. It is also the first and only extension that provides Windows 11's snap assistant and supports multi monitors with different scaling factors!

Can be installed on Gnome Shells from 40 to 44 on X11 and Wayland. This extension also provides all the functionalities of Windows 11 Snap Assistant and Windows PowerToys FancyZones.

Have issues, you want to suggest a new feature or contribute? Please open a new [issue](https://github.com/domferr/modernwindowmanager/issues)!

## Usage ##

### Tiling System ###
When grabbing and moving a window, press <kbd>CTRL</kbd> key to show the tiling layout. When moving on a tile, it will highlight. Ungrab the window to place that window on the highlighted tile.

[tiling_system.webm](https://github.com/domferr/modernwindowmanager/assets/14203981/32cd38ad-2606-40bc-8d75-c92e97748e83)

### Snap Assistant ###
When grabbing and moving a window, the snap assistant will be available on top of the screen. Move the window near it to activate the snap assistant. While still grabbing the window, move your mouse to the tile you are interested in. By stopping grabbing the window will be tiled to the selected tile!

[snap_assistance.webm](https://github.com/domferr/modernwindowmanager/assets/14203981/914c0df8-0d8c-4780-8f6d-120568cf89e1)

### Select a layout ###
Click on ModernWindowManager's panel indicator and the available layouts will be shown. Select the one you prefer by clicking on it. That layout will be applied to every monitor in case you have more than one.

[layout_selection.webm](https://github.com/domferr/modernwindowmanager/assets/14203981/b79dac32-b645-44db-b407-2d201143af1c)

### Select multiple tiles ###

The layout is not strict. You can select multiple tiles too! Just press <kbd>SHIFT</kbd> while using the tiling system.

[multiple_selection.webm](https://github.com/domferr/modernwindowmanager/assets/14203981/18988971-5daf-4859-b65a-0b3c27d33530)

## Installation

Download the latest [release](https://github.com/domferr/modernwindowmanager/releases). Extract the downloaded archive. Copy the folder to `~/.local/share/gnome-shell/extensions` directory. You need to reload GNOME Shell afterwards (e.g. by logging out). Then you can enable the extension:
```bash
/usr/bin/gnome-extensions enable modernwindowmanager@ferrarodomenico.com
```
Currently, this extension is not on [extensions.gnome.org](https://extensions.gnome.org/extension/6099/paperwm/). However, if you are interested we can publish it there. Let us know by opening a new [issue](https://github.com/domferr/modernwindowmanager/issues)!


### Install via Source

Clone the repo then run
```bash
npm run install:extension
```
You can restart your GNOME shell e.g. logout then login, or restart in place with an `alt-F2` and entering `r` (X11 only) and enable the extension. Enjoy it!
To enable via the command line you can run 
```bash
/usr/bin/gnome-extensions enable modernwindowmanager@ferrarodomenico.com
```

### Uninstall ModernWindowManager
To uninstall simply disable the extension and remove it. To disable via the command line you can run 
```bash
/usr/bin/gnome-extensions disable modernwindowmanager@ferrarodomenico.com
```

## Contributing

Feel free to submit [issues](https://github.com/paperwm/PaperWM/issues/new/choose) and [Pull Requests](https://github.com/paperwm/PaperWM/pulls)!
