interface QueueWaiter {
    readonly resolve: () => void
    readonly reject: (error: Error) => void
}

interface QueueEntry<V> {
    value: V
    waiters: QueueWaiter[]
    attempt: number
}

interface RetryTimerEntry<V> {
    readonly entry: QueueEntry<V>
    readonly timer: NodeJS.Timeout
}

interface StateWaiterEntry {
    done: () => void
    index: number
}

export interface BackgroundQueueOptions<K extends string, V> {
    readonly coalesce?: (previous: V, incoming: V, key: K) => V
    readonly maxPendingKeys?: number
    readonly flushTimeoutMs?: number
    readonly onError?: (key: K, error: unknown, attempt: number) => void
    readonly onPressure?: (pendingKeys: number) => void
    readonly onDiscard?: (key: K, value: V) => void
}

export interface BackgroundQueueFlushResult {
    readonly flushed: number
    readonly remaining: number
}

const DEFAULT_MAX_PENDING_KEYS = 4_096
const DEFAULT_FLUSH_TIMEOUT_MS = 5_000
const RETRY_BACKOFF_BASE_MS = 100
const RETRY_BACKOFF_MAX_MS = 2_000

function defaultCoalesce<V>(_previous: V, incoming: V): V {
    return incoming
}

function toQueueError(error: unknown, fallbackMessage: string): Error {
    return error instanceof Error ? error : new Error(fallbackMessage)
}

function validateMaxPendingKeys(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error('BackgroundQueue maxPendingKeys must be a positive integer')
    }
    return value
}

function validateFlushTimeoutMs(value: number): number {
    if (!Number.isFinite(value) || value < 1) {
        throw new Error('BackgroundQueue flushTimeoutMs must be a positive finite number')
    }
    return value
}

function normalizePublicTimeoutMs(value: number, fallback: number): number {
    if (!Number.isFinite(value)) {
        return fallback
    }
    if (value < 0) {
        return 0
    }
    return value
}

export class BackgroundQueue<K extends string, V> {
    private readonly writer: (key: K, value: V) => Promise<void>
    private readonly coalesce: (previous: V, incoming: V, key: K) => V
    private readonly maxPendingKeys: number
    private readonly flushTimeoutMs: number
    private readonly onError?: (key: K, error: unknown, attempt: number) => void
    private readonly onPressure?: (pendingKeys: number) => void
    private readonly onDiscard?: (key: K, value: V) => void
    private readonly pendingByKey: Map<K, QueueEntry<V>>
    private readonly retryTimersByKey: Map<K, RetryTimerEntry<V>>
    private readonly stateWaiters: StateWaiterEntry[]
    private drainingPromise: Promise<void> | null
    private inFlight: number
    private flushedCount: number
    private shutdownRequested: boolean
    private retryDisabled: boolean

    public constructor(
        writer: (key: K, value: V) => Promise<void>,
        options: BackgroundQueueOptions<K, V> = {}
    ) {
        this.writer = writer
        this.coalesce = options.coalesce ?? defaultCoalesce
        this.maxPendingKeys = validateMaxPendingKeys(
            options.maxPendingKeys ?? DEFAULT_MAX_PENDING_KEYS
        )
        this.flushTimeoutMs = validateFlushTimeoutMs(
            options.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS
        )
        this.onError = options.onError
        this.onPressure = options.onPressure
        this.onDiscard = options.onDiscard
        this.pendingByKey = new Map()
        this.retryTimersByKey = new Map()
        this.stateWaiters = []
        this.drainingPromise = null
        this.inFlight = 0
        this.flushedCount = 0
        this.shutdownRequested = false
        this.retryDisabled = false
    }

    public enqueue(key: K, value: V): void {
        if (this.shutdownRequested) {
            this.invokeOnDiscard(key, value)
            return
        }
        if (this.pendingByKey.has(key) || this.retryTimersByKey.has(key)) {
            this.addPendingEntry(key, value)
            this.notifyStateChange()
            this.ensureDrain()
            return
        }
        if (this.trackedKeys() < this.maxPendingKeys) {
            this.addPendingEntry(key, value)
            this.notifyStateChange()
            this.ensureDrain()
            return
        }
        this.invokeOnPressure(this.trackedKeys())
        this.invokeOnDiscard(key, value)
    }

    public async enqueueAsync(key: K, value: V): Promise<void> {
        if (this.shutdownRequested) {
            this.invokeOnDiscard(key, value)
            throw new Error('background queue is destroyed')
        }

        await this.waitForCapacity(key, value)

        return new Promise<void>((resolve, reject) => {
            const waiter: QueueWaiter = { resolve, reject }
            this.addPendingEntry(key, value, waiter)
            this.notifyStateChange()
            this.ensureDrain()
        })
    }

    private async waitForCapacity(key: K, value: V): Promise<void> {
        while (
            !this.pendingByKey.has(key) &&
            !this.retryTimersByKey.has(key) &&
            this.trackedKeys() >= this.maxPendingKeys
        ) {
            this.invokeOnPressure(this.trackedKeys())
            await this.waitForStateChange(this.flushTimeoutMs)
            if (this.shutdownRequested) {
                this.invokeOnDiscard(key, value)
                throw new Error('background queue is destroyed')
            }
        }
    }

    private addPendingEntry(key: K, value: V, waiter?: QueueWaiter): void {
        const scheduledRetryTimer = this.retryTimersByKey.get(key) ?? null
        const scheduledRetry = scheduledRetryTimer?.entry ?? null
        const existing = this.pendingByKey.get(key)
        if (existing) {
            let coalescedValue = existing.value
            let coalescedAttempt = existing.attempt
            try {
                if (scheduledRetry) {
                    coalescedValue = this.coalesce(scheduledRetry.value, coalescedValue, key)
                    coalescedAttempt = Math.max(coalescedAttempt, scheduledRetry.attempt)
                }
                coalescedValue = this.coalesce(coalescedValue, value, key)
            } catch (error) {
                this.invokeOnError(
                    key,
                    error,
                    Math.max(coalescedAttempt + 1, scheduledRetry?.attempt ?? 0)
                )
                if (waiter) {
                    waiter.reject(toQueueError(error, 'background queue coalesce failed'))
                } else {
                    this.invokeOnDiscard(key, value)
                }
                return
            }
            if (scheduledRetry) {
                this.detachRetryEntry(key, scheduledRetryTimer)
                if (scheduledRetry.waiters.length > 0) {
                    const mergedWaiters = new Array<QueueWaiter>(
                        scheduledRetry.waiters.length + existing.waiters.length
                    )
                    let writeIndex = 0
                    for (let index = 0; index < scheduledRetry.waiters.length; index += 1) {
                        mergedWaiters[writeIndex] = scheduledRetry.waiters[index]
                        writeIndex += 1
                    }
                    for (let index = 0; index < existing.waiters.length; index += 1) {
                        mergedWaiters[writeIndex] = existing.waiters[index]
                        writeIndex += 1
                    }
                    existing.waiters = mergedWaiters
                }
                existing.attempt = Math.max(coalescedAttempt, scheduledRetry.attempt)
            }
            existing.value = coalescedValue
            existing.attempt = coalescedAttempt
            if (waiter) {
                existing.waiters[existing.waiters.length] = waiter
            }
            return
        }
        if (scheduledRetry) {
            let coalescedValue: V
            try {
                coalescedValue = this.coalesce(scheduledRetry.value, value, key)
            } catch (error) {
                this.invokeOnError(key, error, scheduledRetry.attempt + 1)
                if (waiter) {
                    waiter.reject(toQueueError(error, 'background queue coalesce failed'))
                } else {
                    this.invokeOnDiscard(key, value)
                }
                return
            }
            this.detachRetryEntry(key, scheduledRetryTimer)
            const scheduledWaiterCount = scheduledRetry.waiters.length
            const waiters = new Array<QueueWaiter>(scheduledWaiterCount + (waiter ? 1 : 0))
            for (let index = 0; index < scheduledWaiterCount; index += 1) {
                waiters[index] = scheduledRetry.waiters[index]
            }
            if (waiter) {
                waiters[scheduledWaiterCount] = waiter
            }
            this.pendingByKey.set(key, {
                value: coalescedValue,
                waiters,
                attempt: scheduledRetry.attempt
            })
            return
        }
        this.pendingByKey.set(key, {
            value,
            waiters: waiter ? [waiter] : [],
            attempt: 0
        })
    }

    private detachRetryEntry(key: K, retry: RetryTimerEntry<V> | null): void {
        if (!retry) {
            return
        }
        const current = this.retryTimersByKey.get(key)
        if (!current || current !== retry) {
            return
        }
        this.retryTimersByKey.delete(key)
        clearTimeout(retry.timer)
    }

    public async flush(
        timeoutMs: number = this.flushTimeoutMs
    ): Promise<BackgroundQueueFlushResult> {
        const normalizedTimeoutMs = normalizePublicTimeoutMs(timeoutMs, this.flushTimeoutMs)
        const startFlushed = this.flushedCount
        const deadline = Date.now() + normalizedTimeoutMs
        while (true) {
            const remaining = this.remaining()
            if (remaining === 0) {
                return {
                    flushed: this.flushedCount - startFlushed,
                    remaining: 0
                }
            }
            const remainingMs = deadline - Date.now()
            if (remainingMs <= 0) {
                return {
                    flushed: this.flushedCount - startFlushed,
                    remaining
                }
            }
            await this.waitForStateChange(remainingMs, true)
        }
    }

    public async destroy(
        timeoutMs: number = this.flushTimeoutMs
    ): Promise<BackgroundQueueFlushResult> {
        const normalizedTimeoutMs = normalizePublicTimeoutMs(timeoutMs, this.flushTimeoutMs)
        this.shutdownRequested = true
        this.notifyStateChange()
        const flushed = await this.flush(normalizedTimeoutMs)
        if (flushed.remaining > 0) {
            this.retryDisabled = true
            this.discardPending()
        }
        return {
            flushed: flushed.flushed,
            remaining: this.remaining()
        }
    }

    private ensureDrain(): void {
        if (this.drainingPromise) {
            return
        }
        this.drainingPromise = this.drainLoop().finally(() => {
            this.drainingPromise = null
            this.notifyStateChange()
            if (this.pendingByKey.size > 0) {
                this.ensureDrain()
            }
        })
    }

    private async drainLoop(): Promise<void> {
        while (true) {
            const next = this.takeNext()
            if (!next) {
                return
            }
            const { key, entry } = next
            this.inFlight += 1
            try {
                await this.writer(key, entry.value)
                this.flushedCount += 1
                this.resolveEntry(entry)
            } catch (error) {
                if (this.retryDisabled) {
                    this.discardEntry(key, entry)
                } else {
                    const merged = this.mergeForRetry(key, entry)
                    const attempt = merged.attempt + 1
                    merged.attempt = attempt
                    this.invokeOnError(key, error, attempt)
                    this.scheduleRetry(key, merged, this.retryDelayMs(attempt))
                }
            } finally {
                this.inFlight -= 1
                this.notifyStateChange()
            }
        }
    }

    private takeNext(): { readonly key: K; readonly entry: QueueEntry<V> } | null {
        const next = this.pendingByKey.entries().next().value
        if (!next) {
            return null
        }
        const [key, entry] = next
        this.pendingByKey.delete(key)
        return { key, entry }
    }

    private mergeForRetry(key: K, failedEntry: QueueEntry<V>): QueueEntry<V> {
        const pending = this.pendingByKey.get(key)
        if (!pending) {
            return failedEntry
        }
        const mergedWaiters = new Array<QueueWaiter>(
            failedEntry.waiters.length + pending.waiters.length
        )
        let mergedWaitersIndex = 0
        for (let index = 0; index < failedEntry.waiters.length; index += 1) {
            mergedWaiters[mergedWaitersIndex] = failedEntry.waiters[index]
            mergedWaitersIndex += 1
        }
        for (let index = 0; index < pending.waiters.length; index += 1) {
            mergedWaiters[mergedWaitersIndex] = pending.waiters[index]
            mergedWaitersIndex += 1
        }
        let mergedValue: V
        try {
            mergedValue = this.coalesce(failedEntry.value, pending.value, key)
        } catch (error) {
            const fallbackAttempt = Math.max(failedEntry.attempt, pending.attempt)
            this.invokeOnError(key, error, fallbackAttempt + 1)
            this.pendingByKey.delete(key)
            this.invokeOnDiscard(key, pending.value)
            if (pending.waiters.length > 0) {
                const queueError = toQueueError(error, 'background queue coalesce failed')
                for (let index = 0; index < pending.waiters.length; index += 1) {
                    pending.waiters[index].reject(queueError)
                }
            }
            return failedEntry
        }
        this.pendingByKey.delete(key)
        return {
            value: mergedValue,
            waiters: mergedWaiters,
            attempt: Math.max(failedEntry.attempt, pending.attempt)
        }
    }

    private retryDelayMs(attempt: number): number {
        if (attempt <= 1) {
            return RETRY_BACKOFF_BASE_MS
        }
        const unbounded = RETRY_BACKOFF_BASE_MS * 2 ** Math.min(6, attempt - 1)
        return Math.min(RETRY_BACKOFF_MAX_MS, unbounded)
    }

    private scheduleRetry(key: K, entry: QueueEntry<V>, retryMs: number): void {
        const existing = this.retryTimersByKey.get(key)
        if (existing) {
            clearTimeout(existing.timer)
        }
        const timer = setTimeout(() => {
            this.retryTimersByKey.delete(key)
            if (this.retryDisabled) {
                this.discardEntry(key, entry)
                this.notifyStateChange()
                return
            }
            const latest = this.mergeForRetry(key, entry)
            this.pendingByKey.set(key, latest)
            this.notifyStateChange()
            this.ensureDrain()
        }, retryMs)
        timer.unref?.()
        this.retryTimersByKey.set(key, { entry, timer })
        this.notifyStateChange()
    }

    private resolveEntry(entry: QueueEntry<V>): void {
        if (entry.waiters.length === 0) {
            return
        }
        for (const waiter of entry.waiters) {
            waiter.resolve()
        }
    }

    private discardEntry(key: K, entry: QueueEntry<V>): void {
        this.invokeOnDiscard(key, entry.value)
        if (entry.waiters.length === 0) {
            return
        }
        const error = toQueueError(undefined, 'background queue destroyed before write was flushed')
        for (const waiter of entry.waiters) {
            waiter.reject(error)
        }
    }

    private discardPending(): void {
        if (this.pendingByKey.size > 0) {
            for (const [key, entry] of this.pendingByKey) {
                this.pendingByKey.delete(key)
                this.discardEntry(key, entry)
            }
        }
        if (this.retryTimersByKey.size > 0) {
            for (const [key, retry] of this.retryTimersByKey) {
                this.retryTimersByKey.delete(key)
                clearTimeout(retry.timer)
                this.discardEntry(key, retry.entry)
            }
        }
        this.notifyStateChange()
    }

    private remaining(): number {
        return this.pendingByKey.size + this.retryTimersByKey.size + this.inFlight
    }

    private trackedKeys(): number {
        return this.pendingByKey.size + this.retryTimersByKey.size
    }

    private notifyStateChange(): void {
        if (this.stateWaiters.length === 0) {
            return
        }
        const waiterCount = this.stateWaiters.length
        for (let index = 0; index < waiterCount; index += 1) {
            const waiter = this.stateWaiters[index]
            waiter.index = -1
            waiter.done()
        }
        this.stateWaiters.length = 0
    }

    private waitForStateChange(timeoutMs: number, ref = false): Promise<void> {
        return new Promise<void>((resolve) => {
            let active = true
            const waiter: StateWaiterEntry = {
                done: () => {
                    if (!active) {
                        return
                    }
                    active = false
                    clearTimeout(timer)
                    this.removeStateWaiter(waiter)
                    resolve()
                },
                index: -1
            }
            const timer = setTimeout(waiter.done, timeoutMs)
            if (!ref) {
                timer.unref?.()
            }
            waiter.index = this.stateWaiters.length
            this.stateWaiters[waiter.index] = waiter
        })
    }

    private removeStateWaiter(waiter: StateWaiterEntry): void {
        const index = waiter.index
        if (index < 0) {
            return
        }
        const lastIndex = this.stateWaiters.length - 1
        if (index !== lastIndex) {
            const last = this.stateWaiters[lastIndex]
            this.stateWaiters[index] = last
            last.index = index
        }
        this.stateWaiters.length = lastIndex
        waiter.index = -1
    }

    private invokeOnError(key: K, error: unknown, attempt: number): void {
        if (!this.onError) {
            return
        }
        try {
            this.onError(key, error, attempt)
        } catch {
            return
        }
    }

    private invokeOnPressure(pendingKeys: number): void {
        if (!this.onPressure) {
            return
        }
        try {
            this.onPressure(pendingKeys)
        } catch {
            return
        }
    }

    private invokeOnDiscard(key: K, value: V): void {
        if (!this.onDiscard) {
            return
        }
        try {
            this.onDiscard(key, value)
        } catch {
            return
        }
    }
}
