import GObject from 'gi://GObject';

// Taken from https://github.com/material-shell/material-shell/blob/main/src/utils/gjs.ts
/// Decorator function to call `GObject.registerClass` with the given class.
/// Use like
/// ```
/// @registerGObjectClass
/// export class MyThing extends GObject.Object { ... }
/// ```
export function registerGObjectClass<K, T extends { metaInfo?: any; new (...params: any[]): K }>(target: T) {
  // Note that we use 'hasOwnProperty' because otherwise we would get inherited meta infos.
  // This would be bad because we would inherit the GObjectName too, which is supposed to be unique.
  if (Object.prototype.hasOwnProperty.call(target, 'metaInfo')) {
    // @ts-ignore
    return GObject.registerClass<K, T>(target.metaInfo!, target) as typeof target;
  } else {
    // @ts-ignore
    return GObject.registerClass<K, T>(target) as typeof target;
  }
}
