<img src="https://raw.githubusercontent.com/domferr/tilingshell/main/logo.png" align="right" width="76"/>

[![release](https://img.shields.io/badge/Release_v16-blue?style=for-the-badge)]([https://ko-fi.com/domferr](https://github.com/domferr/tilingshell/releases))
![](https://img.shields.io/github/license/domferr/tilingshell?style=for-the-badge)
![](https://img.shields.io/badge/GNOME-42--49-e04196?style=for-the-badge&logo=gnome&logoColor=white)
[![kofi](https://img.shields.io/badge/Donate_on_Ko--fi-purple?logo=ko-fi&style=for-the-badge)](https://ko-fi.com/domferr)
[![patreon](https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://patreon.com/domferr)

# Tiling Shell #

This is a Gnome Shell extension implementing modern windows tiling system by extending GNOME's default 2 columns to any layout you want! Can be installed on Gnome Shells from **42 to 49** on X11 and Wayland: the most recent GNOME Shell is supported, and older releases will include all the features and bug fixes!

- 🤩 First and only extension that provides Windows 11's **snap assistant**
- 🖥️🖥️ **multiple monitors support**, even with different scaling factors!
- ⚙️ Manage, edit, create and delete layouts with a **built-in editor**
- 💡 Layouts are not strict, you can **span multiple tiles** if you want
- 🚀 Automatically sets the same UI of your GNOME theme, for a **seamless integration**!

<div align="center">
  <a href="https://extensions.gnome.org/extension/7065/tiling-shell/" >
      <img src="https://img.shields.io/badge/Install%20from-extensions.gnome.org-4A86CF?style=for-the-badge&logo=Gnome&logoColor=white"/>
  </a>
</div>

<img src="https://github.com/domferr/tilingshell/blob/main/doc/horiz_summary.jpg" align="center"/>

<details>
  <summary><span align="center">See here the video overview</span></summary>
  
  https://github.com/user-attachments/assets/2905f0a1-ecd4-47b5-a6bc-59f91716e685
</details>

Have issues, you want to suggest a new feature or contribute? Please open a new [issue](https://github.com/domferr/tilingshell/issues)!

## Usage ##

| [⬇️](#tiling-system) Tiling System | [⬇️](#snap-assistant) Snap Assistant | [⬇️](#select-a-layout) Select a layout | [⬇️](#select-multiple-tiles) Select multiple tiles |
|:---|:---|:---|:---|
| [⬇️](#layout-editor) **Layout editor** | [⬇️](#smart-resize) **Smart resize** | [⬇️](#tile-with-keyboard) **Tile with Keyboard** | [⬇️](#edge-tiling) **Edge Tiling** |
| [⬇️](#tiling-buttons) **Tiling Buttons** | [⬇️](#per-workspace-layout) **Per-workspace layout** | [⬇️](#auto-tiling) **Auto-tiling** | [⬇️](#tiling-context-menu) **Tiling context menu** |
| [⬇️](#smart-border-radius) **Smart border radius** | [⬇️](#windows-suggestions) **Windows Suggestions** 

## 🎉🎉 Tiling Shell's AWESOME Supporters!
Thank you to the :star2: **amazing** <a href="https://patreon.com/domferr"><img src="https://img.shields.io/badge/Patreons-F96854?logo=patreon&logoColor=white)" height="14px"/><a/> and **everyone** who donated on <a href="https://ko-fi.com/domferr"><img src="https://img.shields.io/badge/_Ko--fi-794bc4?logo=ko-fi&logoColor=white" height="14px"/><a/>! :medal_sports:Sean, Markus Huggler, Kostja Palović, Mike Empey, Miguel and Jesse Dhillon on Patreon:medal_sports: and Zorin OS, Nick, thy-fi, iatanas0v, Chris, wbezs, DaneshManoharan, Tamas, Ivan Banha and many more on Ko-fi! You are on a mission to **make Linux window management better for everyone**!

### Tiling System ###
When grabbing and moving a window, press <kbd>CTRL</kbd> key to show the tiling layout (you can choose another key from the preferences). When moving on a tile, it will highlight. Ungrab the window to place that window on the highlighted tile.

[tiling_system.webm](https://github.com/domferr/tilingshell/assets/14203981/a45ec416-ad39-458d-9b9f-cddce8b25666)

> This extension and the tiling system also implements Windows PowerToys FancyZones!

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Snap Assistant ###
When grabbing and moving a window, the snap assistant will be available on top of the screen. Move the window near it to activate the snap assistant. While still grabbing the window, move your mouse to the tile you are interested in. By stopping grabbing the window will be tiled to the selected tile!

[snap_assistant.webm](https://github.com/domferr/tilingshell/assets/14203981/33511582-fa92-445e-b1ba-8b08f9a8e43a)

> Snap Assistant's sensibility can be customized from the preferences.

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Select a layout ###
Click on Tiling Shell's panel indicator and the available layouts will be shown. Select the one you prefer by clicking on it. That layout will be applied to every monitor in case you have more than one.

[layout_selection.webm](https://github.com/domferr/tilingshell/assets/14203981/f4956a34-64e3-4c24-b177-8f9b08fcc45c)


<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Select multiple tiles ###

The layout is not strict. You can select multiple tiles too! Just hold <kbd>ALT</kbd> while using the tiling system (you can choose another key from the preferences).

[multiple_selection.webm](https://github.com/domferr/tilingshell/assets/14203981/92b29130-260c-479d-9237-bf5c87427e52)


<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Layout editor ###

| Split a tile | Split a tile _vertically_ | Delete a tile | Save, close the editor or open the menu |
|:---:|:---:|:---:|:---:|
| <kbd>LEFT CLICK</kbd> | <kbd>LEFT CLICK</kbd> + <kbd>CTRL</kbd> | <kbd>RIGHT CLICK</kbd> | Click the Tiling Shell's icon <img src="https://github.com/domferr/tilingshell/assets/14203981/13e27ec1-6a5d-420f-a87f-8f3df0b34c92" width=96 /> on the panel. |

[layout_editor.webm](https://github.com/domferr/tilingshell/assets/14203981/c6e05589-69d9-4fa3-a4df-61ee875cf9e1)

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Smart resize ###

You can resize adjacent tiled windows together!

[Resizing tiled windows](https://github.com/domferr/tilingshell/assets/14203981/da4ef97e-cdbb-4981-a8ab-9ca8cd23d63d)

> It can be enabled/disabled from the preferences

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Tile with Keyboard ###

Move window through the tiles using keyboard shortcuts (<kbd>SUPER</kbd>+<kbd>←</kbd>/<kbd>↑</kbd>/<kbd>↓</kbd>/<kbd>→</kbd>). They can be customized from the preferences!

[Tile with Keyboard Video](https://github.com/user-attachments/assets/6f8dedbb-2733-41d8-8a94-0fa62dffb915)

> It can be enabled/disabled from the preferences

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Edge Tiling ###

You can tile a window by moving it to the edge.

[Screencast from 2024-06-22 22-12-22.webm](https://github.com/domferr/tilingshell/assets/14203981/6e5a2ba9-cd38-44bb-b791-51e41e07f7a0)

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Tiling Buttons ###

Right-click on a window to use the auto-tile buttons and the snap assistant from there! The auto-tile buttons allow you to tile to the leftmost or rightmost empty tile, based on your selected layout. The "Move to best tile" button suggests tiling to the nearest empty tile to the center of the screen.

[Screencast from 2024-07-13 18-21-57.webm](https://github.com/user-attachments/assets/8fd79faa-a476-4b55-b79c-6329e4b59519)

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Per-workspace layout ###

You can select your favorite layout for each workspace of each monitor.

[per-workspace](https://github.com/user-attachments/assets/41226602-5950-47d1-bbf6-3d7ff3e265fb)

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Auto-tiling ###

When a window is created, it is automatically moved to the best tile according to where other windows are tiled and the current layout. This is disabled by default and can be enabled in the preferences.

[automatic_tiling](https://github.com/user-attachments/assets/76abc53f-2c6d-47ab-bee3-bbcdd946f2a1)

### Export and import layouts ###

*Tiling Shell* supports importing and exporting its layouts to a JSON file. With this you can create your own custom layouts without the built-in graphical editor, or share your layouts with others! If you are interested into knowing more about the contents of the layout file check the official [documentation](./doc/json-internal-documentation.md).


<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Tiling context menu ###

Right-click on a window to use the auto-tile buttons and the snap assistant from there! These buttons allow you to tile to the leftmost or rightmost empty tile, based on your selected layout. The "Move to best tile" button suggests tiling to the nearest empty tile to the center of the screen.

<p align="center"><img src="https://github.com/user-attachments/assets/d660779a-7549-4858-b149-59edad076483" width=520/></p>

<p align="center">Check the demonstration video to see it in action!</p>

[Screencast from 2024-07-13 18-21-57.webm](https://github.com/user-attachments/assets/8fd79faa-a476-4b55-b79c-6329e4b59519)

> The original idea was to show the snap assistant when hovering the maximize button (as it is done on Windows 11). Unfortunately, GNOME doesn't let us handle the hovering of the maximize button or add another button near it...

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Smart border radius ###

In GNOME, different windows may have different border radius. Drawing a border around the focused window is hard because it is not possible to know the window border radius. All the existing extensions just draw a border with a static value, making the UI less polished. Tiling Shell, **dynamically** computes the focused window border radius at runtime. Moreover, if you have an extension or anything else who customize the border radius, the focused window border radius adapts as well! This can be enabled/disabled from the extension's preferences too.


<p align="center">
<img src="https://github.com/user-attachments/assets/cfaca5f9-d9b2-4739-9426-1aebb5f33c29" width=304 />
<img src="https://github.com/user-attachments/assets/8e68abff-66e5-4b85-a6ce-0bd2da7be166" width=332 />
</p>

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

### Windows Suggestions ###

After placing a window in a tile using the tiling system, snap assistant or active screen edges, you’ll see suggestions for other windows to fill the remaining tiles. Got too many windows open? No problem! If all suggestions don’t fit within the available space, you’ll get a **scrollable list** for quick and easy navigation. See it in action:

https://github.com/user-attachments/assets/fbf68458-199d-490b-90cf-3e976d5b511b

_Can I choose to opt in or out?_

Yes. From the extension's preferences you find a section called Windows Suggestions. You can enable and disable windows suggestions for tiling system, snap assistant and screen edges. You can choose which of the three to keep enabled, or all of them, to personalize for your needs and preferences. 

<p align="right"><b>Go to Usage</b> <a href="#usage">⬆️</a></p>

## Installation

This extension is published on [extensions.gnome.org](https://extensions.gnome.org/extension/7065/tiling-shell/)! You can install from there or install manually. By installing from [extensions.gnome.org](https://extensions.gnome.org/extension/7065/tiling-shell/) you will always have the latest update.

<div align="center">
  <a href="https://extensions.gnome.org/extension/7065/tiling-shell/" >
      <img src="https://img.shields.io/badge/Install%20from-extensions.gnome.org-4A86CF?style=for-the-badge&logo=Gnome&logoColor=white"/>
  </a>
</div>

### Install manually
Download the latest [release](https://github.com/domferr/tilingshell/releases). Extract the downloaded archive. Copy the folder to `~/.local/share/gnome-shell/extensions` directory. You need to reload GNOME Shell afterwards (e.g. by logging out). Then you can enable the extension:
```bash
/usr/bin/gnome-extensions enable tilingshell@ferrarodomenico.com
```

### Install via Source

Clone the repo then run ```npm i``` to install dependencies and then run ```npm run build``` to build the extension. To finally install the extension run
```bash
npm run install:extension
```
You can restart your GNOME shell e.g. logout then login, or restart in place with an `alt-F2` and entering `r` (X11 only) and enable the extension. Enjoy it!
To enable via the command line you can run 
```bash
/usr/bin/gnome-extensions enable tilingshell@ferrarodomenico.com
```

To read the logs you can run

```bash
journalctl --follow /usr/bin/gnome-shell
```

To read the logs of the preferences you can run

```bash
journalctl -f -o cat /usr/bin/gjs
```
### Uninstall Tiling Shell

To uninstall, first disable the extension and then remove it. To disable via the command line you can run 
```bash
/usr/bin/gnome-extensions disable tilingshell@ferrarodomenico.com
```

## Contributing

Feel free to submit [issues](https://github.com/domferr/tilingshell/issues/new/choose) and [Pull Requests](https://github.com/domferr/tilingshell/pulls)!

### How to add new keybindings

1. Edit the file `resources/schemas/org.gnome.shell.extensions.tilingshell.gschema.xml` and add a new key with a name, default empty value and a summary. For example, add the following if the name is `highlight-current-window` and the summary is `Minimize all the other windows and show only the focused window`:
```xml
<key type="as" name="highlight-current-window">
  <default><![CDATA[['']]]></default>
  <summary>Minimize all the other windows and show only the focused window</summary>
</key>
```

2. Edit the file `src/settings/settings.ts` and add a static constant at the end of the list of the static constants (for example [here](https://github.com/domferr/tilingshell/blob/8a1f21620d5d8f1db7c5b6b45c0ef0c483801420/src/settings/settings.ts#L138)). The static constant must be a string equal to the key name. The constant name must start with `SETTING_` and must be the key name capitalized and using underscores. For example if the key name is `highlight-current-window`, add this to the file:
```js
static SETTING_HIGHLIGHT_CURRENT_WINDOW = 'highlight-current-window';
```

3. Edit the file `src/keybindings.ts` by adding a new signal with a name equal to the key name. Be sure to put `Meta.Display.$gtype` followed by all the parameter types you need (if any). For example, if the key name is `highlight-current-window` and it doesn't need any parameter, add this:
```js
'highlight-current-window': {
    param_types: [Meta.Display.$gtype], // Meta.Display,
},
```

4. The idea is that, when the user presses the keybindings, the Keybinding singleton class will emit that signal. To achieve that, edit the file `src/keybindings.ts` by emitting the signal when the keybindings are used, for example [here](https://github.com/domferr/tilingshell/blob/8a1f21620d5d8f1db7c5b6b45c0ef0c483801420/src/keybindings.ts#L223). For example if the key name is `highlight-current-window`, add this:
```js
Main.wm.addKeybinding(
    Settings.SETTING_HIGHLIGHT_CURRENT_WINDOW,
    extensionSettings,
    Meta.KeyBindingFlags.NONE,
    Shell.ActionMode.NORMAL,
    (display: Meta.Display) => {
        this.emit('highlight-current-window', display);
    },
);
```
You can put after `display` all the parameters you need (if any).

5. Ensure you disable the keybindings when the extension is disabled. To achieve that edit the file `src/keybindings.ts` to remove the keybindings, for example [here](https://github.com/domferr/tilingshell/blob/8a1f21620d5d8f1db7c5b6b45c0ef0c483801420/src/keybindings.ts#L318). For example, if the key name is `highlight-current-window` then add this:
```js
Main.wm.removeKeybinding(Settings.SETTING_HIGHLIGHT_CURRENT_WINDOW);
```

6. You can now listen to the keybindings from everywhere by just connecting to the signal. A good place to do so is in the `src/extension.ts` file, for example [here](https://github.com/domferr/tilingshell/blob/8a1f21620d5d8f1db7c5b6b45c0ef0c483801420/src/extension.ts#L264). For example, if the key name is `highlight-current-window` then add this:
```js
this._signals.connect(
  this._keybindings,
  'highlight-current-window',
  (kb: KeyBindings, dp: Meta.Display) => {
      // handle the keybinding and perform the actions you want
      // to happen when the keybinding is used by the user
      ...
  },
);
```

7. Edit the file `src/prefs.ts` to allow the user to choose its preferred keybindings. This can be easily done by adding a new entry in the `keybindings` array. For example by adding a new entry [here](https://github.com/domferr/tilingshell/blob/8a1f21620d5d8f1db7c5b6b45c0ef0c483801420/src/prefs.ts#L639). For example, if the key name is `highlight-current-window` then add this:
```js
[
    Settings.SETTING_HIGHLIGHT_CURRENT_WINDOW,
    _('Highlight focused window'),
    _('Minimize all the other windows and show only the focused window'),
    false,
    false,
],
```
The first element is the settings key, the second element is the title and the third is the description. The fourth is a boolean used by the preferences to store if that setting is set or not. The last is a boolean that indicates whether or not this setting must be on the main page, otherwise it can be accessed by expanding the list of available keybindings. However, any keybinding set by the user is always put on the main page.
_Please use the same description you wrote in the schema at step 1._

For any problem, doubts or if you are stuck, feel free to open a pull request with what you have already done. I'm more than happy to help!

## Vagrant

```
The private key to connect to the machine via SSH must be owned
by the user running Vagrant. This is a strict requirement from
SSH itself. Please fix the following key to be owned by the user
running Vagrant:
```

If you are running on a NTFS file system then you have to move out the key:
```
mv /path/to/box/virtualbox/private_key $HOME/.ssh/vagrant_key
ln -sr $HOME/.ssh/vagrant_key /path/to/box/virtualbox/private_key
```
