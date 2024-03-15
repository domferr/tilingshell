import {logger} from "@/utils/shell";
import GLib from "@gi-types/glib2";
import { Layout } from "./Layout";
import { Tile } from "./Tile";

const debug = logger('LayoutsUtils');

export class LayoutsUtils {
    private static get configPath() {
        return GLib.build_pathv('/', [GLib.get_user_config_dir(), 'ModernWindowManager']);
    }

    private static get layoutsPath() {
        return GLib.build_filenamev([this.configPath, 'layouts.json']);
    }

    public static LoadLayouts(): Layout[] {
        const availableLayouts = [
            new Layout([]),
            new Layout([
                new Tile({ x:0, y:0, height: 1, width: 0.22 }),
                new Tile({ x:0.22, y:0, height: 1, width: 0.56 }),
                new Tile({ x:0.78, y:0, height: 1, width: 0.22 }),
            ]),
            new Layout([
                new Tile({ x:0, y:0, height: 1, width: 0.33 }),
                new Tile({ x:0.33, y:0, height: 1, width: 0.67 }),
            ]),
            new Layout([
                new Tile({ x:0.33, y:0, height: 1, width: 0.67 }),
                new Tile({ x:0, y:0, height: 1, width: 0.33 }),
            ]),
        ];
        const filePath = this.layoutsPath;
        if (GLib.file_test(filePath, GLib.FileTest.EXISTS)) {
            try {
                let [ok, contents] = GLib.file_get_contents(filePath);
                if (ok) {
                    const decoder = new TextDecoder('utf-8');
                    let contentsString = decoder.decode(contents);
                    const parsed = JSON.parse(contentsString);
                    return parsed.definitions as Layout[];
                }
            } catch (exception) {
                debug(`exception loading layouts: ${JSON.stringify(exception)}`);
            }
        }
        availableLayouts[0] = this._getDefaultLayout();
        return availableLayouts; 
    }

    private static _getDefaultLayout(): Layout {
        return new Layout([
            new Tile({ x:0, y:0, height: 0.5, width: 0.22 }), // top-left
            new Tile({ x:0, y:0.5, height: 0.5, width: 0.22 }), // bottom-left
            new Tile({ x:0.22, y:0, height: 1, width: 0.56 }), // center
            new Tile({ x:0.78, y:0, height: 0.5, width: 0.22 }), // top-right
            new Tile({ x:0.78, y:0.5, height: 0.5, width: 0.22 }), // bottom-right
        ]);
    }
}