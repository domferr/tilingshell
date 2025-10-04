/* eslint-disable @typescript-eslint/no-explicit-any */
import { Meta } from '@gi.ext';
import { logger } from '@utils/logger';

const debug = logger('MetaWindowGroup');

/**
 * Represents a group of windows and allows executing methods on all of them simultaneously.
 */
export default class MetaWindowGroup {
    private _windows: Meta.Window[];
    private _unmanagedCounter: number; // count how many windows are unmanaged
    private _unmanagedEventHandler: (() => void) | null;

    /**
     * Initializes a WindowsGroup with a list of Meta.Window instances.
     * @param windows - An array of Meta.Window objects to manage as a group.
     */
    constructor(windows: Meta.Window[]) {
        this._windows = windows;
        this._unmanagedCounter = 0;
        this._unmanagedEventHandler = null;

        this._windows.forEach((win) =>
            win.connect('unmanaged', () => {
                this._unmanagedCounter++;
                if (
                    this._unmanagedEventHandler &&
                    this._unmanagedCounter === this._windows.length
                )
                    this._unmanagedEventHandler();
            }),
        );

        return new Proxy(this, {
            get: (target, prop, receiver) => {
                // If the property exists in WindowsGroup itself, return it
                if (prop in target) return Reflect.get(target, prop, receiver);

                // If the property exists on a Meta.Window instance, proxy the call to all windows
                // @ts-expect-error "This is expected"
                if (typeof this._windows[0]?.[prop] === 'function') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return (...args: any[]) => {
                        // debug(`Called function: ${String(prop)}`);

                        // Execute the method on each window in the group
                        this._windows.forEach((win) =>
                            // @ts-expect-error "This is expected"
                            // eslint-disable-next-line @typescript-eslint/ban-types
                            (win[prop] as Function)(...args),
                        );
                    };
                }

                // If it's a property (not a function), return the value from the first window
                // @ts-expect-error "This is expected"
                return this._windows[0]?.[prop];
            },
        });
    }

    public get_workspace(): Meta.Workspace {
        return this._windows[0].get_workspace();
    }

    public activate(time: number) {
        // avoid activating with the same time
        this._windows.forEach((win) => {
            win.activate(time);
            time = global.get_current_time();
        });
    }

    public connect(...args: any[]) {
        // @ts-expect-error "This is expected"
        return this._windows[0].connect(...args);
    }

    public connectObject(...args: any[]) {
        // @ts-expect-error "This is expected"
        return this._windows[0].connectObject(...args);
    }

    public onAllWindowsUnmanaged(fn: () => void) {
        this._unmanagedEventHandler = fn;
    }
}
