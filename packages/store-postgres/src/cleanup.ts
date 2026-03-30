import type {
    WaDeviceListStore,
    WaMessageSecretStore,
    WaParticipantsStore,
    WaRetryStore
} from 'zapo-js/store'

export interface PgCleanupPollerOptions {
    readonly intervalMs?: number
    readonly retry?: WaRetryStore
    readonly participants?: WaParticipantsStore
    readonly deviceList?: WaDeviceListStore
    readonly messageSecret?: WaMessageSecretStore
    readonly onError?: (error: Error) => void
}

const DEFAULT_INTERVAL_MS = 60_000

export class PgCleanupPoller {
    private readonly intervalMs: number
    private readonly retry: WaRetryStore | undefined
    private readonly participants: WaParticipantsStore | undefined
    private readonly deviceList: WaDeviceListStore | undefined
    private readonly messageSecret: WaMessageSecretStore | undefined
    private readonly onError: ((error: Error) => void) | undefined
    private timer: ReturnType<typeof setInterval> | null
    private inFlight: boolean

    public constructor(options: PgCleanupPollerOptions) {
        const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
        if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
            throw new Error('cleanup intervalMs must be a positive finite number')
        }
        this.intervalMs = intervalMs
        this.retry = options.retry
        this.participants = options.participants
        this.deviceList = options.deviceList
        this.messageSecret = options.messageSecret
        this.onError = options.onError
        this.timer = null
        this.inFlight = false
    }

    public start(): void {
        if (this.timer) return
        this.timer = setInterval(() => {
            if (this.inFlight) return
            this.inFlight = true
            this.cleanup()
                .catch((error: unknown) => {
                    if (this.onError) {
                        this.onError(error instanceof Error ? error : new Error(String(error)))
                    }
                })
                .finally(() => {
                    this.inFlight = false
                })
        }, this.intervalMs)
        if (typeof this.timer === 'object' && 'unref' in this.timer) {
            this.timer.unref()
        }
    }

    public stop(): void {
        if (!this.timer) return
        clearInterval(this.timer)
        this.timer = null
    }

    public async cleanup(): Promise<number> {
        const nowMs = Date.now()
        const tasks: Promise<number>[] = []
        if (this.retry) tasks.push(this.retry.cleanupExpired(nowMs))
        if (this.participants) tasks.push(this.participants.cleanupExpired(nowMs))
        if (this.deviceList) tasks.push(this.deviceList.cleanupExpired(nowMs))
        if (this.messageSecret) tasks.push(this.messageSecret.cleanupExpired(nowMs))

        const results = await Promise.allSettled(tasks)
        let total = 0
        const errors: Error[] = []
        for (const result of results) {
            if (result.status === 'fulfilled') {
                total += result.value
            } else {
                errors.push(
                    result.reason instanceof Error
                        ? result.reason
                        : new Error(String(result.reason))
                )
            }
        }
        if (errors.length === 1) {
            throw errors[0]
        }
        if (errors.length > 1) {
            throw new Error(
                `${errors.length} cleanup tasks failed: ${errors.map((e) => e.message).join('; ')}`
            )
        }
        return total
    }
}
