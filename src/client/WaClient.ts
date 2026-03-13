import { EventEmitter } from 'node:events'

import type { WaAppStateStoreData, WaAppStateSyncResult } from '@appstate/types'
import type { WaAppStateSyncOptions } from '@appstate/types'
import { downloadExternalBlobReference } from '@appstate/utils'
import type { WaAppStateSyncClient } from '@appstate/WaAppStateSyncClient'
import type { WaAuthCredentials } from '@auth/types'
import type { WaAuthClient } from '@auth/WaAuthClient'
import type { WaGroupCoordinator } from '@client/coordinators/WaGroupCoordinator'
import type { WaIncomingNodeCoordinator } from '@client/coordinators/WaIncomingNodeCoordinator'
import type { WaMessageDispatchCoordinator } from '@client/coordinators/WaMessageDispatchCoordinator'
import type { WaPassiveTasksCoordinator } from '@client/coordinators/WaPassiveTasksCoordinator'
import { processHistorySyncNotification } from '@client/historysync'
import { persistIncomingMailboxEntities } from '@client/mailbox'
import type {
    WaClientEventMap,
    WaClientOptions,
    WaSendMessageOptions,
    WaIncomingProtocolMessageEvent,
    WaIncomingNodeHandlerRegistration,
    WaIncomingMessageEvent
} from '@client/types'
import {
    buildWaClientDependencies,
    resolveWaClientBase,
    type WaClientDependencyHost
} from '@client/WaClientFactory'
import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import type { Logger } from '@infra/log/types'
import type { WaMediaConn } from '@media/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import type {
    WaMessagePublishResult,
    WaSendMessageContent,
    WaSendReceiptInput
} from '@message/types'
import type { WaMessageClient } from '@message/WaMessageClient'
import { proto, type Proto } from '@proto'
import { WA_DEFAULTS, WA_MESSAGE_TAGS } from '@protocol/constants'
import type { WaAppStateStore } from '@store/contracts/appstate.store'
import type { WaContactStore } from '@store/contracts/contact.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import type { WaRetryStore } from '@store/contracts/retry.store'
import type { WaThreadStore } from '@store/contracts/thread.store'
import type { WaKeepAlive } from '@transport/keepalive/WaKeepAlive'
import { queryWithContext as queryNodeWithContext } from '@transport/node/query'
import type { WaNodeOrchestrator } from '@transport/node/WaNodeOrchestrator'
import type { WaNodeTransport } from '@transport/node/WaNodeTransport'
import type { BinaryNode } from '@transport/types'
import { WaComms } from '@transport/WaComms'
import { toError } from '@util/primitives'

const WA_DEFAULT_UV_THREADPOOL_SIZE = 4
const WA_RECOMMENDED_UV_THREADPOOL_SIZE = 16
let waThreadpoolHintLogged = false
type WaIncomingProtocolType = NonNullable<Proto.Message.IProtocolMessage['type']>
const SYNC_RELATED_PROTOCOL_TYPES = new Set<WaIncomingProtocolType>([
    proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_REQUEST,
    proto.Message.ProtocolMessage.Type.APP_STATE_FATAL_EXCEPTION_NOTIFICATION,
    proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE,
    proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE
])

function readUvThreadpoolSize(): number {
    const raw = process.env.UV_THREADPOOL_SIZE
    if (!raw) {
        return WA_DEFAULT_UV_THREADPOOL_SIZE
    }
    const parsed = Number(raw)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        return WA_DEFAULT_UV_THREADPOOL_SIZE
    }
    return parsed
}

export class WaClient extends EventEmitter {
    private readonly options!: Readonly<WaClientOptions>
    private readonly logger!: Logger
    private readonly appStateStore!: WaAppStateStore
    private readonly contactStore!: WaContactStore
    private readonly messageStore!: WaMessageStore
    private readonly retryStore!: WaRetryStore
    private readonly threadStore!: WaThreadStore
    private readonly authClient!: WaAuthClient
    private readonly nodeOrchestrator!: WaNodeOrchestrator
    private readonly keepAlive!: WaKeepAlive
    private readonly nodeTransport!: WaNodeTransport
    public readonly appStateSync!: WaAppStateSyncClient
    private readonly incomingNode!: WaIncomingNodeCoordinator
    private readonly passiveTasks!: WaPassiveTasksCoordinator
    public readonly mediaTransfer!: WaMediaTransferClient
    public readonly messageDispatch!: WaMessageDispatchCoordinator
    public readonly messageClient!: WaMessageClient
    public readonly groupCoordinator!: WaGroupCoordinator
    private clockSkewMs: number | null = null
    private mediaConnCache: WaMediaConn | null = null
    private comms: WaComms | null = null
    private pairingReconnectPromise: Promise<void> | null = null
    private connectPromise: Promise<void> | null = null
    private readonly danglingReceipts: BinaryNode[] = []

    public constructor(options: WaClientOptions, logger: Logger = new ConsoleLogger('info')) {
        super()

        const base = resolveWaClientBase(options, logger)
        this.options = base.options
        this.logger = base.logger
        this.appStateStore = base.sessionStore.appState
        this.contactStore = base.sessionStore.contacts
        this.messageStore = base.sessionStore.messages
        this.retryStore = base.sessionStore.retry
        this.threadStore = base.sessionStore.threads

        const host: WaClientDependencyHost = {
            sendNode: (node) => this.sendNode(node),
            query: (node, timeoutMs) => this.query(node, timeoutMs),
            queryWithContext: this.queryWithContext.bind(this),
            syncAppState: () => this.syncAppState().then(() => {}),
            emitEvent: this.emit.bind(this) as WaClientDependencyHost['emitEvent'],
            handleIncomingMessageEvent: this.handleIncomingMessageEvent.bind(this),
            handleError: this.handleError.bind(this),
            scheduleReconnectAfterPairing: this.scheduleReconnectAfterPairing.bind(this),
            updateClockSkewFromSuccess: this.updateClockSkewFromSuccess.bind(this),
            getComms: () => this.comms,
            getMediaConnCache: () => this.mediaConnCache,
            setMediaConnCache: (mediaConn) => {
                this.mediaConnCache = mediaConn
            },
            disconnect: this.disconnect.bind(this),
            clearStoredState: this.clearStoredState.bind(this),
            connect: this.connect.bind(this),
            shouldQueueDanglingReceipt: (node, error) =>
                this.shouldQueueDanglingReceipt(node, error),
            enqueueDanglingReceipt: this.enqueueDanglingReceipt.bind(this),
            takeDanglingReceipts: () => this.danglingReceipts.splice(0)
        }
        const dependencies = buildWaClientDependencies({
            base,
            host
        })
        Object.assign(this, dependencies)

        this.bindNodeTransportEvents()
        this.logThreadpoolHintIfNeeded()
    }

    private logThreadpoolHintIfNeeded(): void {
        if (waThreadpoolHintLogged) {
            return
        }
        waThreadpoolHintLogged = true
        const configuredSize = readUvThreadpoolSize()
        if (configuredSize >= WA_RECOMMENDED_UV_THREADPOOL_SIZE) {
            return
        }
        this.logger.info(
            'crypto throughput hint: increase UV_THREADPOOL_SIZE for multi-session workloads',
            {
                uvThreadpoolSize: configuredSize,
                recommendedAtLeast: WA_RECOMMENDED_UV_THREADPOOL_SIZE
            }
        )
    }

    public override on<K extends keyof WaClientEventMap>(
        event: K,
        listener: WaClientEventMap[K]
    ): this {
        return super.on(event, listener as (...args: unknown[]) => void)
    }

    public override once<K extends keyof WaClientEventMap>(
        event: K,
        listener: WaClientEventMap[K]
    ): this {
        return super.once(event, listener as (...args: unknown[]) => void)
    }

    public override off<K extends keyof WaClientEventMap>(
        event: K,
        listener: WaClientEventMap[K]
    ): this {
        return super.off(event, listener as (...args: unknown[]) => void)
    }

    public override emit<K extends keyof WaClientEventMap>(
        event: K,
        ...args: Parameters<WaClientEventMap[K]>
    ): boolean {
        return super.emit(event, ...args)
    }

    public getState() {
        const connected = this.comms !== null && this.comms.getCommsState().connected
        this.logger.trace('wa client state requested', { connected })
        return this.authClient.getState(connected)
    }

    public getCredentials() {
        return this.authClient.getCurrentCredentials()
    }

    public getClockSkewMs(): number | null {
        return this.clockSkewMs
    }

    public async sendNode(node: BinaryNode): Promise<void> {
        this.logger.trace('wa client sendNode', { tag: node.tag, id: node.attrs.id })
        try {
            await this.nodeOrchestrator.sendNode(node)
        } catch (error) {
            const normalized = toError(error)
            if (this.shouldQueueDanglingReceipt(node, normalized)) {
                this.enqueueDanglingReceipt(node)
                this.logger.warn('queued dangling receipt after send failure', {
                    id: node.attrs.id,
                    to: node.attrs.to,
                    message: normalized.message,
                    queueSize: this.danglingReceipts.length
                })
                return
            }
            throw normalized
        }
    }

    public async query(
        node: BinaryNode,
        timeoutMs: number = this.options.iqTimeoutMs ?? WA_DEFAULTS.IQ_TIMEOUT_MS
    ): Promise<BinaryNode> {
        if (!this.comms || !this.comms.getCommsState().connected) {
            throw new Error('client is not connected')
        }
        this.logger.debug('wa client query', { tag: node.tag, id: node.attrs.id, timeoutMs })
        return this.nodeOrchestrator.query(node, timeoutMs)
    }

    public registerIncomingHandler(registration: WaIncomingNodeHandlerRegistration): () => void {
        return this.incomingNode.registerIncomingHandler(registration)
    }

    public unregisterIncomingHandler(registration: WaIncomingNodeHandlerRegistration): boolean {
        return this.incomingNode.unregisterIncomingHandler(registration)
    }

    private bindNodeTransportEvents(): void {
        this.nodeTransport.on('frame_in', (frame) => this.emit('frame_in', frame))
        this.nodeTransport.on('frame_out', (frame) => this.emit('frame_out', frame))
        this.nodeTransport.on('node_in', (node, frame) => this.emit('node_in', node, frame))
        this.nodeTransport.on('node_out', (node, frame) => this.emit('node_out', node, frame))
        this.nodeTransport.on('decode_error', (error, frame) => {
            this.emit('decode_error', error, frame)
            this.handleError(error)
        })
    }

    private async handleIncomingMessageEvent(event: WaIncomingMessageEvent): Promise<void> {
        this.emit('incoming_message', event)
        void persistIncomingMailboxEntities({
            logger: this.logger,
            contactStore: this.contactStore,
            messageStore: this.messageStore,
            event
        })
        const protocolMessage = event.message?.protocolMessage
        if (!protocolMessage) {
            return
        }
        const protocolEvent: WaIncomingProtocolMessageEvent = {
            ...event,
            protocolMessage
        }
        this.emit('incoming_protocol_message', protocolEvent)

        const protocolType = protocolMessage.type
        if (protocolType === null || protocolType === undefined) {
            this.logger.debug('incoming protocol message without type', {
                id: event.id,
                from: event.from
            })
            return
        }

        if (protocolType === proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_SHARE) {
            await this.handleIncomingAppStateSyncKeyShare(event, protocolMessage)
            return
        }

        if (protocolType === proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION) {
            if (this.options.history?.enabled && protocolMessage.historySyncNotification) {
                await this.handleHistorySyncNotification(protocolMessage.historySyncNotification)
            }
            return
        }

        if (SYNC_RELATED_PROTOCOL_TYPES.has(protocolType)) {
            this.logger.info('incoming sync-related protocol message', {
                id: event.id,
                from: event.from,
                protocolType
            })
            return
        }

        this.logger.debug('incoming protocol message received', {
            id: event.id,
            from: event.from,
            protocolType
        })
    }

    private async handleIncomingAppStateSyncKeyShare(
        event: WaIncomingMessageEvent,
        protocolMessage: Proto.Message.IProtocolMessage
    ): Promise<void> {
        const share = protocolMessage.appStateSyncKeyShare
        if (!share) {
            this.logger.warn('incoming app-state key share protocol message without payload', {
                id: event.id,
                from: event.from
            })
            return
        }

        try {
            const imported = await this.appStateSync.importSyncKeyShare(share)
            this.logger.info('imported app-state sync key share from protocol message', {
                id: event.id,
                from: event.from,
                imported
            })
        } catch (error) {
            this.logger.warn('failed to import app-state sync key share from protocol message', {
                id: event.id,
                from: event.from,
                message: toError(error).message
            })
        }
    }

    private async handleHistorySyncNotification(
        notification: Proto.Message.IHistorySyncNotification
    ): Promise<void> {
        try {
            await processHistorySyncNotification(
                {
                    logger: this.logger,
                    mediaTransfer: this.mediaTransfer,
                    contactStore: this.contactStore,
                    messageStore: this.messageStore,
                    threadStore: this.threadStore,
                    emitEvent: this.emit.bind(this) as Parameters<
                        typeof processHistorySyncNotification
                    >[0]['emitEvent']
                },
                notification
            )
        } catch (error) {
            this.logger.warn('failed to process history sync notification', {
                syncType: notification.syncType,
                chunkOrder: notification.chunkOrder,
                message: toError(error).message
            })
        }
    }

    private async queryWithContext(
        context: string,
        node: BinaryNode,
        timeoutMs: number = this.options.iqTimeoutMs ?? WA_DEFAULTS.IQ_TIMEOUT_MS,
        contextData: Readonly<Record<string, unknown>> = {}
    ): Promise<BinaryNode> {
        return queryNodeWithContext(
            async (queryNode, queryTimeoutMs) => this.query(queryNode, queryTimeoutMs),
            this.logger,
            context,
            node,
            timeoutMs,
            contextData
        )
    }

    private async handleIncomingFrame(frame: Uint8Array): Promise<void> {
        try {
            await this.nodeTransport.dispatchIncomingFrame(frame, async (node) =>
                this.incomingNode.handleIncomingNode(node)
            )
        } catch (error) {
            this.handleError(toError(error))
        }
    }

    public async connect(): Promise<void> {
        if (this.connectPromise) {
            this.logger.trace('wa client connect already in-flight')
            return this.connectPromise
        }
        this.connectPromise = this.connectInternal().finally(() => {
            this.connectPromise = null
        })
        return this.connectPromise
    }

    private async connectInternal(): Promise<void> {
        if (this.comms) {
            this.logger.trace('wa client connect skipped: comms already created')
            return
        }

        this.logger.info('wa client connect start')
        let credentials = await this.authClient.loadOrCreateCredentials()
        try {
            await this.startCommsWithCredentials(credentials)
        } catch (error) {
            if (credentials.routingInfo) {
                this.logger.warn(
                    'connect failed with routing info, retrying without routing info',
                    {
                        message: toError(error).message
                    }
                )
                await this.disconnect()
                credentials = await this.authClient.clearRoutingInfo()
                await this.startCommsWithCredentials(credentials)
            } else {
                await this.disconnect()
                throw error
            }
        }
        this.logger.info('wa client connected')
        this.emit('connected')
    }

    private scheduleReconnectAfterPairing(): void {
        this.logger.debug('wa client scheduling reconnect after pairing')
        setTimeout(() => {
            void this.reconnectAsRegisteredAfterPairing().catch((error) => {
                this.handleError(toError(error))
            })
        }, 0)
    }

    private async reconnectAsRegisteredAfterPairing(): Promise<void> {
        if (this.pairingReconnectPromise) {
            this.logger.trace('pairing reconnect already in-flight')
            return this.pairingReconnectPromise
        }
        this.pairingReconnectPromise = this.reconnectAsRegisteredAfterPairingInternal().finally(
            () => {
                this.pairingReconnectPromise = null
            }
        )
        return this.pairingReconnectPromise
    }

    private async reconnectAsRegisteredAfterPairingInternal(): Promise<void> {
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

        this.logger.info('pairing completed, restarting comms as registered')
        this.keepAlive.stop()
        this.nodeOrchestrator.clearPending(new Error('restarting comms after pairing'))
        this.clearCommsBinding()
        try {
            await currentComms.stopComms()
        } catch (error) {
            this.logger.warn('failed to stop pre-registration comms', {
                message: toError(error).message
            })
        }
        try {
            await this.startCommsWithCredentials(credentials)
        } catch (error) {
            this.logger.warn('pairing reconnect failed while starting registered comms', {
                message: toError(error).message
            })
            throw error
        }
    }

    public async disconnect(): Promise<void> {
        this.logger.info('wa client disconnect start')
        this.keepAlive.stop()
        await this.authClient.clearTransientState()
        this.nodeOrchestrator.clearPending(new Error('client disconnected'))
        this.clockSkewMs = null
        this.mediaConnCache = null
        this.passiveTasks.resetInFlightState()

        const comms = this.comms
        this.clearCommsBinding()
        if (comms) {
            await comms.stopComms()
            this.logger.info('wa client disconnected')
            this.emit('disconnected')
        }
    }

    public async requestPairingCode(
        phoneNumber: string,
        shouldShowPushNotification = false
    ): Promise<string> {
        if (!this.comms || !this.authClient.getCurrentCredentials()) {
            throw new Error('client is not connected')
        }
        this.logger.debug('wa client request pairing code')
        return this.authClient.requestPairingCode(phoneNumber, shouldShowPushNotification)
    }

    public async fetchPairingCountryCodeIso(): Promise<string> {
        if (!this.comms || !this.authClient.getCurrentCredentials()) {
            throw new Error('client is not connected')
        }
        this.logger.trace('wa client fetch pairing country code iso')
        return this.authClient.fetchPairingCountryCodeIso()
    }

    public async sendMessage(
        to: string,
        content: WaSendMessageContent,
        options: WaSendMessageOptions = {}
    ): Promise<WaMessagePublishResult> {
        return this.messageDispatch.sendMessage(to, content, options)
    }

    public async syncSignalSession(jid: string, reasonIdentity = false): Promise<void> {
        await this.messageDispatch.syncSignalSession(jid, reasonIdentity)
    }

    public async sendReceipt(input: WaSendReceiptInput): Promise<void> {
        await this.messageDispatch.sendReceipt(input)
    }

    public async exportAppState(): Promise<WaAppStateStoreData> {
        return this.appStateSync.exportState()
    }

    public async syncAppState(options: WaAppStateSyncOptions = {}): Promise<WaAppStateSyncResult> {
        if (!this.comms) {
            throw new Error('client is not connected')
        }
        if (options.downloadExternalBlob) {
            return this.appStateSync.sync(options)
        }
        return this.appStateSync.sync({
            ...options,
            downloadExternalBlob: async (_collection, _kind, reference) =>
                downloadExternalBlobReference(this.mediaTransfer, reference)
        })
    }

    private async startCommsWithCredentials(credentials: WaAuthCredentials): Promise<void> {
        this.logger.debug('starting comms with credentials', {
            registered: credentials.meJid !== null && credentials.meJid !== undefined
        })
        const commsConfig = this.authClient.buildCommsConfig(this.options)
        const comms = new WaComms(commsConfig, this.logger)
        this.mediaConnCache = null
        this.nodeTransport.bindComms(comms)
        try {
            comms.startComms(async (frame) => this.handleIncomingFrame(frame))
            await comms.waitForConnection(commsConfig.connectTimeoutMs)
            this.comms = comms
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
                this.logger.debug('persisted server static key after comms connect')
            }
            this.passiveTasks.startPassiveTasksAfterConnect()
        } catch (error) {
            this.clearCommsBinding()
            try {
                await comms.stopComms()
            } catch (stopError) {
                this.logger.warn('failed to cleanup comms after connection start failure', {
                    message: toError(stopError).message
                })
            }
            throw error
        }
    }

    private shouldQueueDanglingReceipt(node: BinaryNode, error: Error): boolean {
        if (node.tag !== WA_MESSAGE_TAGS.RECEIPT) {
            return false
        }
        const normalized = error.message.trim().toLowerCase()
        return (
            normalized === 'comms is not connected' ||
            normalized === 'websocket is not connected' ||
            normalized === 'noise session socket closed' ||
            normalized.startsWith('socket closed (')
        )
    }

    private enqueueDanglingReceipt(node: BinaryNode): void {
        if (this.danglingReceipts.length >= WA_DEFAULTS.MAX_DANGLING_RECEIPTS) {
            this.danglingReceipts.shift()
        }
        this.danglingReceipts.push(
            node.content === undefined
                ? {
                      tag: node.tag,
                      attrs: { ...node.attrs }
                  }
                : {
                      tag: node.tag,
                      attrs: { ...node.attrs },
                      content: node.content
                  }
        )
    }

    private async clearStoredState(): Promise<void> {
        await this.authClient.clearStoredCredentials()
        await Promise.all([
            this.appStateStore.clear(),
            this.contactStore.clear(),
            this.messageStore.clear(),
            this.retryStore.clear(),
            this.threadStore.clear()
        ])
    }

    private handleError(error: Error): void {
        this.logger.error('wa client error', { message: error.message })
        this.emit('error', error)
    }

    private clearCommsBinding(): void {
        this.comms = null
        this.nodeTransport.bindComms(null)
    }

    private updateClockSkewFromSuccess(serverUnixSeconds: number): void {
        const serverMs = serverUnixSeconds * 1000
        const nowMs = Date.now()
        this.clockSkewMs = serverMs - nowMs
        this.logger.debug('updated clock skew from success', {
            serverUnixSeconds,
            clockSkewMs: this.clockSkewMs
        })
    }
}
