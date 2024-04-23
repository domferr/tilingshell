import { registerGObjectClass } from "@/utils/gjs";
import { buildRectangle, getGlobalPosition } from "@/utils/ui";
import { logger } from "@/utils/shell";
import Clutter from 'gi://Clutter';
import Mtk from "gi://Mtk";
import LayoutWidget from "../layout/LayoutWidget";
import Layout from "../layout/Layout";
import Tile from "../layout/Tile";
import SnapAssistTile from "./snapAssistTile";

const debug = logger("snapAssistLayout");

@registerGObjectClass
export default class SnapAssistLayout extends LayoutWidget<SnapAssistTile> {
    private static readonly _snapAssistHeight: number = 68;
    private static readonly _snapAssistWidth: number = 120; // 16:9 ratio. -> (16*this._snapAssistHeight) / 9 and then rounded to int

    constructor(parent: Clutter.Actor | null, layout: Layout, gaps: Clutter.Margin, scaleFactor: number) {
        const rect = buildRectangle({
            x: 0, 
            y: 0, 
            width: SnapAssistLayout._snapAssistWidth * scaleFactor, 
            height: SnapAssistLayout._snapAssistHeight * scaleFactor
        });
        gaps = gaps.copy();
        gaps.top *= scaleFactor;
        gaps.bottom *= scaleFactor;
        gaps.left *= scaleFactor;
        gaps.right *= scaleFactor;
        super(parent, layout, gaps, new Clutter.Margin(), rect, "snap-assist-layout");
    }

    buildTile(parent: Clutter.Actor, rect: Mtk.Rectangle, gaps: Clutter.Margin, tile: Tile): SnapAssistTile {
        return new SnapAssistTile({ parent, rect, gaps, tile });
    }

    public getTileBelow(cursorPos: {x: number, y: number}) : SnapAssistTile | undefined {
        const globalPos = getGlobalPosition(this);
        
        for (let i = 0; i < this._previews.length; i++) {
            let preview = this._previews[i];
            const pos = {x: globalPos.x + preview.rect.x, y: globalPos.y + preview.rect.y};

            const isHovering = cursorPos.x >= pos.x && cursorPos.x <= pos.x + preview.rect.width
                && cursorPos.y >= pos.y && cursorPos.y <= pos.y + preview.rect.height;
            if (isHovering) return preview;
        }
    }
}