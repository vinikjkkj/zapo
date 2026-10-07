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
 * Sweep period shared by a set of idle TTLs: the smallest `ttlMs / 2`,
 * clamped to [1 s, 60 s].
 */
export function resolveIdleSweepPeriodMs(ttlsMs: readonly number[]): number {
    let periodMs = 60_000
    for (let i = 0; i < ttlsMs.length; i += 1) {
        periodMs = Math.min(periodMs, Math.max(1_000, Math.floor(ttlsMs[i] / 2)))
    }
    return periodMs
}

/**
 * Coarse clock for idle expiry: one `unref`'d interval bumps `tick` and runs
 * every registered sweep, and only while a sweep is registered. Wall-clock
 * steps never move `tick`.
 */
export class IdleSweepClock {
    public readonly periodMs: number
    private currentTick: number
    private readonly sweeps: Set<(tick: number) => void>
    private timer: NodeJS.Timeout | null

    public constructor(periodMs: number) {
        this.periodMs = periodMs
        this.currentTick = 0
        this.sweeps = new Set()
        this.timer = null
    }

    public get tick(): number {
        return this.currentTick
    }

    /** Runs `sweep` on every tick until the returned function is called. */
    public register(sweep: (tick: number) => void): () => void {
        this.sweeps.add(sweep)
        if (this.timer === null) {
            this.timer = setInterval(this.advance, this.periodMs)
            this.timer.unref?.()
        }
        return () => {
            this.sweeps.delete(sweep)
            if (this.sweeps.size > 0 || this.timer === null) return
            clearInterval(this.timer)
            this.timer = null
        }
    }

    private readonly advance = (): void => {
        this.currentTick += 1
        for (const sweep of this.sweeps) sweep(this.currentTick)
    }
}

export interface IdleExpiry {
    readonly clock: IdleSweepClock
    readonly ttlMs: number
}

/**
 * Idle expiry and LRU order for the entries of `data`. A touch moves the key
 * to the young end of the index and of `data`, at most once per tick, so the
 * sweep stops at the first live key and `data` iterates least recently used
 * first. A key expires after `ceil(ttlMs / periodMs) + 1` untouched ticks:
 * idle for at least `ttlMs` and, timer lateness aside, under `ttlMs + 2 * periodMs`.
 */
export class IdleExpiryIndex<K, V> {
    private readonly data: Map<K, V>
    private readonly clock: IdleSweepClock
    private readonly idleTicks: number
    private readonly touchedAt: Map<K, number>
    private readonly unregister: () => void

    public constructor(data: Map<K, V>, expiry: IdleExpiry) {
        this.data = data
        this.clock = expiry.clock
        this.idleTicks = Math.ceil(expiry.ttlMs / expiry.clock.periodMs) + 1
        this.touchedAt = new Map()
        this.unregister = expiry.clock.register(this.sweep)
    }

    public touch(key: K): void {
        const tick = this.clock.tick
        if (this.touchedAt.get(key) === tick) return
        this.touchedAt.delete(key)
        this.touchedAt.set(key, tick)
        const value = this.data.get(key)
        if (value === undefined) return
        this.data.delete(key)
        this.data.set(key, value)
    }

    public delete(key: K): void {
        this.touchedAt.delete(key)
    }

    public clear(): void {
        this.touchedAt.clear()
    }

    /** Stops sweeping; the entries stay until the owner clears them. */
    public detach(): void {
        this.unregister()
    }

    private readonly sweep = (tick: number): void => {
        const cutoff = tick - this.idleTicks
        for (const [key, touchedAt] of this.touchedAt) {
            if (touchedAt > cutoff) return
            this.touchedAt.delete(key)
            this.data.delete(key)
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
