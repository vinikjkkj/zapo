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

/**
 * Last-access index for entries that expire once idle (neither read nor
 * written) for `ttlMs`. Every `touch` re-inserts the key at the young end,
 * so iteration order is access order and `sweep` can stop at the first live
 * key: a sweep costs O(expired), not O(size).
 *
 * Timestamps come from the caller. A wall clock that steps backwards only
 * delays eviction: the sweep stops at the out-of-order key until it ages out.
 */
export interface IdleExpiryIndex<K> {
    readonly touch: (key: K, nowMs: number) => void
    readonly delete: (key: K) => void
    readonly clear: () => void
    /**
     * Drops every key idle for at least `ttlMs` as of `nowMs`, oldest first,
     * calling `onExpire` for each, and returns how many expired.
     */
    readonly sweep: (nowMs: number, onExpire: (key: K) => void) => number
}

export function createIdleExpiryIndex<K>(ttlMs: number): IdleExpiryIndex<K> {
    const lastAccessMs = new Map<K, number>()
    return {
        touch: (key, nowMs) => {
            lastAccessMs.delete(key)
            lastAccessMs.set(key, nowMs)
        },
        delete: (key) => {
            lastAccessMs.delete(key)
        },
        clear: () => lastAccessMs.clear(),
        sweep: (nowMs, onExpire) => {
            const cutoffMs = nowMs - ttlMs
            let expired = 0
            for (const [key, accessedAtMs] of lastAccessMs) {
                if (accessedAtMs > cutoffMs) break
                lastAccessMs.delete(key)
                onExpire(key)
                expired += 1
            }
            return expired
        }
    }
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
