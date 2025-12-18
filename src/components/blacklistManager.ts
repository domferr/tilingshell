import { GObject, Meta } from '@gi.ext';
import SignalHandling from '@utils/signalHandling';
import { logger } from '@utils/logger';
import { registerGObjectClass } from '@utils/gjs';
import Settings from '@settings/settings';

const debug = logger('BlacklistManager');

export interface BlacklistApplication {
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
export class BlacklistManager extends GObject.Object {
    static metaInfo: GObject.MetaInfo<unknown, unknown, unknown> = {
        GTypeName: 'BlacklistManager',
        Signals: {
            'blacklist-changed': {},
        },
    };

    private readonly _signals: SignalHandling;
    private _blacklist: BlacklistApplication[];

    constructor() {
        super();
        this._signals = new SignalHandling();
        this._blacklist = [];
    }

    public enable(): void {
        this._loadBlacklist();

        // reload blacklist when settings change
        this._signals.connect(
            Settings,
            Settings.KEY_APPLICATION_BLACKLIST,
            () => {
                this._loadBlacklist();
            },
        );
    }

    public destroy(): void {
        this._signals.disconnect();
        this._blacklist = [];
    }

    private _loadBlacklist(): void {
        this._blacklist = Settings.get_application_blacklist();
        debug(`Loaded blacklist with ${this._blacklist.length} applications`);
        this.emit('blacklist-changed');
    }

    /**
     * Get the blacklist entry for a window by its WM class
     * @param window The window to check
     * @returns The blacklist entry if found, undefined otherwise
     */
    private _getBlacklistEntry(
        window: Meta.Window,
    ): BlacklistApplication | undefined {
        const wmClass = window.get_wm_class();
        if (!wmClass) return undefined;

        return this._blacklist.find(
            (entry) => entry.wmClass.toLowerCase() === wmClass.toLowerCase(),
        );
    }

    /**
     * Check if custom border is enabled for a window
     * @param window The window to check
     * @returns true if custom border should be enabled, false otherwise
     */
    public isCustomBorderEnabled(window: Meta.Window): boolean {
        const entry = this._getBlacklistEntry(window);

        if (!entry) return true;
        return entry.customBorder;
    }

    /**
     * Check if auto-tiling is enabled for a window
     * @param window The window to check
     * @returns true if auto-tiling should be enabled, false otherwise
     */
    public isAutoTilingEnabled(window: Meta.Window): boolean {
        const entry = this._getBlacklistEntry(window);

        if (!entry) return true;
        return entry.autoTiling;
    }

    /**
     * Check if snap assistant is enabled for a window
     * @param window The window to check
     * @returns true if snap assistant should be enabled, false otherwise
     */
    public isSnapAssistEnabled(window: Meta.Window): boolean {
        const entry = this._getBlacklistEntry(window);

        if (!entry) return true;
        return entry.snapAssist;
    }

    /**
     * Check if window suggestions are enabled for a window
     * @param window The window to check
     * @returns true if window suggestions should be enabled, false otherwise
     */
    public isWindowSuggestionsEnabled(window: Meta.Window): boolean {
        const entry = this._getBlacklistEntry(window);

        if (!entry) return true;
        return entry.windowSuggestions;
    }

    /**
     * Check if resize complementing windows is enabled for a window
     * @param window The window to check
     * @returns true if resize complementing should be enabled, false otherwise
     */
    public isResizeComplementingEnabled(window: Meta.Window): boolean {
        const entry = this._getBlacklistEntry(window);

        if (!entry) return true;
        return entry.resizeComplementing;
    }

    /**
     * Check if span multiple tiles is enabled for a window
     * @param window The window to check
     * @returns true if span multiple tiles should be enabled, false otherwise
     */
    public isSpanMultipleTilesEnabled(window: Meta.Window): boolean {
        const entry = this._getBlacklistEntry(window);

        if (!entry) return true;
        return entry.spanMultipleTiles;
    }

    /**
     * Check if a window is blacklisted (any feature disabled)
     * @param window The window to check
     * @returns true if the window is in the blacklist, false otherwise
     */
    public isBlacklisted(window: Meta.Window): boolean {
        return this._getBlacklistEntry(window) !== undefined;
    }

    /**
     * Get all blacklist entries
     * @returns Array of blacklist applications
     */
    public getBlacklist(): BlacklistApplication[] {
        return [...this._blacklist];
    }
}
