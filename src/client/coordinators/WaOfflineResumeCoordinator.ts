import type { WaOfflineResumeEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { buildOfflineBatchNode } from '@transport/node/builders/offline'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

const WA_OFFLINE_RESUME = Object.freeze({
    BATCH_SIZE: 200,
    BATCH_DEBOUNCE_MS: 100,
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
    private totalMessages: number
    private pendingMessages: number
    private batchInFlight: boolean
    private batchDebounce: ReturnType<typeof setTimeout> | null
    private stanzaTimeout: ReturnType<typeof setTimeout> | null

    public constructor(options: WaOfflineResumeCoordinatorOptions) {
        this.logger = options.logger
        this.runtime = options.runtime
        this.state = WA_OFFLINE_RESUME_STATE.INIT
        this.totalMessages = 0
        this.pendingMessages = 0
        this.batchInFlight = false
        this.batchDebounce = null
        this.stanzaTimeout = null
    }

    public get isComplete(): boolean {
        return this.state === WA_OFFLINE_RESUME_STATE.COMPLETE
    }

    public get isResuming(): boolean {
        return this.state === WA_OFFLINE_RESUME_STATE.RESUMING
    }

    public handleOfflinePreview(messageCount: number): void {
        this.clearTimers()
        this.state = WA_OFFLINE_RESUME_STATE.RESUMING
        this.totalMessages = messageCount
        this.pendingMessages = messageCount
        this.batchInFlight = false
        this.logger.info('offline resume started', {
            totalMessages: messageCount
        })
        this.runtime.emitOfflineResume({
            status: 'resuming',
            totalMessages: messageCount,
            remainingMessages: messageCount,
            forced: false
        })
        this.resetBatchDebounce()
        this.resetStanzaTimeout()
    }

    public handleOfflineComplete(): void {
        if (this.state !== WA_OFFLINE_RESUME_STATE.RESUMING) {
            return
        }
        this.completeResume(false)
    }

    public trackOfflineStanza(): void {
        if (this.state !== WA_OFFLINE_RESUME_STATE.RESUMING) {
            return
        }
        this.pendingMessages = Math.max(0, this.pendingMessages - 1)
        this.resetBatchDebounce()
        this.resetStanzaTimeout()
    }

    public reset(): void {
        this.clearTimers()
        this.state = WA_OFFLINE_RESUME_STATE.INIT
        this.totalMessages = 0
        this.pendingMessages = 0
        this.batchInFlight = false
    }

    private completeResume(forced: boolean): void {
        this.clearTimers()
        this.state = WA_OFFLINE_RESUME_STATE.COMPLETE
        this.logger.info('offline resume complete', {
            totalMessages: this.totalMessages,
            remainingMessages: this.pendingMessages,
            forced
        })
        this.runtime.emitOfflineResume({
            status: 'complete',
            totalMessages: this.totalMessages,
            remainingMessages: this.pendingMessages,
            forced
        })
    }

    private resetBatchDebounce(): void {
        if (this.batchDebounce !== null) {
            clearTimeout(this.batchDebounce)
        }
        this.batchDebounce = setTimeout(() => {
            this.batchDebounce = null
            if (this.state === WA_OFFLINE_RESUME_STATE.RESUMING && !this.batchInFlight) {
                void this.sendOfflineBatch()
            }
        }, WA_OFFLINE_RESUME.BATCH_DEBOUNCE_MS)
    }

    private async sendOfflineBatch(): Promise<void> {
        if (this.state !== WA_OFFLINE_RESUME_STATE.RESUMING || this.batchInFlight) {
            return
        }
        this.batchInFlight = true
        try {
            await this.runtime.sendNode(buildOfflineBatchNode(WA_OFFLINE_RESUME.BATCH_SIZE))
            this.logger.debug('sent offline batch request', {
                pending: this.pendingMessages
            })
        } catch (err: unknown) {
            this.logger.warn('offline batch request failed', {
                message: toError(err).message
            })
        } finally {
            this.batchInFlight = false
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
                    totalMessages: this.totalMessages,
                    remainingMessages: this.pendingMessages
                })
                this.completeResume(true)
            }
        }, WA_OFFLINE_RESUME.STANZA_TIMEOUT_MS)
    }

    private clearTimers(): void {
        if (this.batchDebounce !== null) {
            clearTimeout(this.batchDebounce)
            this.batchDebounce = null
        }
        if (this.stanzaTimeout !== null) {
            clearTimeout(this.stanzaTimeout)
            this.stanzaTimeout = null
        }
    }
}
