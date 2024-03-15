import { registerGObjectClass } from "@/utils/gjs";
import { Actor, Margin, AnimationMode } from '@gi-types/clutter10';
import { getGlobalPosition } from "@/utils/ui";
import { Rectangle } from "@gi-types/meta10";
import { LayoutWidget } from "../layout/LayoutWidget";
import { SnapAssistTile } from "./snapAssistTile";
import { logger } from "@/utils/shell";
import { Layout } from "../layout/Layout";
import { Tile } from "../layout/Tile";

const debug = logger("snapAssistLayout");

@registerGObjectClass
export class SnapAssistLayout extends LayoutWidget<SnapAssistTile> {
    private static readonly _snapAssistHeight: number = 84;
    private static readonly _snapAssistWidth: number = 150; // 16:9 ratio. -> (16*this._snapAssistHeight) / 9 and then rounded to int

    constructor(parent: Actor | null, layout: Layout, gaps: Margin, scaleFactor: number) {
        const rect = new Rectangle({height: SnapAssistLayout._snapAssistHeight * scaleFactor, width: SnapAssistLayout._snapAssistWidth * scaleFactor, x: 0, y: 0});
        gaps = new Margin({top: gaps.top * scaleFactor, bottom: gaps.bottom * scaleFactor, left: gaps.left * scaleFactor, right: gaps.right * scaleFactor});
        const outerMargin = Math.min(gaps.top, Math.min(gaps.bottom, Math.min(gaps.left, gaps.right))) * scaleFactor;
        super(parent, layout, gaps, new Margin({top: outerMargin, bottom: outerMargin, left: outerMargin, right: outerMargin }), rect, "snap-assist-layout");
        this.ensure_style();
    }

    buildTile(parent: Actor, rect: Rectangle, gaps: Margin, tile: Tile): SnapAssistTile {
        return new SnapAssistTile({parent, rect, gaps, tile});
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

    public hide() {
        this.set_height(0);
        this.set_opacity(0);
    }

    public show() {
        this.set_height(SnapAssistLayout._snapAssistHeight);
        this.set_opacity(255);
    }

    public easeHide(params: {duration: number, mode: AnimationMode}) {
        // @ts-ignore
        this.ease({
            height: 0,
            opacity: 0,
            duration: params.duration,
            mode: params.mode,
        })
    }

    public easeShow(params: {duration: number, mode: AnimationMode}) {
        this.show();
        // @ts-ignore
        this.ease({
            height: SnapAssistLayout._snapAssistHeight,
            opacity: 255,
            duration: params.duration,
            mode: params.mode,
        })
    }
}