import { EventEmitter } from 'node:events'

import type { WaAppStateStoreData, WaAppStateSyncResult } from '../appstate/types'
import type { WaAppStateSyncOptions } from '../appstate/types'
import { downloadExternalBlobReference } from '../appstate/utils'
import { WaAppStateSyncClient } from '../appstate/WaAppStateSyncClient'
import { DEFAULT_DEVICE_PLATFORM, HOST_DOMAIN } from '../auth/client.constants'
import { WaPairingCodeCrypto } from '../auth/pairing/WaPairingCodeCrypto'
import type { WaAuthCredentials, WaSuccessPersistAttributes } from '../auth/types'
import { WaAuthClient } from '../auth/WaAuthClient'
import { X25519 } from '../crypto/curves/X25519'
import { ConsoleLogger } from '../infra/log/ConsoleLogger'
import type { Logger } from '../infra/log/types'
import type { WaMediaConn } from '../media/types'
import { WaMediaCrypto } from '../media/WaMediaCrypto'
import { WaMediaTransferClient } from '../media/WaMediaTransferClient'
import { RECEIPT_NODE_TAG } from '../message/constants'
import { handleIncomingMessageAck } from '../message/incoming'
import type {
    WaEncryptedMessageInput,
    WaIncomingMessageAckHandlerOptions,
    WaMessagePublishOptions,
    WaMessagePublishResult,
    WaSendReceiptInput
} from '../message/types'
import { WaMessageClient } from '../message/WaMessageClient'
import type { Proto } from '../proto'
import { SignalSessionSyncApi } from '../signal/api/SignalSessionSyncApi'
import { WaAdvSignature } from '../signal/crypto/WaAdvSignature'
import { SenderKeyManager } from '../signal/group/SenderKeyManager'
import { SenderKeyStore } from '../signal/group/SenderKeyStore'
import { SignalProtocol } from '../signal/session/SignalProtocol'
import { WaSignalStore } from '../signal/store/WaSignalStore'
import { WaKeepAlive } from '../transport/keepalive/WaKeepAlive'
import { queryWithContext as queryNodeWithContext } from '../transport/node/query'
import { WaIncomingNodeRouter } from '../transport/node/WaIncomingNodeRouter'
import { WaNodeOrchestrator } from '../transport/node/WaNodeOrchestrator'
import { WaNodeTransport } from '../transport/node/WaNodeTransport'
import type { BinaryNode } from '../transport/types'
import type { WaComms } from '../transport/WaComms'
import { toError } from '../util/errors'

import {
    IQ_TIMEOUT_MS,
    MAX_DANGLING_RECEIPTS
} from './constants'
import { WaCommsBootstrapCoordinator } from './coordinators/WaCommsBootstrapCoordinator'
import { WaDirtySyncCoordinator } from './coordinators/WaDirtySyncCoordinator'
import { WaIncomingNodeCoordinator } from './coordinators/WaIncomingNodeCoordinator'
import { WaMediaMessageCoordinator } from './coordinators/WaMediaMessageCoordinator'
import { WaMessageDispatchCoordinator } from './coordinators/WaMessageDispatchCoordinator'
import { WaPairingReconnectCoordinator } from './coordinators/WaPairingReconnectCoordinator'
import { WaPassiveTasksCoordinator } from './coordinators/WaPassiveTasksCoordinator'
import { WaStreamControlCoordinator } from './coordinators/WaStreamControlCoordinator'
import type {
    WaClientEventMap,
    WaClientOptions,
    WaSendMessageContent,
    WaSendMessageOptions,
    WaSignalMessagePublishInput
} from './types'

export class WaClient extends EventEmitter {
    private readonly options: Readonly<WaClientOptions>
    private readonly logger: Logger
    private readonly signalStore: WaSignalStore
    private readonly x25519: X25519
    private readonly authClient: WaAuthClient
    private readonly nodeOrchestrator: WaNodeOrchestrator
    private readonly keepAlive: WaKeepAlive
    private readonly incomingNodeRouter: WaIncomingNodeRouter
    private readonly nodeTransport: WaNodeTransport
    private readonly appStateSync: WaAppStateSyncClient
    private readonly dirtySync: WaDirtySyncCoordinator
    private readonly incomingNode: WaIncomingNodeCoordinator
    private readonly pairingReconnect: WaPairingReconnectCoordinator
    private readonly passiveTasks: WaPassiveTasksCoordinator
    private readonly commsBootstrap: WaCommsBootstrapCoordinator
    private readonly streamControl: WaStreamControlCoordinator
    private readonly mediaCrypto: WaMediaCrypto
    private readonly mediaTransfer: WaMediaTransferClient
    private readonly mediaMessage: WaMediaMessageCoordinator
    private readonly messageDispatch: WaMessageDispatchCoordinator
    private readonly messageClient: WaMessageClient
    private readonly senderKeyManager: SenderKeyManager
    private readonly signalProtocol: SignalProtocol
    private readonly signalSessionSync: SignalSessionSyncApi
    private clockSkewMs: number | null
    private mediaConnCache: WaMediaConn | null
    private comms: WaComms | null
    private readonly danglingReceipts: BinaryNode[]

    public constructor(
        options: WaClientOptions,
        logger: Logger = new ConsoleLogger('info'),
        signalStore = new WaSignalStore()
    ) {
        super()
        this.options = Object.freeze({
            ...options,
            devicePlatform: options.devicePlatform ?? DEFAULT_DEVICE_PLATFORM
        })
        this.logger = logger
        this.signalStore = signalStore
        this.comms = null
        this.danglingReceipts = []
        this.clockSkewMs = null
        this.mediaConnCache = null

        this.nodeTransport = new WaNodeTransport(this.logger)
        this.bindNodeTransportEvents()
        this.nodeOrchestrator = new WaNodeOrchestrator({
            sendNode: async (node) => this.nodeTransport.sendNode(node),
            logger: this.logger,
            defaultTimeoutMs: IQ_TIMEOUT_MS,
            hostDomain: HOST_DOMAIN
        })
        this.keepAlive = new WaKeepAlive({
            logger: this.logger,
            nodeOrchestrator: this.nodeOrchestrator,
            getComms: () => this.comms,
            hostDomain: HOST_DOMAIN
        })

        this.mediaCrypto = new WaMediaCrypto()
        this.mediaTransfer = new WaMediaTransferClient({
            logger: this.logger,
            mediaCrypto: this.mediaCrypto
        })
        const sendNode = async (node: BinaryNode) => this.sendNode(node)
        const query = async (node: BinaryNode, timeoutMs?: number) => this.query(node, timeoutMs)
        const queryWithContext = async (
            context: string,
            node: BinaryNode,
            timeoutMs?: number,
            contextData?: Readonly<Record<string, unknown>>
        ) => this.queryWithContext(context, node, timeoutMs, contextData)
        this.messageClient = new WaMessageClient({
            logger: this.logger,
            sendNode,
            query
        })
        this.mediaMessage = new WaMediaMessageCoordinator({
            logger: this.logger,
            mediaCrypto: this.mediaCrypto,
            mediaTransfer: this.mediaTransfer,
            queryWithContext,
            getMediaConnCache: () => this.mediaConnCache,
            setMediaConnCache: (mediaConn) => {
                this.mediaConnCache = mediaConn
            }
        })
        this.senderKeyManager = new SenderKeyManager(new SenderKeyStore())

        this.x25519 = new X25519()
        const advSignature = new WaAdvSignature()
        this.signalProtocol = new SignalProtocol(signalStore, this.x25519)
        this.signalSessionSync = new SignalSessionSyncApi({
            logger: this.logger,
            query
        })
        this.authClient = new WaAuthClient(
            {
                authPath: this.options.authPath,
                devicePlatform: this.options.devicePlatform
            },
            {
                logger: this.logger,
                signalStore,
                x25519: this.x25519,
                pairingCrypto: new WaPairingCodeCrypto(this.x25519),
                advSignature,
                socket: {
                    sendNode,
                    query
                },
                callbacks: {
                    onQr: (qr, ttlMs) => this.emit('qr', qr, ttlMs),
                    onPairingCode: (code) => this.emit('pairing_code', code),
                    onPairingRefresh: (forceManual) => this.emit('pairing_refresh', forceManual),
                    onPaired: (credentials) => {
                        this.emit('paired', credentials)
                        this.pairingReconnect.scheduleReconnectAfterPairing()
                    },
                    onError: (error) => this.handleError(error)
                }
            }
        )
        const getCurrentCredentials = () => this.authClient.getCurrentCredentials()
        const clearMediaConnCache = () => {
            this.mediaConnCache = null
        }
        const bindComms = (comms: WaComms | null) => this.nodeTransport.bindComms(comms)
        const authRuntime = {
            getCurrentCredentials,
            buildCommsConfig: () => this.authClient.buildCommsConfig(this.options),
            persistSuccessAttributes: async (attributes: WaSuccessPersistAttributes) =>
                this.authClient.persistSuccessAttributes(attributes),
            persistRoutingInfo: async (routingInfo: Uint8Array) =>
                this.authClient.persistRoutingInfo(routingInfo),
            persistServerHasPreKeys: async (serverHasPreKeys: boolean) =>
                this.authClient.persistServerHasPreKeys(serverHasPreKeys),
            persistServerStaticKey: async (serverStaticKey: Uint8Array) =>
                this.authClient.persistServerStaticKey(serverStaticKey),
            clearStoredCredentials: async () => this.authClient.clearStoredCredentials()
        }
        this.messageDispatch = new WaMessageDispatchCoordinator({
            logger: this.logger,
            messageClient: this.messageClient,
            mediaMessage: this.mediaMessage,
            senderKeyManager: this.senderKeyManager,
            signalProtocol: this.signalProtocol,
            signalSessionSync: this.signalSessionSync,
            getCurrentMeJid: () => getCurrentCredentials()?.meJid
        })
        const incomingMessageAckOptions: WaIncomingMessageAckHandlerOptions = {
            logger: this.logger,
            sendNode,
            getMeJid: () => getCurrentCredentials()?.meJid
        }

        this.incomingNodeRouter = new WaIncomingNodeRouter({
            nodeOrchestrator: this.nodeOrchestrator,
            iqSetHandlers: [async (node) => this.authClient.handleIncomingIqSet(node)],
            notificationHandlers: [
                async (node) => this.authClient.handleLinkCodeNotification(node),
                async (node) => this.authClient.handleCompanionRegRefreshNotification(node)
            ],
            messageHandlers: [
                async (node) => handleIncomingMessageAck(node, incomingMessageAckOptions)
            ]
        })
        this.appStateSync = new WaAppStateSyncClient({
            logger: this.logger,
            query,
            getPersistedAppState: () => getCurrentCredentials()?.appState,
            persistAppState: async (next) => this.authClient.persistAppState(next)
        })
        this.dirtySync = new WaDirtySyncCoordinator({
            logger: this.logger,
            queryWithContext,
            getCurrentCredentials,
            syncAppState: async () => {
                await this.syncAppState()
            }
        })
        this.streamControl = new WaStreamControlCoordinator({
            logger: this.logger,
            getComms: () => this.comms,
            clearPendingQueries: (error) => this.nodeOrchestrator.clearPending(error),
            clearMediaConnCache,
            disconnect: async () => this.disconnect(),
            clearStoredCredentials: async () => authRuntime.clearStoredCredentials(),
            connect: async () => this.connect()
        })
        this.incomingNode = new WaIncomingNodeCoordinator({
            logger: this.logger,
            runtime: {
                handleStreamControlResult: async (result) =>
                    this.streamControl.handleStreamControlResult(result),
                persistSuccessAttributes: async (attributes) =>
                    authRuntime.persistSuccessAttributes(attributes),
                emitSuccessNode: (node) => this.emit('success', node),
                updateClockSkewFromSuccess: (serverUnixSeconds) =>
                    this.updateClockSkewFromSuccess(serverUnixSeconds),
                shouldWarmupMediaConn: () => {
                    const credentials = getCurrentCredentials()
                    return !!(
                        credentials?.meJid &&
                        this.comms &&
                        this.comms.getCommsState().connected
                    )
                },
                warmupMediaConn: async () => {
                    await this.mediaMessage.getMediaConn(true)
                },
                persistRoutingInfo: async (routingInfo) =>
                    authRuntime.persistRoutingInfo(routingInfo),
                dispatchIncomingNode: async (node) => this.incomingNodeRouter.dispatch(node)
            },
            dirtySync: {
                parseDirtyBits: (nodes) => this.dirtySync.parseDirtyBits(nodes),
                handleDirtyBits: async (dirtyBits) => this.dirtySync.handleDirtyBits(dirtyBits)
            }
        })
        this.passiveTasks = new WaPassiveTasksCoordinator({
            logger: this.logger,
            signalStore: this.signalStore,
            x25519: this.x25519,
            runtime: {
                queryWithContext,
                getCurrentCredentials,
                persistServerHasPreKeys: async (serverHasPreKeys) =>
                    authRuntime.persistServerHasPreKeys(serverHasPreKeys),
                sendNodeDirect: async (node) => this.nodeOrchestrator.sendNode(node),
                takeDanglingReceipts: () => this.danglingReceipts.splice(0),
                requeueDanglingReceipt: (node) => this.enqueueDanglingReceipt(node),
                shouldQueueDanglingReceipt: (node, error) =>
                    this.shouldQueueDanglingReceipt(node, error)
            }
        })
        this.commsBootstrap = new WaCommsBootstrapCoordinator({
            logger: this.logger,
            auth: {
                buildCommsConfig: authRuntime.buildCommsConfig,
                persistServerStaticKey: async (serverStaticKey) =>
                    authRuntime.persistServerStaticKey(serverStaticKey)
            },
            runtime: {
                setComms: (comms) => {
                    this.comms = comms
                },
                clearMediaConnCache,
                bindComms,
                onIncomingFrame: async (frame) => this.handleIncomingFrame(frame),
                syncKeepAlive: (registered) => {
                    if (registered) {
                        this.keepAlive.start()
                        return
                    }
                    this.keepAlive.stop()
                },
                startPassiveTasksAfterConnect: () =>
                    this.passiveTasks.startPassiveTasksAfterConnect()
            }
        })
        this.pairingReconnect = new WaPairingReconnectCoordinator({
            logger: this.logger,
            runtime: {
                getCurrentCredentials,
                getComms: () => this.comms,
                stopKeepAlive: () => this.keepAlive.stop(),
                clearPendingQueries: (error) => this.nodeOrchestrator.clearPending(error),
                clearCommsBinding: () => {
                    this.comms = null
                    bindComms(null)
                },
                startCommsWithCredentials: async (credentials) =>
                    this.startCommsWithCredentials(credentials),
                onError: (error) => this.handleError(error)
            }
        })
    }

    public override on<K extends keyof WaClientEventMap>(
        event: K,
        listener: WaClientEventMap[K]
    ): this {
        return super.on(event, listener as (...args: unknown[]) => void)
    }

    public getState() {
        const connected = this.comms !== null && this.comms.getCommsState().connected
        this.logger.trace('wa client state requested', { connected })
        return this.authClient.getState(connected)
    }

    public getCredentials() {
        return this.authClient.getCredentials()
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

    public async query(node: BinaryNode, timeoutMs = IQ_TIMEOUT_MS): Promise<BinaryNode> {
        if (!this.comms || !this.comms.getCommsState().connected) {
            throw new Error('client is not connected')
        }
        this.logger.debug('wa client query', { tag: node.tag, id: node.attrs.id, timeoutMs })
        return this.nodeOrchestrator.query(node, timeoutMs)
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

    private async queryWithContext(
        context: string,
        node: BinaryNode,
        timeoutMs = IQ_TIMEOUT_MS,
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
                this.logger.warn('connect failed with routing info, retrying without routing info', {
                    message: toError(error).message
                })
                await this.disconnect()
                credentials = await this.authClient.clearRoutingInfo()
                await this.startCommsWithCredentials(credentials)
            } else {
                throw error
            }
        }
        this.logger.info('wa client connected')
        this.emit('connected')
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
        this.comms = null
        this.nodeTransport.bindComms(null)
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

    public getAppStateSyncClient(): WaAppStateSyncClient {
        return this.appStateSync
    }

    public getMediaTransferClient(): WaMediaTransferClient {
        return this.mediaTransfer
    }

    public getMessageClient(): WaMessageClient {
        return this.messageClient
    }

    public async publishMessageNode(
        node: BinaryNode,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        return this.messageDispatch.publishMessageNode(node, options)
    }

    public async publishEncryptedMessage(
        input: WaEncryptedMessageInput,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        return this.messageDispatch.publishEncryptedMessage(input, options)
    }

    public async publishSignalMessage(
        input: WaSignalMessagePublishInput,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        return this.messageDispatch.publishSignalMessage(input, options)
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

    public exportAppState(): WaAppStateStoreData {
        return this.appStateSync.exportState()
    }

    public async importAppStateSyncKeyShare(
        share: Proto.Message.IAppStateSyncKeyShare
    ): Promise<number> {
        return this.appStateSync.importSyncKeyShare(share)
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

    private async startCommsWithCredentials(
        credentials: WaAuthCredentials
    ): Promise<void> {
        await this.commsBootstrap.startCommsWithCredentials(credentials)
    }

    private shouldQueueDanglingReceipt(node: BinaryNode, error: Error): boolean {
        if (node.tag !== RECEIPT_NODE_TAG) {
            return false
        }
        const message = error.message.toLowerCase()
        return (
            message.includes('not connected') ||
            message.includes('socket') ||
            message.includes('closed') ||
            message.includes('connection') ||
            message.includes('timeout')
        )
    }

    private enqueueDanglingReceipt(node: BinaryNode): void {
        if (node.tag !== RECEIPT_NODE_TAG) {
            return
        }
        if (this.danglingReceipts.length >= MAX_DANGLING_RECEIPTS) {
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

    private handleError(error: Error): void {
        this.logger.error('wa client error', { message: error.message })
        this.emit('error', error)
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
