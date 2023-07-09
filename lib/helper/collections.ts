export function groupBy<T, K extends string | number | symbol>(collection: ReadonlyArray<T>, selector: (item: T) => K) : Record<K, T[]> {
    return collection.reduce((result, currentValue) => {
        const groupKey = selector(currentValue);
        if (!result[groupKey]) {
            result[groupKey] = [];
        }
        result[groupKey].push(currentValue);
        return result;
    }, {} as Record<K, T[]>);
}
