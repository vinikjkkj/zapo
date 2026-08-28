import type { WaOfflineResumeEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { buildOfflineBatchNode } from '@transport/node/builders/offline'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

const WA_OFFLINE_RESUME = Object.freeze({
    BATCH_SIZE: 200,
    REQUEST_DEBOUNCE_MS: 100,
    MAX_BATCH_RETRIES: 3,
    STANZA_TIMEOUT_MS: 60_000
} as const)

const WA_OFFLINE_RESUME_STATE = Object.freeze({
    INIT: 'init',
    RESUMING: 'resuming',
    COMPLETE: 'complete'
} as const)

type WaOfflineResumeState = (typeof WA_OFFLINE_RESUME_STATE)[keyof typeof WA_OFFLINE_RESUME_STATE]

interface WaOfflineResumeRuntime {
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly emitOfflineResume: (event: WaOfflineResumeEvent) => void
}

interface WaOfflineResumeCoordinatorOptions {
    readonly logger: Logger
    readonly runtime: WaOfflineResumeRuntime
}

export class WaOfflineResumeCoordinator {
    private readonly logger: Logger
    private readonly runtime: WaOfflineResumeRuntime
    private state: WaOfflineResumeState
    private totalStanzas: number
    private pendingStanzas: number
    private batchInFlight: boolean
    private batchRetries: number
    private resumeGeneration: number
    private lastBatchRequestMs: number
    private batchTimeout: ReturnType<typeof setTimeout> | null
    private stanzaTimeout: ReturnType<typeof setTimeout> | null

    public constructor(options: WaOfflineResumeCoordinatorOptions) {
        this.logger = options.logger
        this.runtime = options.runtime
        this.state = WA_OFFLINE_RESUME_STATE.INIT
        this.totalStanzas = 0
        this.pendingStanzas = 0
        this.batchInFlight = false
        this.batchRetries = 0
        this.resumeGeneration = 0
        this.lastBatchRequestMs = 0
        this.batchTimeout = null
        this.stanzaTimeout = null
    }

    public get isComplete(): boolean {
        return this.state === WA_OFFLINE_RESUME_STATE.COMPLETE
    }

    public get isResuming(): boolean {
        return this.state === WA_OFFLINE_RESUME_STATE.RESUMING
    }

    public handleOfflinePreview(stanzaCount: number): void {
        this.clearTimers()
        this.state = WA_OFFLINE_RESUME_STATE.RESUMING
        this.totalStanzas = stanzaCount
        this.pendingStanzas = stanzaCount
        this.batchInFlight = false
        this.batchRetries = 0
        this.resumeGeneration += 1
        this.lastBatchRequestMs = 0
        this.logger.info('offline resume started', {
            totalStanzas: stanzaCount
        })
        this.runtime.emitOfflineResume({
            status: 'resuming',
            totalStanzas: stanzaCount,
            remainingStanzas: stanzaCount,
            forced: false
        })
        this.requestOfflineBatch()
        this.resetStanzaTimeout()
    }

    public handleOfflineComplete(serverStanzaCount: number): void {
        if (this.state !== WA_OFFLINE_RESUME_STATE.RESUMING) {
            return
        }
        this.completeResume(false, serverStanzaCount)
    }

    public trackOfflineStanza(): void {
        if (this.state !== WA_OFFLINE_RESUME_STATE.RESUMING) {
            return
        }
        this.pendingStanzas = Math.max(0, this.pendingStanzas - 1)
        this.batchInFlight = false
        this.resetStanzaTimeout()
        this.scheduleNextBatch()
    }

    public reset(): void {
        this.clearTimers()
        this.state = WA_OFFLINE_RESUME_STATE.INIT
        this.totalStanzas = 0
        this.pendingStanzas = 0
        this.batchInFlight = false
        this.batchRetries = 0
        this.resumeGeneration += 1
        this.lastBatchRequestMs = 0
    }

    private completeResume(forced: boolean, serverStanzaCount?: number): void {
        this.clearTimers()
        this.state = WA_OFFLINE_RESUME_STATE.COMPLETE
        this.batchInFlight = false
        this.logger.info('offline resume complete', {
            totalStanzas: this.totalStanzas,
            remainingStanzas: this.pendingStanzas,
            serverStanzaCount,
            forced
        })
        this.runtime.emitOfflineResume({
            status: 'complete',
            totalStanzas: this.totalStanzas,
            remainingStanzas: this.pendingStanzas,
            forced
        })
    }

    /**
     * Ask the server for the next window of queued stanzas, at most one request
     * per `REQUEST_DEBOUNCE_MS` and never while one is still outstanding. Only a
     * delivered stanza schedules a request, so the loop winds down on its own
     * once the queue dries up; the resume itself ends on the terminal `offline`
     * bulletin or on the stanza timeout, never on the preview counter, which is
     * a progress estimate rather than an authoritative total.
     */
    private scheduleNextBatch(): void {
        if (this.batchInFlight || this.batchTimeout !== null) {
            return
        }
        const elapsedMs = Date.now() - this.lastBatchRequestMs
        if (elapsedMs >= WA_OFFLINE_RESUME.REQUEST_DEBOUNCE_MS) {
            this.requestOfflineBatch()
            return
        }
        this.batchTimeout = setTimeout(() => {
            this.batchTimeout = null
            if (this.state === WA_OFFLINE_RESUME_STATE.RESUMING) {
                this.scheduleNextBatch()
            }
        }, WA_OFFLINE_RESUME.REQUEST_DEBOUNCE_MS - elapsedMs)
    }

    private requestOfflineBatch(): void {
        this.batchInFlight = true
        this.lastBatchRequestMs = Date.now()
        this.logger.debug('offline batch requested', {
            batchSize: WA_OFFLINE_RESUME.BATCH_SIZE,
            remainingStanzas: this.pendingStanzas
        })
        void this.sendOfflineBatch(this.resumeGeneration)
    }

    /**
     * A rejected request delivers no stanza, and only a delivered stanza
     * schedules the next one, so without a retry here a single transport blip
     * strands the whole queue until the stanza timeout. `generation` pins the
     * outcome to the resume that issued it: a rejection from a torn-down resume
     * must not clear the current one's in-flight flag or retry on its behalf.
     */
    private async sendOfflineBatch(generation: number): Promise<void> {
        try {
            await this.runtime.sendNode(buildOfflineBatchNode(WA_OFFLINE_RESUME.BATCH_SIZE))
            if (generation === this.resumeGeneration) {
                this.batchRetries = 0
            }
        } catch (err: unknown) {
            if (
                generation !== this.resumeGeneration ||
                this.state !== WA_OFFLINE_RESUME_STATE.RESUMING
            ) {
                return
            }
            this.batchInFlight = false
            this.batchRetries += 1
            if (this.batchRetries > WA_OFFLINE_RESUME.MAX_BATCH_RETRIES) {
                this.logger.warn('offline batch request failed, giving up', {
                    attempts: this.batchRetries,
                    remainingStanzas: this.pendingStanzas,
                    message: toError(err).message
                })
                return
            }
            this.logger.debug('offline batch request failed, retrying', {
                attempt: this.batchRetries,
                message: toError(err).message
            })
            this.scheduleNextBatch()
        }
    }

    private resetStanzaTimeout(): void {
        if (this.stanzaTimeout !== null) {
            clearTimeout(this.stanzaTimeout)
        }
        this.stanzaTimeout = setTimeout(() => {
            this.stanzaTimeout = null
            if (this.state === WA_OFFLINE_RESUME_STATE.RESUMING) {
                this.logger.warn('offline resume forced complete due to stanza timeout', {
                    totalStanzas: this.totalStanzas,
                    remainingStanzas: this.pendingStanzas
                })
                this.completeResume(true)
            }
        }, WA_OFFLINE_RESUME.STANZA_TIMEOUT_MS)
    }

    private clearTimers(): void {
        if (this.stanzaTimeout !== null) {
            clearTimeout(this.stanzaTimeout)
            this.stanzaTimeout = null
        }
        if (this.batchTimeout !== null) {
            clearTimeout(this.batchTimeout)
            this.batchTimeout = null
        }
    }
}
