import { buildRectangle } from '@utils/ui';
import { Mtk, Meta } from '@gi';

export default class TouchPointer {
    private static _instance: TouchPointer | null = null;

    private _x: number;
    private _y: number;
    private _windowPos: Mtk.Rectangle;

    private constructor() {
        this._x = -1;
        this._y = -1;
        this._windowPos = buildRectangle();
    }

    public static get(): TouchPointer {
        if (!this._instance) this._instance = new TouchPointer();

        return this._instance;
    }

    public isTouchDeviceActive(): boolean {
        return (
            this._x !== -1 &&
            this._y !== -1 &&
            this._windowPos.x !== -1 &&
            this._windowPos.y !== -1
        );
    }

    public onTouchEvent(x: number, y: number) {
        this._x = x;
        this._y = y;
    }

    public updateWindowPosition(newSize: Mtk.Rectangle) {
        this._windowPos.x = newSize.x;
        this._windowPos.y = newSize.y;
    }

    public reset() {
        this._x = -1;
        this._y = -1;
        this._windowPos.x = -1;
        this._windowPos.y = -1;
    }

    public get_pointer(window: Meta.Window): [number, number, number] {
        const currPos = window.get_frame_rect();
        this._x += currPos.x - this._windowPos.x;
        this._y += currPos.y - this._windowPos.y;
        this._windowPos.x = currPos.x;
        this._windowPos.y = currPos.y;
        return [this._x, this._y, global.get_pointer()[2]];
    }
}
