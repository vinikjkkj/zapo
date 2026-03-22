import type { WaAuthCredentials } from '@auth/types'
import type { WaAuthClient } from '@auth/WaAuthClient'
import type { WaPassiveTasksCoordinator } from '@client/coordinators/WaPassiveTasksCoordinator'
import type { WaClientOptions } from '@client/types'
import type { Logger } from '@infra/log/types'
import type { WaMediaConn } from '@media/types'
import type { WaKeepAlive } from '@transport/keepalive/WaKeepAlive'
import type { WaNodeOrchestrator } from '@transport/node/WaNodeOrchestrator'
import type { WaNodeTransport } from '@transport/node/WaNodeTransport'
import { WaComms } from '@transport/WaComms'
import { toError } from '@util/primitives'

interface WaConnectionManagerOptions {
    readonly logger: Logger
    readonly options: Readonly<WaClientOptions>
    readonly authClient: WaAuthClient
    readonly keepAlive: WaKeepAlive
    readonly nodeOrchestrator: WaNodeOrchestrator
    readonly nodeTransport: WaNodeTransport
    readonly getPassiveTasks: () => WaPassiveTasksCoordinator | null
    readonly clearStoredCredentials: () => Promise<void>
}

export class WaConnectionManager {
    private readonly logger: Logger
    private readonly options: Readonly<WaClientOptions>
    private readonly authClient: WaAuthClient
    private readonly keepAlive: WaKeepAlive
    private readonly nodeOrchestrator: WaNodeOrchestrator
    private readonly nodeTransport: WaNodeTransport
    private readonly getPassiveTasks: () => WaPassiveTasksCoordinator | null
    private readonly clearStoredCredentialsCallback: () => Promise<void>
    private comms: WaComms | null
    private clockSkewMs: number | null
    private mediaConnCache: WaMediaConn | null
    private connectPromise: Promise<void> | null
    private pairingReconnectPromise: Promise<void> | null
    private frameHandler: ((frame: Uint8Array) => Promise<void>) | null
    private pendingComms: WaComms | null
    private lifecycleGeneration: number
    private lifecycleQueue: Promise<void>

    public constructor(options: WaConnectionManagerOptions) {
        this.logger = options.logger
        this.options = options.options
        this.authClient = options.authClient
        this.keepAlive = options.keepAlive
        this.nodeOrchestrator = options.nodeOrchestrator
        this.nodeTransport = options.nodeTransport
        this.getPassiveTasks = options.getPassiveTasks
        this.clearStoredCredentialsCallback = options.clearStoredCredentials
        this.comms = null
        this.clockSkewMs = null
        this.mediaConnCache = null
        this.connectPromise = null
        this.pairingReconnectPromise = null
        this.frameHandler = null
        this.pendingComms = null
        this.lifecycleGeneration = 0
        this.lifecycleQueue = Promise.resolve()
    }

    public async connect(frameHandler: (frame: Uint8Array) => Promise<void>): Promise<void> {
        if (this.connectPromise) {
            this.logger.trace('wa client connect already in-flight')
            return this.connectPromise
        }

        this.frameHandler = frameHandler
        const lifecycleGeneration = this.nextLifecycleGeneration()
        const operation = this.runLifecycleOperation(async () => {
            await this.connectInternal(frameHandler, lifecycleGeneration)
        })
        this.connectPromise = operation.finally(() => {
            if (this.connectPromise === operation) {
                this.connectPromise = null
            }
        })
        return this.connectPromise
    }

    public scheduleReconnectAfterPairing(): void {
        this.logger.debug('wa client scheduling reconnect after pairing')
        setTimeout(() => {
            void this.reconnectAsRegisteredAfterPairing().catch((error) => {
                if (this.isLifecycleSupersededError(error)) {
                    this.logger.trace('pairing reconnect canceled by newer lifecycle')
                    return
                }
                this.logger.warn('failed to reconnect after pairing', {
                    message: toError(error).message
                })
            })
        }, 0)
    }

    public async disconnect(): Promise<void> {
        const lifecycleGeneration = this.nextLifecycleGeneration()
        this.invalidatePendingComms('failed to stop pending comms during disconnect')
        await this.runLifecycleOperation(async () => {
            await this.disconnectInternal(lifecycleGeneration)
        })
    }

    public async clearStoredCredentials(): Promise<void> {
        await this.clearStoredCredentialsCallback()
    }

    public isConnected(): boolean {
        return !!(this.comms && this.comms.getCommsState().connected)
    }

    public getComms(): WaComms | null {
        return this.comms
    }

    public getClockSkewMs(): number | null {
        return this.clockSkewMs
    }

    public getMediaConnCache(): WaMediaConn | null {
        return this.mediaConnCache
    }

    public setMediaConnCache(value: WaMediaConn | null): void {
        this.mediaConnCache = value
    }

    public updateClockSkewFromSuccess(serverUnixSeconds: number): void {
        const serverMs = serverUnixSeconds * 1000
        const nowMs = Date.now()
        this.clockSkewMs = serverMs - nowMs
        this.logger.debug('updated clock skew from success', {
            serverUnixSeconds,
            clockSkewMs: this.clockSkewMs
        })
    }

    private async connectInternal(
        frameHandler: (frame: Uint8Array) => Promise<void>,
        lifecycleGeneration: number
    ): Promise<void> {
        this.assertLifecycleCurrent(lifecycleGeneration, 'connect')

        if (this.comms || this.pendingComms) {
            this.logger.trace('wa client connect skipped: comms already created')
            return
        }

        this.logger.info('wa client connect start')
        let credentials = await this.authClient.loadOrCreateCredentials()
        this.assertLifecycleCurrent(lifecycleGeneration, 'connect')

        try {
            await this.startCommsWithCredentials(credentials, frameHandler, lifecycleGeneration)
        } catch (error) {
            if (this.isLifecycleSupersededError(error)) {
                throw error
            }

            if (credentials.routingInfo) {
                this.logger.warn(
                    'connect failed with routing info, retrying without routing info',
                    {
                        message: toError(error).message
                    }
                )
                await this.disconnectInternal(lifecycleGeneration)
                this.assertLifecycleCurrent(lifecycleGeneration, 'connect')
                credentials = await this.authClient.clearRoutingInfo()
                this.assertLifecycleCurrent(lifecycleGeneration, 'connect')
                await this.startCommsWithCredentials(credentials, frameHandler, lifecycleGeneration)
            } else {
                await this.disconnectInternal(lifecycleGeneration)
                throw error
            }
        }

        this.assertLifecycleCurrent(lifecycleGeneration, 'connect')
        this.logger.info('wa client connected')
    }

    private async reconnectAsRegisteredAfterPairing(): Promise<void> {
        if (this.pairingReconnectPromise) {
            this.logger.trace('pairing reconnect already in-flight')
            return this.pairingReconnectPromise
        }

        const operation = this.runLifecycleOperation(async () => {
            await this.reconnectAsRegisteredAfterPairingInternal()
        })
        this.pairingReconnectPromise = operation.finally(() => {
            if (this.pairingReconnectPromise === operation) {
                this.pairingReconnectPromise = null
            }
        })
        return this.pairingReconnectPromise
    }

    private async reconnectAsRegisteredAfterPairingInternal(): Promise<void> {
        const frameHandler = this.frameHandler
        if (!frameHandler) {
            throw new Error('pairing reconnect requires an active frame handler')
        }

        const credentials = this.authClient.getCurrentCredentials()
        if (!credentials?.meJid) {
            this.logger.trace('pairing reconnect skipped: still unregistered')
            return
        }

        const currentComms = this.comms
        if (!currentComms) {
            this.logger.trace('pairing reconnect skipped: no active comms')
            return
        }

        const lifecycleGeneration = this.nextLifecycleGeneration()
        this.assertLifecycleCurrent(lifecycleGeneration, 'pairing reconnect')

        this.logger.info('pairing completed, restarting comms as registered')
        this.keepAlive.stop()
        this.nodeOrchestrator.clearPending(new Error('restarting comms after pairing'))
        this.clearCommsBinding(currentComms)
        await this.stopCommsQuietly(currentComms, 'failed to stop pre-registration comms')
        this.assertLifecycleCurrent(lifecycleGeneration, 'pairing reconnect')

        await this.startCommsWithCredentials(credentials, frameHandler, lifecycleGeneration)
        this.assertLifecycleCurrent(lifecycleGeneration, 'pairing reconnect')
    }

    private async disconnectInternal(lifecycleGeneration: number): Promise<void> {
        if (!this.isLifecycleCurrent(lifecycleGeneration)) {
            return
        }

        this.logger.info('wa client disconnect start')
        this.keepAlive.stop()
        this.nodeOrchestrator.clearPending(new Error('client disconnected'))
        this.clockSkewMs = null
        this.mediaConnCache = null
        this.frameHandler = null
        this.getPassiveTasks()?.resetInFlightState()

        const currentComms = this.comms
        const pendingComms = this.pendingComms
        this.pendingComms = null
        this.clearCommsBinding(currentComms ?? undefined)

        await this.authClient.clearTransientState()

        await Promise.all([
            pendingComms && pendingComms !== currentComms
                ? this.stopCommsQuietly(
                      pendingComms,
                      'failed to stop pending comms during disconnect'
                  )
                : Promise.resolve(),
            currentComms
                ? this.stopCommsQuietly(currentComms, 'failed to stop comms during disconnect')
                : Promise.resolve()
        ])

        if (this.isLifecycleCurrent(lifecycleGeneration)) {
            this.logger.info('wa client disconnected')
        }
    }

    private async startCommsWithCredentials(
        credentials: WaAuthCredentials,
        frameHandler: (frame: Uint8Array) => Promise<void>,
        lifecycleGeneration: number
    ): Promise<void> {
        this.assertLifecycleCurrent(lifecycleGeneration, 'start comms')

        this.logger.debug('starting comms with credentials', {
            registered: credentials.meJid !== null && credentials.meJid !== undefined
        })
        const commsConfig = this.authClient.buildCommsConfig(this.options)
        const comms = new WaComms(commsConfig, this.logger)
        this.pendingComms = comms

        this.mediaConnCache = null
        comms.startComms(async (frame) => frameHandler(frame))
        try {
            await comms.waitForConnection(commsConfig.connectTimeoutMs)
            this.assertLifecycleCurrent(lifecycleGeneration, 'start comms')
            if (this.pendingComms !== comms) {
                throw this.createLifecycleSupersededError('start comms')
            }

            this.comms = comms
            this.pendingComms = null
            this.nodeTransport.bindComms(comms)
            this.logger.info('comms connected')
            comms.startHandlingRequests()

            if (credentials.meJid) {
                this.keepAlive.start()
            } else {
                this.keepAlive.stop()
            }

            const serverStaticKey = comms.getServerStaticKey()
            if (!serverStaticKey) {
                this.logger.trace('no server static key available to persist')
            } else {
                await this.authClient.persistServerStaticKey(serverStaticKey)
                this.assertLifecycleCurrent(lifecycleGeneration, 'start comms')
                this.logger.debug('persisted server static key after comms connect')
            }

            this.getPassiveTasks()?.startPassiveTasksAfterConnect()
        } catch (error) {
            if (this.pendingComms === comms) {
                this.pendingComms = null
            }
            this.clearCommsBinding(comms)
            await this.stopCommsQuietly(
                comms,
                'failed to cleanup comms after connection start failure'
            )
            if (this.isLifecycleCurrent(lifecycleGeneration)) {
                throw error
            }
            throw this.createLifecycleSupersededError('start comms')
        }
    }

    private clearCommsBinding(expectedComms?: WaComms): void {
        if (expectedComms && this.comms && this.comms !== expectedComms) {
            return
        }
        this.comms = null
        this.nodeTransport.bindComms(null)
    }

    private async stopCommsQuietly(comms: WaComms, warningMessage: string): Promise<void> {
        try {
            await comms.stopComms()
        } catch (error) {
            this.logger.warn(warningMessage, {
                message: toError(error).message
            })
        }
    }

    private nextLifecycleGeneration(): number {
        this.lifecycleGeneration += 1
        return this.lifecycleGeneration
    }

    private runLifecycleOperation<T>(operation: () => Promise<T>): Promise<T> {
        const run = this.lifecycleQueue.then(operation, operation)
        this.lifecycleQueue = run.then(
            () => undefined,
            () => undefined
        )
        return run
    }

    private invalidatePendingComms(warningMessage: string): void {
        const pendingComms = this.pendingComms
        if (!pendingComms) {
            return
        }
        this.pendingComms = null
        void this.stopCommsQuietly(pendingComms, warningMessage)
    }

    private isLifecycleCurrent(lifecycleGeneration: number): boolean {
        return this.lifecycleGeneration === lifecycleGeneration
    }

    private assertLifecycleCurrent(lifecycleGeneration: number, context: string): void {
        if (this.isLifecycleCurrent(lifecycleGeneration)) {
            return
        }
        throw this.createLifecycleSupersededError(context)
    }

    private createLifecycleSupersededError(context: string): Error {
        return new Error(`${context} superseded by newer lifecycle`)
    }

    private isLifecycleSupersededError(error: unknown): boolean {
        return toError(error).message.includes('superseded by newer lifecycle')
    }
}
