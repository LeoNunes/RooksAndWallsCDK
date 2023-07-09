export type NonEmptyArray<T> = [T, ...T[]];

type Primitives = undefined | null | boolean | string | number | Function;

export type Immutable<T> =
    T extends Primitives ? T :
    T extends Array<infer U> ? ImmutableArray<U> :
    T extends Map<infer K, infer V> ? ImmutableMap<K, V> :
    T extends Set<infer M> ? ImmutableSet<M> :
    ImmutableObject<T>;

export type ImmutableArray<T> = ReadonlyArray<Immutable<T>>;
export type ImmutableMap<K, V> = ReadonlyMap<Immutable<K>, Immutable<V>>;
export type ImmutableSet<T> = ReadonlySet<Immutable<T>>;
export type ImmutableObject<T> = { readonly [K in keyof T]: Immutable<T[K]> };


export type DeepRequired<T> = 
    T extends Array<infer U> ? DeepRequiredArray<U> :
    T extends Map<infer K, infer V> ? DeepRequiredMap<K, V> :
    T extends Set<infer M> ? DeepRequiredSet<M> :
    DeepRequiredObject<T>;

export type DeepRequiredArray<T> = Array<DeepRequired<T>>;
export type DeepRequiredMap<K, V> = Map<DeepRequired<K>, DeepRequired<V>>;
export type DeepRequiredSet<T> = Set<DeepRequired<T>>;
export type DeepRequiredObject<T> = { [K in keyof T]-?: DeepRequired<T[K]> };
