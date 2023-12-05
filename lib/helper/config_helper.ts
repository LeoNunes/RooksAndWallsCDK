import {
    EmptyObject,
    Immutable,
    NonEmptyArray,
    Primitives,
    ReadonlyNonEmptyArray,
} from './type_helper';

const nullableDefault = Symbol();
export type NullableDefault<T> = T & { [nullableDefault]: true };

const noDefault = Symbol();
export type NoDefault<T> = T & { [noDefault]: true };

// prettier-ignore
export type DeepNoDefault<T> = 
    undefined extends T ? DeepNoDefault<NonNullable<T>> | undefined :
    T extends NonEmptyArray<infer A> ? NonEmptyArray<DeepNoDefault<A>> :
    T extends Array<infer B> ? Array<DeepNoDefault<B>> :
    T extends object ? NoDefault<{ [Key in keyof T]: DeepNoDefault<T[Key]> }> :
    NoDefault<T>;

// prettier-ignore
type RemoveMarkers<T> = 
    undefined extends T ? RemoveMarkers<NonNullable<T>> | undefined :
    T extends NoDefault<infer A> ? RemoveMarkers<A> :
    T extends NullableDefault<infer B> ? RemoveMarkers<B> :
    T extends NonEmptyArray<infer C> ? NonEmptyArray<RemoveMarkers<C>> :
    T extends Array<infer D> ? Array<RemoveMarkers<D>> :
    T extends object ? { [Key in keyof T]: RemoveMarkers<T[Key]> } :
    T;

// prettier-ignore
type RemoveOptional<T> =
    undefined extends T ? RemoveOptional<NonNullable<T>> | undefined :
    T extends NoDefault<infer A> ? NoDefault<RemoveOptional<A>> :
    T extends NullableDefault<infer B> ? NullableDefault<RemoveOptional<B>> :
    T extends NonEmptyArray<infer C> ? NonEmptyArray<RemoveOptional<C>> :
    T extends Array<infer D> ? Array<RemoveOptional<D>> :
    T extends object ? RemoveOptionalFromObject<T, KeysToRemoveOptional<T>> :
    T;

// prettier-ignore
type RemoveOptionalFromObject<T, Keys extends keyof T> = {
    [K in keyof T as (K extends Keys ? K : never)]-?: RemoveOptional<T[K]>;
} & {
    [K in keyof T as (K extends Keys ? never : K)]: RemoveOptional<T[K]>;
};

// prettier-ignore
type KeysToRemoveOptional<T> = keyof {
    [K in keyof T as (
        T[K] extends (NoDefault<unknown> | undefined) ? never :
        T[K] extends (NullableDefault<unknown> | undefined) ? never :
        K
    )]: T[K];
};

type RemovePropertiesThatDoesntNeedDefault<T> = {
    [K in keyof T as undefined extends T[K]
        ? NonNullable<T[K]> extends NoDefault<unknown>
            ? never
            : K
        : never]-?: NonNullable<T[K]>;
};

type MarkNullableDefaultPropertiesAsNullable<T> = {
    [K in keyof T]: T[K] extends NullableDefault<unknown> ? T[K] | undefined : T[K];
};

// prettier-ignore
type GenerateDefaultProperties<T> = {
    [K in keyof T as (
        T[K] extends Primitives ? never :
        NonNullable<T[K]> extends Array<Primitives> ? never :
        NonNullable<Default<T[K]>> extends EmptyObject ? never :
        `${K & (string | number)}_defaults`
    )]-?: Default<T[K]>;
};

// prettier-ignore
type DefaultObject<T> =
    MarkNullableDefaultPropertiesAsNullable<RemovePropertiesThatDoesntNeedDefault<T>> &
    GenerateDefaultProperties<T>;

// prettier-ignore
type Default<T> =
    T extends Array<infer A> ? Default<A> :
    T extends object ? DefaultObject<T> :
    T;

type EnforceEmptyObjectType<T> = T extends EmptyObject ? EmptyObject : T;

export type ConfigType<ConfigDef extends Record<PropertyKey, unknown>> = ExpandDeep<
    EnforceEmptyObjectType<Immutable<RemoveMarkers<ConfigDef>>>
>;
export type DefaultConfigType<ConfigDef extends Record<PropertyKey, unknown>> = ExpandDeep<
    EnforceEmptyObjectType<Immutable<RemoveMarkers<Default<ConfigDef>>>>
>;
export type FinalConfigType<ConfigDef extends Record<PropertyKey, unknown>> = ExpandDeep<
    EnforceEmptyObjectType<Immutable<RemoveMarkers<RemoveOptional<ConfigDef>>>>
>;

export function generateFinalConfig<ConfigDef extends Record<PropertyKey, unknown>>(
    config: ConfigType<ConfigDef>,
    defaults: DefaultConfigType<ConfigDef>,
): FinalConfigType<ConfigDef> {
    return generateFinalConfigRecursive(config, defaults) as FinalConfigType<ConfigDef>;
}

function generateFinalConfigRecursive(config: object, defaults: object): object {
    const result: Record<string, unknown> = {};

    const keys = new Set<string>(
        Object.keys(config).concat(Object.keys(defaults).map(k => k.replace('_defaults', ''))),
    );

    for (const key of keys) {
        const property =
            (config as Record<string, unknown>)[key] || (defaults as Record<string, unknown>)[key];
        const defaultsProperty = (defaults as Record<string, unknown>)[`${key}_defaults`];

        if (Array.isArray(property)) {
            result[key] = property.map(p => {
                if (typeof p === 'object') {
                    return generateFinalConfigRecursive(p || {}, defaultsProperty || {});
                }
                return p;
            });
        } else if (typeof property === 'object') {
            result[key] = generateFinalConfigRecursive(property || {}, defaultsProperty || {});
        } else {
            result[key] = property;
        }
    }

    return result;
}

/**
 * Hack to make vs code expand/compute types to show in tooltips. It doesn't affect the type in any other way.
 * Based on https://github.com/shian15810/type-expand
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Expand<T> = T extends object ? (T extends infer O ? { [K in keyof O]: O[K] } : never) : T;

// prettier-ignore
type ExpandDeep<T> =
    T extends NonEmptyArray<infer A> ? NonEmptyArray<ExpandDeep<A>> :
    T extends ReadonlyNonEmptyArray<infer B> ? ReadonlyNonEmptyArray<ExpandDeep<B>> :
    T extends object ? (T extends infer O ? { [K in keyof O]: ExpandDeep<O[K]> } : never) :
    T;
