import Settings from '@settings';
import { logger } from '@utils/shell';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const debug = logger('SettingsOverride');

export default class SettingsOverride {
  // map schema_id with map of keys and old values
  private _overriddenKeys: Map<string, Map<string, GLib.Variant>>;
  private static _instance: SettingsOverride | null;

  private constructor() {
    this._overriddenKeys = this._jsonToOverriddenKeys(Settings.get_overridden_settings());
  }

  static get(): SettingsOverride {
    if (!this._instance) {
      this._instance = new SettingsOverride();
    }

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
    const obj: any = {};
    this._overriddenKeys.forEach((override, schemaId) => {
      obj[schemaId] = {};
      override.forEach((oldValue, key) => {
        obj[schemaId][key] = oldValue.print(true);
      });
    });
    return JSON.stringify(obj);
  }

  private _jsonToOverriddenKeys(json: string): Map<string, Map<string, GLib.Variant>> {
    const result: Map<string, Map<string, GLib.Variant>> = new Map();
    const obj: any = JSON.parse(json);

    for (const schemaId in obj) {
      const schemaMap = new Map();
      result.set(schemaId, schemaMap);

      const overrideObj = obj[schemaId];
      for (const key in overrideObj) {
        schemaMap.set(key, GLib.Variant.parse(null, overrideObj[key], null, null));
      }
    }

    return result;
  }

  public override(giosettings: Gio.Settings, keyToOverride: string, newValue: GLib.Variant): GLib.Variant | null {
    const schemaId = giosettings.schemaId;
    const schemaMap = this._overriddenKeys.get(schemaId) || new Map();
    if (!this._overriddenKeys.has(schemaId)) {
      this._overriddenKeys.set(schemaId, schemaMap);
    }

    const oldValue = schemaMap.has(keyToOverride) ? schemaMap.get(keyToOverride) : giosettings.get_value(keyToOverride);
    //@ts-ignore
    const res = giosettings.set_value(keyToOverride, newValue);
    if (!res) {
      return null;
    }

    if (!schemaMap.has(keyToOverride)) {
      schemaMap.set(keyToOverride, oldValue);

      Settings.set_overridden_settings(this._overriddenKeysToJSON());
    }

    return oldValue;
  }

  public restoreKey(giosettings: Gio.Settings, keyToOverride: string): GLib.Variant | null {
    const overridden = this._overriddenKeys.get(giosettings.schemaId);
    if (!overridden) return null;

    const oldValue = overridden.get(keyToOverride);
    if (!oldValue) return null;

    //@ts-ignore
    const res = giosettings.set_value(keyToOverride, oldValue);

    if (res) {
      overridden.delete(keyToOverride);
      if (overridden.size === 0) this._overriddenKeys.delete(giosettings.schemaId);

      Settings.set_overridden_settings(this._overriddenKeysToJSON());
    }

    return oldValue;
  }

  private _restoreAllKeys(giosettings: Gio.Settings) {
    const overridden = this._overriddenKeys.get(giosettings.schemaId);
    if (!overridden) return;

    overridden.forEach((oldValue: GLib.Variant, key: string) => {
      //@ts-ignore
      const done = giosettings.set_value(key, oldValue);
      if (done) {
        overridden.delete(key);
      }
    });

    if (overridden.size === 0) {
      this._overriddenKeys.delete(giosettings.schemaId);
    }
  }

  public restoreAll() {
    this._overriddenKeys.forEach((overridden: Map<string, GLib.Variant>, schemaId: string) => {
      this._restoreAllKeys(new Gio.Settings({ schemaId }));
    });

    if (this._overriddenKeys.size === 0) {
      this._overriddenKeys = new Map();
    }

    Settings.set_overridden_settings(this._overriddenKeysToJSON());
  }
}
