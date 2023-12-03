export type NonEmptyArray<T> = [T, ...T[]];
export type ReadonlyNonEmptyArray<T> = readonly [T, ...T[]];
export type EmptyObject = Record<PropertyKey, never>;

// eslint-disable-next-line @typescript-eslint/ban-types
export type Primitives = undefined | null | boolean | string | number | bigint | symbol | Function;

export type Immutable<T> =
    T extends Primitives ? T :
    T extends NonEmptyArray<infer A> ? ImmutableNonEmptyArray<A> :
    T extends Array<infer B> ? ImmutableArray<B> :
    T extends Map<infer C, infer D> ? ImmutableMap<C, D> :
    T extends Set<infer E> ? ImmutableSet<E> :
    ImmutableObject<T>;

export type ImmutableNonEmptyArray<T> = ReadonlyNonEmptyArray<Immutable<T>>;
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
