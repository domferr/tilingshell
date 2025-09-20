import { registerGObjectClass } from '@/utils/gjs';
import { GObject, St, Clutter, Mtk, Meta, Gio } from '@gi.ext';
import SnapAssistTile from './snapAssistTile';
import SnapAssistLayout from './snapAssistLayout';
import Layout from '../layout/Layout';
import Tile from '../layout/Tile';
import Settings from '@settings/settings';
import GlobalState from '@utils/globalState';
import SignalHandling from '@utils/signalHandling';
import {
    buildMarginOf,
    enableScalingFactorSupport,
    getMonitorScalingFactor,
    getScalingFactorOf,
} from '@utils/ui';
import { logger } from '@utils/logger';
import { buildBlurEffect } from '@utils/gnomesupport';

export const SNAP_ASSIST_SIGNAL = 'snap-assist';

const GAPS = 4;
// 16:9 ratio and then rounded to int
const SNAP_ASSIST_LAYOUT_WIDTH = 120;
const SNAP_ASSIST_LAYOUT_HEIGHT = 68;

const debug = logger('SnapAssist');

@registerGObjectClass
class SnapAssistContent extends St.BoxLayout {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'SnapAssistContent',
        Properties: {
            blur: GObject.ParamSpec.boolean(
                'blur',
                'blur',
                'Enable or disable the blur effect',
                GObject.ParamFlags.READWRITE,
                false,
            ),
            snapAssistantThreshold: GObject.ParamSpec.uint(
                'snapAssistantThreshold',
                'snapAssistantThreshold',
                'Distance from the snap assistant to trigger its opening/closing',
                GObject.ParamFlags.READWRITE,
                0,
                2000,
                16,
            ),
            snapAssistantAnimationTime: GObject.ParamSpec.uint(
                'snapAssistantAnimationTime',
                'snapAssistantAnimationTime',
                'Animation time in milliseconds',
                GObject.ParamFlags.READWRITE,
                0,
                2000,
                180,
            ),
        },
    };

    private readonly _container: St.Widget;

    private _showing: boolean;
    private _signals: SignalHandling;
    private _snapAssistLayouts: SnapAssistLayout[];
    private _isEnlarged = false;
    private _hoveredInfo: [SnapAssistTile, SnapAssistLayout] | undefined;
    private _padding: number;
    private _blur: boolean;
    private _snapAssistantThreshold: number;
    private _snapAssistantAnimationTime: number;
    private _monitorIndex: number;

    constructor(container: St.Widget, monitorIndex: number) {
        super({
            name: 'snap_assist_content',
            xAlign: Clutter.ActorAlign.CENTER,
            yAlign: Clutter.ActorAlign.CENTER,
            reactive: true,
            styleClass: 'popup-menu-content snap-assistant',
        });
        this._container = container;
        this._container.add_child(this);

        this._signals = new SignalHandling();
        this._snapAssistLayouts = [];
        this._isEnlarged = false;
        this._showing = true;
        this._padding = 0;
        this._blur = false;
        this._snapAssistantAnimationTime = 100;
        this._monitorIndex = monitorIndex;
        this._snapAssistantThreshold =
            54 * getMonitorScalingFactor(this._monitorIndex);

        Settings.bind(
            Settings.KEY_ENABLE_BLUR_SNAP_ASSISTANT,
            this,
            'blur',
            Gio.SettingsBindFlags.GET,
        );
        Settings.bind(
            Settings.KEY_SNAP_ASSISTANT_THRESHOLD,
            this,
            'snapAssistantThreshold',
            Gio.SettingsBindFlags.GET,
        );
        Settings.bind(
            Settings.KEY_SNAP_ASSISTANT_ANIMATION_TIME,
            this,
            'snapAssistantAnimationTime',
            Gio.SettingsBindFlags.GET,
        );

        this._applyStyle();
        this._signals.connect(
            St.ThemeContext.get_for_stage(global.get_stage()),
            'changed',
            () => {
                this._applyStyle();
            },
        );

        this._setLayouts(GlobalState.get().layouts);
        this._signals.connect(
            GlobalState.get(),
            GlobalState.SIGNAL_LAYOUTS_CHANGED,
            () => {
                this._setLayouts(GlobalState.get().layouts);
            },
        );

        this.connect('destroy', () => this._signals.disconnect());

        this.close();
    }

    private set blur(value: boolean) {
        if (this._blur === value) return;

        this._blur = value;
        this.get_effect('blur')?.set_enabled(value);
        this._applyStyle();
    }

    private set snapAssistantThreshold(value: number) {
        this._snapAssistantThreshold =
            value * getMonitorScalingFactor(this._monitorIndex);
    }

    private set snapAssistantAnimationTime(value: number) {
        this._snapAssistantAnimationTime = value;
    }

    get showing(): boolean {
        return this._showing;
    }

    _init() {
        super._init();

        const effect = buildBlurEffect(36);
        effect.set_name('blur');
        effect.set_enabled(this._blur);
        this.add_effect(effect);

        this.add_style_class_name('popup-menu-content snap-assistant');
    }

    private _applyStyle() {
        this.set_style(null);

        const [alreadyScaled, finalScalingFactor] = getScalingFactorOf(this);
        this._padding =
            (alreadyScaled ? 1 : finalScalingFactor) *
            (this.get_theme_node().get_length('padding-value') /
                (alreadyScaled ? finalScalingFactor : 1));

        const backgroundColor = this.get_theme_node()
            .get_background_color()
            .copy();
        const alpha = this._blur ? 0.7 : backgroundColor.alpha;
        this.set_style(`
            padding: ${this._padding}px;
            background-color: rgba(${backgroundColor.red}, ${backgroundColor.green}, ${backgroundColor.blue}, ${alpha}) !important;
        `);
    }

    public close(ease: boolean = false) {
        if (!this._showing) return;

        this._showing = false;
        this._isEnlarged = false;
        this.set_x(this._container.width / 2 - this.width / 2);

        this.ease({
            y: this._desiredY,
            opacity: 0,
            duration: ease ? this._snapAssistantAnimationTime : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.hide();
            },
        });
    }

    private get _desiredY(): number {
        return this._isEnlarged
            ? Math.max(
                  0,
                  this._snapAssistantThreshold -
                      this.height / 2 +
                      this._padding,
              )
            : -this.height + this._padding;
    }

    private open(ease: boolean = false) {
        // if it is the first time showing the snap assistant
        // then ensure the snap assistant is the topmost widget
        if (!this._showing)
            this.get_parent()?.set_child_above_sibling(this, null);

        this.set_x(this._container.width / 2 - this.width / 2);
        this.show();

        this._showing = true;
        this.ease({
            y: this._desiredY,
            opacity: 255,
            duration: ease ? this._snapAssistantAnimationTime : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    private _setLayouts(layouts: Layout[]) {
        this._snapAssistLayouts.forEach((lay) => lay.destroy());
        this.remove_all_children();

        const [, scalingFactor] = getScalingFactorOf(this);

        const layoutGaps = buildMarginOf(GAPS);

        const width = SNAP_ASSIST_LAYOUT_WIDTH * scalingFactor;
        const height = SNAP_ASSIST_LAYOUT_HEIGHT * scalingFactor;
        // build the layouts inside the snap assistant. Place a spacer between each layout
        this._snapAssistLayouts = layouts.map((lay, ind) => {
            const saLay = new SnapAssistLayout(
                this,
                lay,
                layoutGaps,
                new Clutter.Margin(),
                width,
                height,
            );
            // build and place a spacer
            if (ind < layouts.length - 1) {
                this.add_child(
                    new St.Widget({ width: this._padding, height: 1 }),
                );
            }
            return saLay;
        });
        this.ensure_style();
        this.set_x(this._container.width / 2 - this.width / 2);
    }

    public onMovingWindow(
        window: Meta.Window,
        ease: boolean = false,
        currPointerPos: { x: number; y: number },
    ) {
        const wasEnlarged = this._isEnlarged;
        this.handleOpening(window, ease, currPointerPos);
        if (!this._showing || !this._isEnlarged) {
            if (this._hoveredInfo) this._hoveredInfo[0].set_hover(false);

            this._hoveredInfo = undefined;
            if (wasEnlarged) {
                this._container.emit(
                    SNAP_ASSIST_SIGNAL,
                    new Tile({ x: 0, y: 0, width: 0, height: 0, groups: [] }),
                    '',
                );
            }
            return;
        }

        const layoutHovered = this.handleTileHovering(currPointerPos);
        if (layoutHovered) {
            const snapTile = this._hoveredInfo
                ? this._hoveredInfo[0]
                : undefined;
            const snapLay = this._hoveredInfo
                ? this._hoveredInfo[1]
                : undefined;
            const tile =
                snapTile?.tile ||
                new Tile({ x: 0, y: 0, width: 0, height: 0, groups: [] });
            const layoutId = snapLay?.layout.id ?? '';
            this._container.emit(SNAP_ASSIST_SIGNAL, tile, layoutId);
        }
    }

    private handleOpening(
        window: Meta.Window,
        ease: boolean = false,
        currPointerPos: { x: number; y: number },
    ) {
        if (!this._showing) {
            if (this.get_parent() === global.windowGroup) {
                const windowActor =
                    window.get_compositor_private() as Clutter.Actor;
                if (!windowActor) return;
                global.windowGroup.set_child_above_sibling(this, windowActor);
            }
        }

        const height =
            this.height + (this._isEnlarged ? 0 : this._snapAssistantThreshold);
        const minY = this._container.y;
        const maxY = this._container.y + this._desiredY + height;
        const minX = this._container.x + this.x - this._snapAssistantThreshold;
        const maxX =
            this._container.x +
            this.x +
            this.width +
            this._snapAssistantThreshold;

        const isNear =
            this.isBetween(minX, currPointerPos.x, maxX) &&
            this.isBetween(minY, currPointerPos.y, maxY);

        // uncomment to show activation area debugging
        /* global.windowGroup
            .get_children()
            .filter((c) => c.get_name() === 'debug')[0]
            ?.destroy();
        const debug = new St.Widget({
            x: minX,
            y: minY,
            height: maxY - minY,
            width: maxX - minX,
            style: 'border: 2px solid red; border-radius: 8px;',
            name: 'debug',
        });
        global.windowGroup.add_child(debug); */

        if (this._showing && this._isEnlarged === isNear) return;

        this._isEnlarged = isNear;
        this.open(ease);
    }

    private handleTileHovering(cursorPos: { x: number; y: number }): boolean {
        if (!this._isEnlarged) {
            const changed = this._hoveredInfo !== undefined;
            if (this._hoveredInfo) this._hoveredInfo[0].set_hover(false);

            this._hoveredInfo = undefined;
            return changed;
        }

        let newTileHovered: SnapAssistTile | undefined;
        let layoutHovered: SnapAssistLayout | undefined;
        const layoutsLen = this._snapAssistLayouts.length;
        for (let index = 0; index < layoutsLen; index++) {
            newTileHovered =
                this._snapAssistLayouts[index].getTileBelow(cursorPos);
            if (newTileHovered) {
                layoutHovered = this._snapAssistLayouts[index];
                break;
            }
        }

        const oldTile = this._hoveredInfo ? this._hoveredInfo[0] : undefined;
        const tileChanged = newTileHovered !== oldTile;
        if (tileChanged) {
            oldTile?.set_hover(false);
            if (newTileHovered === undefined || layoutHovered === undefined)
                this._hoveredInfo = undefined;
            else this._hoveredInfo = [newTileHovered, layoutHovered];
        }
        if (this._hoveredInfo) this._hoveredInfo[0].set_hover(true);

        return tileChanged;
    }

    private isBetween(min: number, num: number, max: number): boolean {
        return min <= num && num <= max;
    }
}

@registerGObjectClass
export default class SnapAssist extends St.Widget {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'SnapAssist',
        Signals: {
            'snap-assist': {
                param_types: [Tile.$gtype, String.$gtype], // tile, layout_id
            },
        },
    };

    private readonly _content: SnapAssistContent;

    constructor(
        parent: Clutter.Actor,
        workArea: Mtk.Rectangle,
        monitorIndex: number,
        scalingFactor?: number,
    ) {
        super();
        parent.add_child(this);
        this.workArea = workArea;
        this.set_clip(0, 0, workArea.width, workArea.height);
        if (scalingFactor) enableScalingFactorSupport(this, scalingFactor);

        this._content = new SnapAssistContent(this, monitorIndex);
    }

    public set workArea(newWorkArea: Mtk.Rectangle) {
        this.set_position(newWorkArea.x, newWorkArea.y);
        this.set_width(newWorkArea.width);
        this.set_clip(0, 0, newWorkArea.width, newWorkArea.height);
    }

    public onMovingWindow(
        window: Meta.Window,
        ease: boolean = false,
        currPointerPos: { x: number; y: number },
    ) {
        this._content.onMovingWindow(window, ease, currPointerPos);
    }

    public close(ease: boolean = false) {
        this._content.close(ease);
    }
}
