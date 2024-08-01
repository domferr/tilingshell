#!@GJS@ -m

import Gtk from "gi://Gtk";
import Gdk from "gi://Gdk";
import GLib from "gi://GLib";
//const { Gtk, Gdk } = imports.gi;

/**
* Get the number of monitors connected and their connection type and system index
* @returns {[number, Object]} The number of monitors connected
**/
const getNumberIdentifiers = () => {

    let [success, stdout, stderr, exitCode] = GLib.spawn_command_line_sync('xrandr --listactivemonitors');
    //Expected output:
    // Monitors: 2
    //  0: +*eDP-1 2560/300x1600/190+816+2160  eDP-1
    //  1: +DP-8 3840/630x2160/360+0+0  DP-8

    if (success) {
        const output = new TextDecoder().decode(stdout);

        const reMonitorNum = new RegExp(/Monitors:\s(?<num>\d+)/, "gm");
        const matchMonitorN = reMonitorNum.exec(output);

        const reConnDetails = new RegExp(/(?<idx>\d+):.*\s(?<conn>\w+-\d+)$/, 'gm');
        const matchConnDetails = output.matchAll(reConnDetails);

        return [parseInt(matchMonitorN.groups['num'], 10), Array.from(matchConnDetails).reduce((prev, currMatch) => {
            const key = currMatch.groups['conn'];
            const value = currMatch.groups['idx'];
            prev[key] = parseInt(value, 10);
            return prev;
        }, {})]
    } else {
        console.error(`Error #${exitCode} in xrandr command.`);
        console.error(new TextDecoder.decode(stderr));
        return [0, {}]
    }
}



Gtk.init();
const display = Gdk.Display.get_default();
const monitors = display.get_monitors();

const randrDetails = getNumberIdentifiers();
const numberOfMonitors = monitors.get_n_items();
const details = [];
for (let idx = 0; idx < numberOfMonitors; idx++) {
    const m = monitors.get_item(idx);
    const { x, y, width, height } = m.get_geometry();

    const connector = m.get_connector();
    console.debug('connector:', connector, 'randrDetails:', JSON.stringify(randrDetails[1]));
    const index = numberOfMonitors === randrDetails[0] ? randrDetails[1][connector] : null;

    details.push({ name: m.get_description(), x, y, width, height, index });
}

print(JSON.stringify(details));
