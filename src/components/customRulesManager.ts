import { GObject, Meta } from '@gi.ext';
import SignalHandling from '@utils/signalHandling';
import { logger } from '@utils/logger';
import { registerGObjectClass } from '@utils/gjs';
import Settings from '@settings/settings';

const debug = logger('CustomRulesManager');

export interface CustomRulesByApp {
    name: string;
    wmClass: string;
    customBorder: boolean;
    autoTiling: boolean;
    snapAssist: boolean;
    windowSuggestions: boolean;
    resizeComplementing: boolean;
    spanMultipleTiles: boolean;
}

@registerGObjectClass
export class CustomRulesManager extends GObject.Object {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'CustomRulesManager',
        Signals: {
            'customRules-changed': {},
        },
    };

    private readonly _signals: SignalHandling;
    private _customRules: CustomRulesByApp[];

    constructor() {
        super();
        this._signals = new SignalHandling();
        this._customRules = [];
    }

    public enable(): void {
        this._loadCustomRules();

        // reload customRules when settings change
        this._signals.connect(
            Settings,
            Settings.KEY_APPLICATION_CUSTOMRULES,
            () => {
                this._loadCustomRules();
            },
        );
    }

    public destroy(): void {
        this._signals.disconnect();
        this._customRules = [];
    }

    private _loadCustomRules(): void {
        this._customRules = Settings.get_application_custom_rules();
        debug(
            `Loaded customRules with ${this._customRules.length} applications`,
        );
        this.emit('customRules-changed');
    }

    /**
     * Get the customRules entry for a window by its WM class
     * @param window The window to check
     * @returns The customRules entry if found, undefined otherwise
     */
    private _getCustomRulesEntry(
        window: Meta.Window,
    ): CustomRulesByApp | undefined {
        const wmClass = window.get_wm_class();
        if (!wmClass) return undefined;

        return this._customRules.find(
            (entry) => entry.wmClass.toLowerCase() === wmClass.toLowerCase(),
        );
    }

    /**
     * Check if custom border is enabled for a window
     * @param window The window to check
     * @returns true if custom border should be enabled, false otherwise
     */
    public isCustomBorderEnabled(window: Meta.Window): boolean {
        const entry = this._getCustomRulesEntry(window);

        if (!entry) return true;
        return entry.customBorder;
    }

    /**
     * Check if auto-tiling is enabled for a window
     * @param window The window to check
     * @returns true if auto-tiling should be enabled, false otherwise
     */
    public isAutoTilingEnabled(window: Meta.Window): boolean {
        const entry = this._getCustomRulesEntry(window);

        if (!entry) return true;
        return entry.autoTiling;
    }

    /**
     * Check if snap assistant is enabled for a window
     * @param window The window to check
     * @returns true if snap assistant should be enabled, false otherwise
     */
    public isSnapAssistEnabled(window: Meta.Window): boolean {
        const entry = this._getCustomRulesEntry(window);

        if (!entry) return true;
        return entry.snapAssist;
    }

    /**
     * Check if window suggestions are enabled for a window
     * @param window The window to check
     * @returns true if window suggestions should be enabled, false otherwise
     */
    public isWindowSuggestionsEnabled(window: Meta.Window): boolean {
        const entry = this._getCustomRulesEntry(window);

        if (!entry) return true;
        return entry.windowSuggestions;
    }

    /**
     * Check if resize complementing windows is enabled for a window
     * @param window The window to check
     * @returns true if resize complementing should be enabled, false otherwise
     */
    public isResizeComplementingEnabled(window: Meta.Window): boolean {
        const entry = this._getCustomRulesEntry(window);

        if (!entry) return true;
        return entry.resizeComplementing;
    }

    /**
     * Check if span multiple tiles is enabled for a window
     * @param window The window to check
     * @returns true if span multiple tiles should be enabled, false otherwise
     */
    public isSpanMultipleTilesEnabled(window: Meta.Window): boolean {
        const entry = this._getCustomRulesEntry(window);

        if (!entry) return true;
        return entry.spanMultipleTiles;
    }

    /**
     * Check if a window is customRulesed (any feature disabled)
     * @param window The window to check
     * @returns true if the window is in the customRules, false otherwise
     */
    public isCustomRulesed(window: Meta.Window): boolean {
        return this._getCustomRulesEntry(window) !== undefined;
    }

    /**
     * Get all customRules entries
     * @returns Array of customRules applications
     */
    public getCustomRules(): CustomRulesByApp[] {
        return [...this._customRules];
    }
}
