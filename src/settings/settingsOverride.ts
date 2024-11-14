import Settings from '@settings/settings';
import { Gio, GLib } from '@gi.shared';

export default class SettingsOverride {
    // map schema_id with map of keys and old values
    private _overriddenKeys: Map<string, Map<string, GLib.Variant>>;
    private static _instance: SettingsOverride | null;

    private constructor() {
        this._overriddenKeys = this._jsonToOverriddenKeys(
            Settings.OVERRIDDEN_SETTINGS,
        );
    }

    static get(): SettingsOverride {
        if (!this._instance) this._instance = new SettingsOverride();

        return this._instance;
    }

    static destroy() {
        if (!this._instance) return;

        this._instance.restoreAll();
        this._instance = null;
    }

    /*
    json will have the following structure
    {
        "schema.id": {
            "overridden.key.one": oldvalue,
            "overridden.key.two": oldvalue
            ...
        },
        ...
    }
    */
    private _overriddenKeysToJSON(): string {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj: any = {};
        this._overriddenKeys.forEach((override, schemaId) => {
            obj[schemaId] = {};
            override.forEach((oldValue, key) => {
                obj[schemaId][key] = oldValue.print(true);
            });
        });
        return JSON.stringify(obj);
    }

    private _jsonToOverriddenKeys(
        json: string,
    ): Map<string, Map<string, GLib.Variant>> {
        const result: Map<string, Map<string, GLib.Variant>> = new Map();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj: any = JSON.parse(json);

        for (const schemaId in obj) {
            const schemaMap = new Map();
            result.set(schemaId, schemaMap);

            const overrideObj = obj[schemaId];
            for (const key in overrideObj) {
                schemaMap.set(
                    key,
                    GLib.Variant.parse(null, overrideObj[key], null, null),
                );
            }
        }

        return result;
    }

    public override(
        giosettings: Gio.Settings,
        keyToOverride: string,
        newValue: GLib.Variant,
    ): GLib.Variant | null {
        const schemaId = giosettings.schemaId;
        const schemaMap = this._overriddenKeys.get(schemaId) || new Map();
        if (!this._overriddenKeys.has(schemaId))
            this._overriddenKeys.set(schemaId, schemaMap);

        const oldValue = schemaMap.has(keyToOverride)
            ? schemaMap.get(keyToOverride)
            : giosettings.get_value(keyToOverride);
        // @ts-expect-error "Variant has a type which is not known here"
        const res = giosettings.set_value(keyToOverride, newValue);
        if (!res) return null;

        if (!schemaMap.has(keyToOverride)) {
            schemaMap.set(keyToOverride, oldValue);

            Settings.OVERRIDDEN_SETTINGS = this._overriddenKeysToJSON();
        }

        return oldValue;
    }

    public restoreKey(
        giosettings: Gio.Settings,
        keyToOverride: string,
    ): GLib.Variant | null {
        const overridden = this._overriddenKeys.get(giosettings.schemaId);
        if (!overridden) return null;

        const oldValue = overridden.get(keyToOverride);
        if (!oldValue) return null;

        // @ts-expect-error "Variant has an unkown type"
        const res = giosettings.set_value(keyToOverride, oldValue);

        if (res) {
            overridden.delete(keyToOverride);
            if (overridden.size === 0)
                this._overriddenKeys.delete(giosettings.schemaId);

            Settings.OVERRIDDEN_SETTINGS = this._overriddenKeysToJSON();
        }

        return oldValue;
    }

    public restoreAll() {
        const schemaToDelete: string[] = [];
        this._overriddenKeys.forEach(
            (map: Map<string, GLib.Variant>, schemaId: string) => {
                const giosettings = new Gio.Settings({ schemaId });
                const overridden = this._overriddenKeys.get(
                    giosettings.schemaId,
                );
                if (!overridden) return;

                const toDelete: string[] = [];
                overridden.forEach((oldValue: GLib.Variant, key: string) => {
                    // @ts-expect-error "Variant has an unkown type"
                    const done = giosettings.set_value(key, oldValue);
                    if (done) toDelete.push(key);
                });
                toDelete.forEach((key) => overridden.delete(key));
                if (overridden.size === 0) schemaToDelete.push(schemaId);
            },
        );
        schemaToDelete.forEach((schemaId) => {
            this._overriddenKeys.delete(schemaId);
        });

        if (this._overriddenKeys.size === 0) this._overriddenKeys = new Map();

        Settings.OVERRIDDEN_SETTINGS = this._overriddenKeysToJSON();
    }
}
