import { EmptyObject, Immutable, NonEmptyArray, Primitives, ReadonlyNonEmptyArray } from './type_helper';

const noDefault = Symbol();
export type NoDefault<T> = T & { [noDefault]: true; };
export type DeepNoDefault<T> = 
    undefined extends T ? DeepNoDefault<NonNullable<T>> | undefined :
    T extends NonEmptyArray<infer A> ? NonEmptyArray<DeepNoDefault<A>> :
    T extends Array<infer B> ? Array<DeepNoDefault<B>> :
    T extends object ? NoDefault<{ [Key in keyof T]: DeepNoDefault<T[Key]> }> :
    NoDefault<T>;

type RemoveMarkers<T> = 
    undefined extends T ? RemoveMarkers<NonNullable<T>> | undefined :
    T extends NoDefault<infer A> ? RemoveMarkers<A> :
    T extends NonEmptyArray<infer B> ? NonEmptyArray<RemoveMarkers<B>> :
    T extends Array<infer C> ? Array<RemoveMarkers<C>> :
    T extends object ? { [Key in keyof T]: RemoveMarkers<T[Key]> } :
    T;

type RemoveOptional<T> =
    undefined extends T ? RemoveOptional<NonNullable<T>> | undefined :
    T extends NoDefault<infer A> ? NoDefault<RemoveOptional<A>> :
    T extends NonEmptyArray<infer B> ? NonEmptyArray<RemoveOptional<B>> :
    T extends Array<infer C> ? Array<RemoveOptional<C>> :
    T extends object ? RemoveOptionalFromObject<T, KeysToRemoveOptional<T>> :
    T;

type RemoveOptionalFromObject<T, Keys extends keyof T> = {
    [K in keyof T as (K extends Keys ? K : never)]-?: RemoveOptional<T[K]>;
} & {
    [K in keyof T as (K extends Keys ? never : K)]: RemoveOptional<T[K]>;
};

type KeysToRemoveOptional<T> = keyof {
    [K in keyof T as (T[K] extends (NoDefault<unknown> | undefined) ? never : K)]: never;
};

type RemovePropertiesThatDoesntNeedDefault<T> = {
    [K in keyof T as (
        undefined extends T[K] ? (
            NonNullable<T[K]> extends NoDefault<unknown> ? never : K
        ) : never
    )]-?: NonNullable<T[K]>;
};

type GenerateDefaultProperties<T> = {
    [K in keyof T as (
        T[K] extends Primitives ? never :
        NonNullable<T[K]> extends Array<Primitives> ? never :
        NonNullable<Default<T[K]>> extends EmptyObject ? never :
        `${K & (string | number)}_defaults`
    )]-?: Default<T[K]>;
};

type Default<T> =
    T extends Array<infer A> ? Default<A> :
    T extends object ? DefaultObject<T> :
    T;

type DefaultObject<T> = RemovePropertiesThatDoesntNeedDefault<T> & GenerateDefaultProperties<T>;

type EnforceEmptyObjectType<T> = T extends EmptyObject ? EmptyObject : T;

export type ConfigType<ConfigDef extends object> = ExpandDeep<EnforceEmptyObjectType<Immutable<RemoveMarkers<ConfigDef>>>>;
export type DefaultConfigType<ConfigDef extends object> = ExpandDeep<EnforceEmptyObjectType<Immutable<RemoveMarkers<Default<ConfigDef>>>>>;
export type FinalConfigType<ConfigDef extends object> = ExpandDeep<EnforceEmptyObjectType<Immutable<RemoveMarkers<RemoveOptional<ConfigDef>>>>>;

export function generateFinalConfig<ConfigDef extends object>(config: ConfigType<ConfigDef>, defaults: DefaultConfigType<ConfigDef>) : FinalConfigType<ConfigDef> {
    return generateFinalConfigRecursive(config, defaults) as FinalConfigType<ConfigDef>;
}

function generateFinalConfigRecursive(config: object, defaults: object) : object {
    const result: Record<string, any> = {};

    const keys = new Set<string>(
        Object.keys(config)
        .concat(Object.keys(defaults)
        .map(k => k.replace('_defaults', ''))));

    for (const key of keys) {
        const property = (config as any)[key] || (defaults as any)[key];
        const defaultsProperty = (defaults as any)[`${key}_defaults`]

        if (Array.isArray(property)) {
            result[key] = property.map(p => {
                if (typeof p === 'object') {
                    return generateFinalConfigRecursive(p || {}, defaultsProperty || {})
                }
                return p;
            });
        }
        else if (typeof property === 'object') {
            result[key] = generateFinalConfigRecursive(property || {}, defaultsProperty || {});
        }
        else {
            result[key] = property;
        }
    }

    return result;
}

/**
 * Hack to make vs code expand/compute types to show in tooltips. It doesn't affect the type in any other way.
 * Based on https://github.com/shian15810/type-expand
 */
type Expand<T> =
    T extends object ? (T extends infer O ? { [K in keyof O]: O[K] } : never) : T;

type ExpandDeep<T> =
    T extends NonEmptyArray<infer A> ? NonEmptyArray<ExpandDeep<A>> :
    T extends ReadonlyNonEmptyArray<infer B> ? ReadonlyNonEmptyArray<ExpandDeep<B>> :
    T extends object ? (T extends infer O ? { [K in keyof O]: ExpandDeep<O[K]> } : never) :
    T;
