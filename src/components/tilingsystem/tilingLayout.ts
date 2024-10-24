import Meta from 'gi://Meta';
import { registerGObjectClass } from '@/utils/gjs';
import Mtk from 'gi://Mtk';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import TilePreview, {
    TilePreviewConstructorProperties,
} from '../tilepreview/tilePreview';
import LayoutWidget from '../layout/LayoutWidget';
import Layout from '../layout/Layout';
import Tile from '../layout/Tile';
import {
    buildRectangle,
    buildTileGaps,
    isPointInsideRect,
    squaredEuclideanDistance,
} from '@utils/ui';
import TileUtils from '@components/layout/TileUtils';
import { logger } from '@utils/shell';
import GlobalState from '@utils/globalState';
import { KeyBindingsDirection } from '@keybindings';

const debug = logger('TilingLayout');

export interface DynamicTilePreviewConstructorProperties
    extends Partial<TilePreviewConstructorProperties> {
    tile: Tile;
}

@registerGObjectClass
class DynamicTilePreview extends TilePreview {
    private _originalRect: Mtk.Rectangle;
    private _canRestore: boolean;
    private _tile: Tile;

    constructor(
        params: DynamicTilePreviewConstructorProperties,
        canRestore?: boolean,
    ) {
        super(params);
        this._canRestore = canRestore || false;
        this._originalRect = this.rect.copy();
        this._tile = params.tile;
    }

    public get originalRect(): Mtk.Rectangle {
        return this._originalRect;
    }

    public get canRestore(): boolean {
        return this._canRestore;
    }

    public get tile(): Tile {
        return this._tile;
    }

    public restore(ease: boolean = false): boolean {
        if (!this._canRestore) return false;

        this._rect = this._originalRect.copy();
        if (this.showing) this.open(ease);

        return true;
    }
}

/**
 * A TilingLayout is a group of multiple tile previews. By aggregating all of them,
 * it is possible to easily show and hide each tile at the same time and to get the
 * hovered tile.
 */
@registerGObjectClass
export default class TilingLayout extends LayoutWidget<DynamicTilePreview> {
    private _showing: boolean;

    constructor(
        layout: Layout,
        innerGaps: Clutter.Margin,
        outerGaps: Clutter.Margin,
        workarea: Mtk.Rectangle,
        scalingFactor?: number,
    ) {
        super({
            containerRect: workarea,
            parent: global.windowGroup,
            layout,
            innerGaps,
            outerGaps,
            scalingFactor,
        });
        this._showing = false;
        super.relayout();
    }

    _init() {
        super._init();
        this.hide();
    }

    protected buildTile(
        parent: Clutter.Actor,
        rect: Mtk.Rectangle,
        gaps: Clutter.Margin,
        tile: Tile,
    ): DynamicTilePreview {
        return new DynamicTilePreview({ parent, rect, gaps, tile }, true);
    }

    public get showing(): boolean {
        return this._showing;
    }

    public openBelow(window: Meta.Window) {
        if (this._showing) return;

        const windowActor = window.get_compositor_private() as Clutter.Actor;
        if (!windowActor) return;

        global.windowGroup.set_child_below_sibling(this, windowActor);
        this.open();
    }

    public openAbove(window: Meta.Window) {
        if (this._showing) return;

        const windowActor = window.get_compositor_private() as Clutter.Actor;
        if (!windowActor) return;

        global.windowGroup.set_child_above_sibling(this, windowActor);
        this.open();
    }

    public open(ease: boolean = false) {
        if (this._showing) return;

        this.show();
        this._showing = true;

        this.ease({
            x: this.x,
            y: this.y,
            opacity: 255,
            duration: ease ? GlobalState.get().tilePreviewAnimationTime : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    public close(ease: boolean = false) {
        if (!this._showing) return;

        this._showing = false;

        this.ease({
            opacity: 0,
            duration: ease ? GlobalState.get().tilePreviewAnimationTime : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.unhoverAllTiles();
                this.hide();
            },
        });
    }

    private _isHovered(
        currPointerPos: { x: number; y: number },
        preview: Mtk.Rectangle,
    ): boolean {
        return (
            currPointerPos.x >= preview.x &&
            currPointerPos.x <= preview.x + preview.width &&
            currPointerPos.y >= preview.y &&
            currPointerPos.y <= preview.y + preview.height
        );
    }

    public getTileBelow(
        currPointerPos: { x: number; y: number },
        reset: boolean,
    ): Mtk.Rectangle | undefined {
        let found = this._previews.find((preview) =>
            this._isHovered(currPointerPos, preview.rect),
        );
        if (!found || (!found.canRestore && reset)) {
            found = this._previews.find(
                (preview) =>
                    preview.canRestore &&
                    this._isHovered(currPointerPos, preview.originalRect),
            );
        }
        if (!found) return undefined;

        if (reset && found.originalRect) return found.originalRect;
        return found.rect;
    }

    public unhoverAllTiles() {
        const newPreviewsArray: DynamicTilePreview[] = [];
        this._previews.forEach((preview) => {
            if (preview.restore(true)) {
                newPreviewsArray.push(preview);
                preview.open(true);
            } else {
                this.remove_child(preview);
                preview.destroy();
            }
        });
        this._previews = newPreviewsArray;
    }

    public hoverTilesInRect(rect: Mtk.Rectangle, reset: boolean) {
        const newPreviewsArray: DynamicTilePreview[] = [];

        this._previews.forEach((preview) => {
            const [hasIntersection, rectangles] = this._subtractRectangles(
                preview.rect,
                rect,
            );
            if (hasIntersection) {
                if (rectangles.length > 0) {
                    let maxIndex = 0;
                    for (let i = 0; i < rectangles.length; i++) {
                        if (rectangles[i].area() > rectangles[maxIndex].area())
                            maxIndex = i;
                    }
                    for (let i = 0; i < rectangles.length; i++) {
                        if (i === maxIndex) continue;

                        const currRect = rectangles[i];
                        const gaps = buildTileGaps(
                            currRect,
                            this._innerGaps,
                            this._outerGaps,
                            this._containerRect,
                        );
                        const innerPreview = new DynamicTilePreview(
                            {
                                parent: this,
                                rect: currRect,
                                gaps,
                                tile: TileUtils.build_tile(
                                    currRect,
                                    this._containerRect,
                                ),
                            },
                            false,
                        );
                        innerPreview.open();
                        this.set_child_above_sibling(innerPreview, preview);
                        newPreviewsArray.push(innerPreview);
                    }
                    preview.open(
                        false,
                        rectangles[maxIndex].union(
                            preview.rect.intersect(rect)[1],
                        ),
                    );
                    preview.open(true, rectangles[maxIndex]);
                    newPreviewsArray.push(preview);
                } else {
                    preview.close();
                    newPreviewsArray.push(preview);
                }
            } else if (reset /* && !preview.originalRect.intersect(rect)[0]*/) {
                if (preview.restore(true)) {
                    preview.open(true);
                    newPreviewsArray.push(preview);
                } else {
                    this.remove_child(preview);
                    preview.destroy();
                }
            } else {
                preview.open(true);
                newPreviewsArray.push(preview);
            }
        });

        this._previews = newPreviewsArray;
    }

    /*
        Given the source rectangle (made by A, B, C, D and Hole), subtract the hole and obtain A, B, C and D.
        Edge cases:
            - The hole may not be inside the source rect (i.e there is no interstaction).
            It returns false and an array with the source rectangle only
            - The hole intersects the source rectangle, it returns true and an array with A, B, C and D rectangles.
            Some of A, B, C and D may not be returned if they don't exist
            - The hole is equal to the source rectangle, it returns true and an empty array since A, B, C and D
            rectangles do not exist

        Example:
        -------------------------
        |          A            |
        |-----------------------|
        |  B  |   hole    |  C  |
        |-----------------------|
        |          D            |
        -------------------------
    */
    private _subtractRectangles(
        sourceRect: Mtk.Rectangle,
        holeRect: Mtk.Rectangle,
    ): [boolean, Mtk.Rectangle[]] {
        const [hasIntersection, intersection] = sourceRect.intersect(holeRect);

        if (!hasIntersection) return [false, [sourceRect]];

        if (intersection.area() >= sourceRect.area() * 0.98) return [true, []];

        const results: Mtk.Rectangle[] = [];

        // A
        const heightA = intersection.y - sourceRect.y;
        if (heightA > 0) {
            results.push(
                buildRectangle({
                    x: sourceRect.x,
                    y: sourceRect.y,
                    width: sourceRect.width,
                    height: heightA,
                }),
            );
        }

        // B
        const widthB = intersection.x - sourceRect.x;
        if (widthB > 0 && intersection.height > 0) {
            results.push(
                buildRectangle({
                    x: sourceRect.x,
                    y: intersection.y,
                    width: widthB,
                    height: intersection.height,
                }),
            );
        }

        // C
        const widthC =
            sourceRect.x +
            sourceRect.width -
            intersection.x -
            intersection.width;
        if (widthC > 0 && intersection.height > 0) {
            results.push(
                buildRectangle({
                    x: intersection.x + intersection.width,
                    y: intersection.y,
                    width: widthC,
                    height: intersection.height,
                }),
            );
        }

        // D
        const heightD =
            sourceRect.y +
            sourceRect.height -
            intersection.y -
            intersection.height;
        if (heightD > 0) {
            results.push(
                buildRectangle({
                    x: sourceRect.x,
                    y: intersection.y + intersection.height,
                    width: sourceRect.width,
                    height: heightD,
                }),
            );
        }

        return [true, results];
    }

    public findNearestTile(
        source: Mtk.Rectangle,
    ): { rect: Mtk.Rectangle; tile: Tile } | undefined {
        const sourceCoords = {
            x: source.x + source.width / 2,
            y: source.y + source.height / 2,
        };

        // uncomment to show debugging
        /* global.windowGroup
            .get_children()
            .filter((c) => c.get_name() === 'debug-kb')[0]
            ?.destroy();
        const debugWidget = new St.Widget({
            x: sourceCoords.x - 8,
            y: sourceCoords.y - 8,
            height: 16,
            width: 16,
            style: 'border: 2px solid red; border-radius: 8px;',
            name: 'debug-kb',
        });
        global.windowGroup.add_child(debugWidget);*/

        for (let i = 0; i < this._previews.length; i++) {
            const previewFound = this._previews[i];
            if (isPointInsideRect(sourceCoords, previewFound.rect)) {
                return {
                    rect: buildRectangle({
                        x: previewFound.innerX,
                        y: previewFound.innerY,
                        width: previewFound.innerWidth,
                        height: previewFound.innerHeight,
                    }),
                    tile: previewFound.tile,
                };
            }
        }

        return undefined;
    }

    public findNearestTileDirection(
        source: Mtk.Rectangle,
        direction: KeyBindingsDirection,
    ): { rect: Mtk.Rectangle; tile: Tile } | undefined {
        if (direction === KeyBindingsDirection.CENTER) return undefined;

        const sourceCoords = {
            x: source.x + source.width / 2,
            y: source.y + source.height / 2,
        };

        // enlarge the side of the direction and search a tile that contains that point
        const enlarge = 64;

        switch (direction) {
            case KeyBindingsDirection.RIGHT:
                sourceCoords.x = source.x + source.width + enlarge;
                break;
            case KeyBindingsDirection.LEFT:
                sourceCoords.x = source.x - enlarge;
                break;
            case KeyBindingsDirection.DOWN:
                sourceCoords.y = source.y + source.height + enlarge;
                break;
            case KeyBindingsDirection.UP:
                sourceCoords.y = source.y - enlarge;
                break;
        }

        // uncomment to show debugging
        /* global.windowGroup
            .get_children()
            .filter((c) => c.get_name() === 'debug-kb')[0]
            ?.destroy();
        const debugWidget = new St.Widget({
            x: sourceCoords.x - 8,
            y: sourceCoords.y - 8,
            height: 16,
            width: 16,
            style: 'border: 2px solid red; border-radius: 8px;',
            name: 'debug-kb',
        });
        global.windowGroup.add_child(debugWidget);*/

        for (let i = 0; i < this._previews.length; i++) {
            const previewFound = this._previews[i];
            if (isPointInsideRect(sourceCoords, previewFound.rect)) {
                return {
                    rect: buildRectangle({
                        x: previewFound.innerX,
                        y: previewFound.innerY,
                        width: previewFound.innerWidth,
                        height: previewFound.innerHeight,
                    }),
                    tile: previewFound.tile,
                };
            }
        }

        return undefined;
    }

    public getRightmostTile(): { rect: Mtk.Rectangle; tile: Tile } {
        let previewFound: DynamicTilePreview = this._previews[0];

        for (let i = 1; i < this._previews.length; i++) {
            const preview = this._previews[i];
            if (preview.x + preview.width < previewFound.x + previewFound.width)
                continue;

            if (preview.x + preview.width > previewFound.x + previewFound.width)
                previewFound = preview;
            else if (preview.y < previewFound.y) previewFound = preview;
        }

        return {
            rect: buildRectangle({
                x: previewFound.innerX,
                y: previewFound.innerY,
                width: previewFound.innerWidth,
                height: previewFound.innerHeight,
            }),
            tile: previewFound.tile,
        };
    }

    public getLeftmostTile(): { rect: Mtk.Rectangle; tile: Tile } {
        let previewFound: DynamicTilePreview = this._previews[0];

        for (let i = 1; i < this._previews.length; i++) {
            const preview = this._previews[i];
            if (preview.x > previewFound.x) continue;

            if (preview.x < previewFound.x) previewFound = preview;
            else if (preview.y < previewFound.y) previewFound = preview;
        }

        return {
            rect: buildRectangle({
                x: previewFound.innerX,
                y: previewFound.innerY,
                width: previewFound.innerWidth,
                height: previewFound.innerHeight,
            }),
            tile: previewFound.tile,
        };
    }
}
