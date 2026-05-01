import type { WaOfflineResumeEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { buildOfflineBatchNode } from '@transport/node/builders/offline'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

const WA_OFFLINE_RESUME = Object.freeze({
    BATCH_SIZE: 200,
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
    private stanzaTimeout: ReturnType<typeof setTimeout> | null

    public constructor(options: WaOfflineResumeCoordinatorOptions) {
        this.logger = options.logger
        this.runtime = options.runtime
        this.state = WA_OFFLINE_RESUME_STATE.INIT
        this.totalStanzas = 0
        this.pendingStanzas = 0
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
        this.logger.info('offline resume started', {
            totalStanzas: stanzaCount
        })
        this.runtime.emitOfflineResume({
            status: 'resuming',
            totalStanzas: stanzaCount,
            remainingStanzas: stanzaCount,
            forced: false
        })
        void this.sendOfflineBatch()
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
        this.resetStanzaTimeout()
    }

    public reset(): void {
        this.clearTimers()
        this.state = WA_OFFLINE_RESUME_STATE.INIT
        this.totalStanzas = 0
        this.pendingStanzas = 0
    }

    private completeResume(forced: boolean, serverStanzaCount?: number): void {
        this.clearTimers()
        this.state = WA_OFFLINE_RESUME_STATE.COMPLETE
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

    private async sendOfflineBatch(): Promise<void> {
        try {
            await this.runtime.sendNode(buildOfflineBatchNode(WA_OFFLINE_RESUME.BATCH_SIZE))
        } catch (err: unknown) {
            this.logger.warn('offline batch request failed', {
                message: toError(err).message
            })
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
    }
}
