import {
    buildRectangle,
    isPointInsideRect,
    clampPointInsideRect,
} from '@utils/ui';
import { GObject, Mtk, St } from '@gi.ext';
import Settings from '@settings/settings';
import { registerGObjectClass } from '@utils/gjs';
import { logger } from '@utils/logger';

const TOP_EDGE_TILING_OFFSET = 8;
const QUARTER_PERCENTAGE = 0.5;

@registerGObjectClass
export default class EdgeTilingManager extends GObject.Object {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'EdgeTilingManager',
        Properties: {
            quarterActivationPercentage: GObject.ParamSpec.uint(
                'quarterActivationPercentage',
                'quarterActivationPercentage',
                'Threshold to trigger quarter tiling',
                GObject.ParamFlags.READWRITE,
                1,
                50,
                40,
            ),
            edgeTilingOffset: GObject.ParamSpec.uint(
                'edgeTilingOffset',
                'edgeTilingOffset',
                'Offset to trigger edge tiling',
                GObject.ParamFlags.READWRITE,
                1,
                250,
                16,
            ),
        },
    };
    private _workArea: Mtk.Rectangle;
    private _quarterActivationPercentage: number;
    private _edgeTilingOffset: number;

    // activation zones
    private _topLeft: Mtk.Rectangle;
    private _topRight: Mtk.Rectangle;
    private _bottomLeft: Mtk.Rectangle;
    private _bottomRight: Mtk.Rectangle;
    private _topCenter: Mtk.Rectangle;
    private _leftCenter: Mtk.Rectangle;
    private _rightCenter: Mtk.Rectangle;

    // current active zone
    private _activeEdgeTile: Mtk.Rectangle | null;

    constructor(initialWorkArea: Mtk.Rectangle) {
        super();
        this._workArea = buildRectangle();
        this._topLeft = buildRectangle();
        this._topRight = buildRectangle();
        this._bottomLeft = buildRectangle();
        this._bottomRight = buildRectangle();
        this._topCenter = buildRectangle();
        this._leftCenter = buildRectangle();
        this._rightCenter = buildRectangle();
        this._activeEdgeTile = null;
        this.workarea = initialWorkArea;
        this._quarterActivationPercentage = Settings.QUARTER_TILING_THRESHOLD;
        Settings.bind(
            Settings.KEY_QUARTER_TILING_THRESHOLD,
            this,
            'quarterActivationPercentage',
        );
        this._edgeTilingOffset = Settings.EDGE_TILING_OFFSET;
        Settings.bind(
            Settings.KEY_EDGE_TILING_OFFSET,
            this,
            'edgeTilingOffset',
        );
    }

    private set quarterActivationPercentage(value: number) {
        this._quarterActivationPercentage = value / 100;
        this._updateActivationZones();
    }

    private set edgeTilingOffset(value: number) {
        this._edgeTilingOffset = value;
    }

    public set workarea(newWorkArea: Mtk.Rectangle) {
        this._workArea.x = newWorkArea.x;
        this._workArea.y = newWorkArea.y;
        this._workArea.width = newWorkArea.width;
        this._workArea.height = newWorkArea.height;

        this._updateActivationZones();
    }

    private _updateActivationZones() {
        const width = Math.ceil(
            this._workArea.width * this._quarterActivationPercentage,
        );
        const height = Math.ceil(
            this._workArea.height * this._quarterActivationPercentage,
        );

        this._topLeft.x = this._workArea.x;
        this._topLeft.y = this._workArea.y;
        this._topLeft.width = width;
        this._topLeft.height = height;

        this._topRight.x =
            this._workArea.x + this._workArea.width - this._topLeft.width;
        this._topRight.y = this._topLeft.y;
        this._topRight.width = width;
        this._topRight.height = height;

        this._bottomLeft.x = this._workArea.x;
        this._bottomLeft.y = this._workArea.y + this._workArea.height - height;
        this._bottomLeft.width = width;
        this._bottomLeft.height = height;

        this._bottomRight.x = this._topRight.x;
        this._bottomRight.y = this._bottomLeft.y;
        this._bottomRight.width = width;
        this._bottomRight.height = height;

        this._topCenter.x = this._topLeft.x + this._topLeft.width;
        this._topCenter.y = this._topRight.y;
        this._topCenter.height = this._topRight.height;
        this._topCenter.width = this._topRight.x - this._topCenter.x;

        this._leftCenter.x = this._topLeft.x;
        this._leftCenter.y = this._topLeft.y + this._topLeft.height;
        this._leftCenter.height = this._bottomLeft.y - this._leftCenter.y;
        this._leftCenter.width = this._topLeft.width;

        this._rightCenter.x = this._topRight.x;
        this._rightCenter.y = this._topRight.y + this._topRight.height;
        this._rightCenter.height = this._bottomRight.y - this._rightCenter.y;
        this._rightCenter.width = this._topRight.width;
    }

    public canActivateEdgeTiling(pointerPos: {
        x: number;
        y: number;
    }): boolean {
        return (
            pointerPos.x <= this._workArea.x + this._edgeTilingOffset ||
            pointerPos.y <= this._workArea.y + TOP_EDGE_TILING_OFFSET ||
            pointerPos.x >=
                this._workArea.x + this._workArea.width - this._edgeTilingOffset ||
            pointerPos.y >=
                this._workArea.y + this._workArea.height - this._edgeTilingOffset
        );
    }

    public isPerformingEdgeTiling(): boolean {
        return this._activeEdgeTile !== null;
    }

    public startEdgeTiling(pointerPos: { x: number; y: number }): {
        changed: boolean;
        rect: Mtk.Rectangle;
    } {
        const { x, y } = clampPointInsideRect(pointerPos, this._workArea);
        const previewRect = buildRectangle();

        if (
            this._activeEdgeTile &&
            isPointInsideRect({ x, y }, this._activeEdgeTile)
        ) {
            return {
                changed: false,
                rect: previewRect,
            };
        }

        if (!this._activeEdgeTile) this._activeEdgeTile = buildRectangle();

        previewRect.width = this._workArea.width * QUARTER_PERCENTAGE;
        previewRect.height = this._workArea.height * QUARTER_PERCENTAGE;
        previewRect.y = this._workArea.y;
        previewRect.x = this._workArea.x;
        if (isPointInsideRect({ x, y }, this._topCenter)) {
            previewRect.width = this._workArea.width;
            previewRect.height = this._workArea.height;

            this._activeEdgeTile = this._topCenter;
            // center-left (full edge tile)
        } else if (isPointInsideRect({ x, y }, this._leftCenter)) {
            previewRect.width = this._workArea.width * QUARTER_PERCENTAGE;
            previewRect.height = this._workArea.height;

            this._activeEdgeTile = this._leftCenter;
            // center-right (full edge tile)
        } else if (isPointInsideRect({ x, y }, this._rightCenter)) {
            previewRect.x =
                this._workArea.x + this._workArea.width - previewRect.width;
            previewRect.width = this._workArea.width * QUARTER_PERCENTAGE;
            previewRect.height = this._workArea.height;

            this._activeEdgeTile = this._rightCenter;
            // left side
        } else if (x <= this._workArea.x + this._workArea.width / 2) {
            // top-left corner
            if (isPointInsideRect({ x, y }, this._topLeft)) {
                this._activeEdgeTile = this._topLeft;
                // bottom-left corner
            } else if (isPointInsideRect({ x, y }, this._bottomLeft)) {
                previewRect.y =
                    this._workArea.y +
                    this._workArea.height -
                    previewRect.height;
                this._activeEdgeTile = this._bottomLeft;
                // bottom-center
            } else {
                return {
                    changed: false,
                    rect: previewRect,
                };
            }
            // right side
        } else {
            previewRect.x =
                this._workArea.x + this._workArea.width - previewRect.width;
            // top-right corner
            if (isPointInsideRect({ x, y }, this._topRight)) {
                this._activeEdgeTile = this._topRight;
                // bottom-right corner
            } else if (isPointInsideRect({ x, y }, this._bottomRight)) {
                previewRect.y =
                    this._workArea.y +
                    this._workArea.height -
                    previewRect.height;
                this._activeEdgeTile = this._bottomRight;
                // bottom-center
            } else {
                return {
                    changed: false,
                    rect: previewRect,
                };
            }
        }

        // uncomment to show active tile debugging
        /* global.windowGroup.get_children().filter(c => c.get_name() === "debug")[0]?.destroy();
        const debug = new St.Widget({
            x: this._activeEdgeTile.x,
            y: this._activeEdgeTile.y,
            height: this._activeEdgeTile.height,
            width: this._activeEdgeTile.width,
            style: "border: 2px solid red",
            name: "debug"
        });
        global.windowGroup.add_child(debug);*/

        return {
            changed: true,
            rect: previewRect,
        };
    }

    public needMaximize(): boolean {
        return (
            this._activeEdgeTile !== null &&
            Settings.TOP_EDGE_MAXIMIZE &&
            this._activeEdgeTile === this._topCenter
        );
    }

    public abortEdgeTiling() {
        this._activeEdgeTile = null;
    }
}
