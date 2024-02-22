import {logger} from "@/utils/shell";
import GLib from "@gi-types/glib2";
import { TileGroup } from "@/components/tileGroup";
import { LAYOUT_HORIZONTAL_TYPE, Layout } from "./Layout";

const debug = logger('LayoutsUtils');

export class LayoutsUtils {
    private static get configPath() {
        return GLib.build_pathv('/', [GLib.get_user_config_dir(), 'ModernWindowManager']);
    }

    private static get layoutsPath() {
        return GLib.build_filenamev([this.configPath, 'layouts.json']);
    }

    public static LoadLayouts(): TileGroup {
        const filePath = this.layoutsPath;
        if(!GLib.file_test(filePath, GLib.FileTest.EXISTS)) return this._getDefaultLayout();

        try {
            let [ok, contents] = GLib.file_get_contents(filePath);
            if (!ok) return new TileGroup({});
            
            const decoder = new TextDecoder('utf-8');
            let contentsString = decoder.decode(contents);
            const parsed = JSON.parse(contentsString);
            const layouts = parsed.definitions as Layout[];
            return this._layoutToTileGroup(layouts[0]);
        } catch (exception) {
            debug(`exception loading layout: ${JSON.stringify(exception)}`);
        }

        return this._getDefaultLayout();
    }

    private static _layoutToTileGroup(layout: Layout) : TileGroup {
        return new TileGroup({
            perc: layout.length / 100,
            horizontal: layout.type === LAYOUT_HORIZONTAL_TYPE,
            tiles: layout.items ? layout.items.map(LayoutsUtils._layoutToTileGroup):[],
        });
    }

    private static _getDefaultLayout(): TileGroup {
        return new TileGroup({
            tiles: [
                new TileGroup({ perc: 0.22, horizontal: false, tiles: [
                    new TileGroup({ perc: 0.5 }),
                    new TileGroup({ perc: 0.5 })
                ] }),
                new TileGroup({ perc: 0.56 }),
                new TileGroup({ perc: 0.22, horizontal: false, tiles: [
                    new TileGroup({ perc: 0.5 }),
                    new TileGroup({ perc: 0.5 })
                ] }),
            ],
        });
    }
}