export function normalizeQueryLimit(limit: number | undefined, defaultLimit: number): number {
    if (limit === undefined) {
        return defaultLimit
    }
    if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new Error(`invalid query limit: ${limit}`)
    }
    return limit
}

export function setBoundedMapEntry<K, V>(
    map: Map<K, V>,
    key: K,
    value: V,
    maxEntries: number,
    onEvict?: (key: K, value: V) => void
): void {
    map.delete(key)
    map.set(key, value)
    while (map.size > maxEntries) {
        const oldest = map.entries().next().value
        if (!oldest) {
            break
        }
        map.delete(oldest[0])
        onEvict?.(oldest[0], oldest[1])
    }
}
