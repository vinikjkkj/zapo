/** Sets `key` as the newest entry and evicts the oldest past `maxEntries`, via `onEvict`. */
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
        const oldest = map.entries().next()
        if (oldest.done) {
            break
        }
        map.delete(oldest.value[0])
        onEvict?.(oldest.value[0], oldest.value[1])
    }
}
