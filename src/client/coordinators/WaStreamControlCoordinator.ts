import type { Logger } from '../../infra/log/types'
import { handleParsedStreamControl } from '../../transport/stream/handlers'
import type { WaStreamControlNodeResult } from '../../transport/stream/parse'
import type { WaComms } from '../../transport/WaComms'
import { toError } from '../../util/primitives'

interface WaStreamControlCoordinatorOptions {
    readonly logger: Logger
    readonly getComms: () => WaComms | null
    readonly clearPendingQueries: (error: Error) => void
    readonly clearMediaConnCache: () => void
    readonly disconnect: () => Promise<void>
    readonly clearStoredCredentials: () => Promise<void>
    readonly connect: () => Promise<void>
}

export class WaStreamControlCoordinator {
    private readonly logger: Logger
    private readonly getComms: () => WaComms | null
    private readonly clearPendingQueries: (error: Error) => void
    private readonly clearMediaConnCache: () => void
    private readonly disconnect: () => Promise<void>
    private readonly clearStoredCredentials: () => Promise<void>
    private readonly connect: () => Promise<void>
    private lifecyclePromise: Promise<void> | null

    public constructor(options: WaStreamControlCoordinatorOptions) {
        this.logger = options.logger
        this.getComms = options.getComms
        this.clearPendingQueries = options.clearPendingQueries
        this.clearMediaConnCache = options.clearMediaConnCache
        this.disconnect = options.disconnect
        this.clearStoredCredentials = options.clearStoredCredentials
        this.connect = options.connect
        this.lifecyclePromise = null
    }

    public async handleStreamControlResult(result: WaStreamControlNodeResult): Promise<void> {
        await handleParsedStreamControl(result, {
            logger: this.logger,
            forceLoginDueToStreamError: async (code) => this.forceLoginDueToStreamError(code),
            logoutDueToStreamError: async (reason, shouldRestartBackend) =>
                this.logoutDueToStreamError(reason, shouldRestartBackend),
            disconnectDueToStreamError: async (reason) => this.disconnectDueToStreamError(reason),
            resumeSocketDueToStreamError: async (reason) =>
                this.resumeSocketDueToStreamError(reason)
        })
    }

    private async resumeSocketDueToStreamError(reason: string): Promise<void> {
        const comms = this.getComms()
        if (!comms) {
            return
        }
        this.logger.info('resuming socket due to stream control node', { reason })
        this.clearPendingQueries(new Error(`socket resume requested by ${reason}`))
        this.clearMediaConnCache()
        try {
            await comms.closeSocketAndResume()
        } catch (error) {
            this.logger.warn('failed to resume socket for stream control node', {
                reason,
                message: toError(error).message
            })
        }
    }

    private async forceLoginDueToStreamError(code: number): Promise<void> {
        await this.runStreamControlLifecycle(`stream_error_code_${code}`, async () => {
            this.logger.warn('received forced login stream error; starting login lifecycle', {
                code
            })
            await this.disconnect()
            await this.clearStoredCredentials()
            await this.restartBackendAfterStreamControl(`stream_error_code_${code}`)
        })
    }

    private async disconnectDueToStreamError(reason: string): Promise<void> {
        this.logger.warn('disconnecting due to stream control node', { reason })
        await this.disconnect()
    }

    private async logoutDueToStreamError(
        reason: string,
        shouldRestartBackend: boolean
    ): Promise<void> {
        await this.runStreamControlLifecycle(reason, async () => {
            this.logger.warn('logging out due to stream control node', {
                reason,
                shouldRestartBackend
            })
            await this.disconnect()
            await this.clearStoredCredentials()
            if (shouldRestartBackend) {
                await this.restartBackendAfterStreamControl(reason)
            }
        })
    }

    private async runStreamControlLifecycle(
        reason: string,
        action: () => Promise<void>
    ): Promise<void> {
        if (this.lifecyclePromise) {
            this.logger.debug('stream-control lifecycle already running', { reason })
            return this.lifecyclePromise
        }
        this.lifecyclePromise = action().finally(() => {
            this.lifecyclePromise = null
        })
        return this.lifecyclePromise
    }

    private async restartBackendAfterStreamControl(reason: string): Promise<void> {
        this.logger.info('restarting backend after stream control', { reason })
        try {
            await this.connect()
        } catch (error) {
            this.logger.warn('failed to restart backend after stream control', {
                reason,
                message: toError(error).message
            })
        }
    }
}
