export function resolveCleanupIntervalMs(ttlMs: number, maxIntervalMs = 60_000): number {
    if (ttlMs <= 1_000) {
        return ttlMs
    }
    return Math.min(maxIntervalMs, Math.floor(ttlMs / 2))
}

export interface PeriodicCleanupHandle {
    readonly destroy: () => void
}

export function createPeriodicCleanup(ttlMs: number, run: () => void): PeriodicCleanupHandle {
    const timer = setInterval(run, resolveCleanupIntervalMs(ttlMs))
    timer.unref?.()
    return {
        destroy: () => clearInterval(timer)
    }
}

/**
 * Returns a validated positive-safe-integer query limit, falling back to
 * `defaultLimit` when `limit` is undefined. Throws on invalid input.
 */
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
