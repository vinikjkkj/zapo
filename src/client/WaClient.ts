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
import { parseChatEventFromAppStateMutation } from '@client/events/chat'
import { processHistorySyncNotification } from '@client/history-sync'
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
import { WA_APP_STATE_COLLECTION_STATES, WA_DEFAULTS, WA_MESSAGE_TAGS } from '@protocol/constants'
import { normalizeDeviceJid, parsePhoneJid, toUserJid } from '@protocol/jid'
import type { SignalDeviceSyncApi, SignalLidSyncResult } from '@signal/api/SignalDeviceSyncApi'
import type { WaAppStateStore } from '@store/contracts/appstate.store'
import type { WaContactStore } from '@store/contracts/contact.store'
import type { WaDeviceListStore } from '@store/contracts/device-list.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import type { WaParticipantsStore } from '@store/contracts/participants.store'
import type { WaRetryStore } from '@store/contracts/retry.store'
import type { WaSenderKeyStore } from '@store/contracts/sender-key.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import type { WaThreadStore } from '@store/contracts/thread.store'
import type { WaKeepAlive } from '@transport/keepalive/WaKeepAlive'
import { queryWithContext as queryNodeWithContext } from '@transport/node/query'
import type { WaNodeOrchestrator } from '@transport/node/WaNodeOrchestrator'
import type { WaNodeTransport } from '@transport/node/WaNodeTransport'
import type { BinaryNode } from '@transport/types'
import { WaComms } from '@transport/WaComms'
import { decodeProtoBytes } from '@util/base64'
import { bytesToHex } from '@util/bytes'
import { toError } from '@util/primitives'

type WaIncomingProtocolType = NonNullable<Proto.Message.IProtocolMessage['type']>
const SYNC_RELATED_PROTOCOL_TYPES = new Set<WaIncomingProtocolType>([
    proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_REQUEST,
    proto.Message.ProtocolMessage.Type.APP_STATE_FATAL_EXCEPTION_NOTIFICATION,
    proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE,
    proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE
])
const WA_APP_STATE_KEY_SHARE_WAIT_TIMEOUT_MS = 15_000
const WA_APP_STATE_KEY_SHARE_MAX_RETRIES = 2

export class WaClient extends EventEmitter {
    private readonly options!: Readonly<WaClientOptions>
    private readonly logger!: Logger
    private readonly appStateStore!: WaAppStateStore
    private readonly contactStore!: WaContactStore
    private readonly messageStore!: WaMessageStore
    private readonly participantsStore!: WaParticipantsStore
    private readonly deviceListStore!: WaDeviceListStore
    private readonly retryStore!: WaRetryStore
    private readonly signalStore!: WaSignalStore
    private readonly senderKeyStore!: WaSenderKeyStore
    private readonly threadStore!: WaThreadStore
    private readonly authClient!: WaAuthClient
    private readonly nodeOrchestrator!: WaNodeOrchestrator
    private readonly keepAlive!: WaKeepAlive
    private readonly nodeTransport!: WaNodeTransport
    private readonly signalDeviceSync!: SignalDeviceSyncApi
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
    private readonly appStateKeyShareWaiters = new Set<(received: boolean) => void>()
    private appStateKeyShareVersion = 0
    private appStateBootstrapKeyShareWaitDone = false

    public constructor(options: WaClientOptions, logger: Logger = new ConsoleLogger('info')) {
        super()

        const base = resolveWaClientBase(options, logger)
        this.options = base.options
        this.logger = base.logger
        this.appStateStore = base.sessionStore.appState
        this.contactStore = base.sessionStore.contacts
        this.messageStore = base.sessionStore.messages
        this.participantsStore = base.sessionStore.participants
        this.deviceListStore = base.sessionStore.deviceList
        this.retryStore = base.sessionStore.retry
        this.signalStore = base.sessionStore.signal
        this.senderKeyStore = base.sessionStore.senderKey
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
        this.nodeTransport.on('frame_in', (frame) => this.emit('transport_frame_in', { frame }))
        this.nodeTransport.on('frame_out', (frame) => this.emit('transport_frame_out', { frame }))
        this.nodeTransport.on('node_in', (node, frame) =>
            this.emit('transport_node_in', { node, frame })
        )
        this.nodeTransport.on('node_out', (node, frame) =>
            this.emit('transport_node_out', { node, frame })
        )
        this.nodeTransport.on('decode_error', (error, frame) => {
            this.emit('transport_decode_error', { error, frame })
            this.handleError(error)
        })
    }

    private async handleIncomingMessageEvent(event: WaIncomingMessageEvent): Promise<void> {
        this.emit('message', event)
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
        this.emit('message_protocol', protocolEvent)

        const protocolType = protocolMessage.type
        if (protocolType === null || protocolType === undefined) {
            this.logger.debug('incoming protocol message without type', {
                id: event.stanzaId,
                from: event.chatJid
            })
            return
        }

        if (protocolType === proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_REQUEST) {
            await this.handleIncomingAppStateSyncKeyRequest(event, protocolMessage)
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
                id: event.stanzaId,
                from: event.chatJid,
                protocolType
            })
            return
        }

        this.logger.debug('incoming protocol message received', {
            id: event.stanzaId,
            from: event.chatJid,
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
                id: event.stanzaId,
                from: event.chatJid
            })
            return
        }

        try {
            const imported = await this.appStateSync.importSyncKeyShare(share)
            this.logger.info('imported app-state sync key share from protocol message', {
                id: event.stanzaId,
                from: event.chatJid,
                imported
            })
            if (imported > 0) {
                const hadWaiters = this.appStateKeyShareWaiters.size > 0
                this.appStateKeyShareVersion += 1
                this.notifyAppStateKeyShareWaiters(true)
                if (hadWaiters) {
                    this.logger.debug('app-state key share imported and waiters released', {
                        id: event.stanzaId,
                        from: event.chatJid,
                        imported
                    })
                    return
                }
                void this.syncAppState().catch((error) => {
                    this.logger.warn('failed to sync app-state after key share import', {
                        id: event.stanzaId,
                        from: event.chatJid,
                        message: toError(error).message
                    })
                })
            }
        } catch (error) {
            this.logger.warn('failed to import app-state sync key share from protocol message', {
                id: event.stanzaId,
                from: event.chatJid,
                message: toError(error).message
            })
        }
    }

    private async handleIncomingAppStateSyncKeyRequest(
        event: WaIncomingMessageEvent,
        protocolMessage: Proto.Message.IProtocolMessage
    ): Promise<void> {
        const request = protocolMessage.appStateSyncKeyRequest
        if (!request) {
            this.logger.warn('incoming app-state key request protocol message without payload', {
                id: event.stanzaId,
                from: event.chatJid
            })
            return
        }

        const requesterRaw = event.senderJid ?? event.chatJid
        if (!requesterRaw) {
            this.logger.warn('incoming app-state key request missing sender jid', {
                id: event.stanzaId
            })
            return
        }

        let requesterDeviceJid: string
        try {
            requesterDeviceJid = normalizeDeviceJid(requesterRaw)
        } catch (error) {
            this.logger.warn('incoming app-state key request has malformed sender jid', {
                id: event.stanzaId,
                from: requesterRaw,
                message: toError(error).message
            })
            return
        }

        if (!this.isOwnAccountDeviceJid(requesterDeviceJid)) {
            this.logger.warn('incoming app-state key request ignored: sender is not own account', {
                id: event.stanzaId,
                from: requesterDeviceJid
            })
            return
        }

        const requestedKeyIds = this.extractAppStateSyncKeyRequestIds(request)
        if (requestedKeyIds.length === 0) {
            this.logger.warn('incoming app-state key request has no valid key ids', {
                id: event.stanzaId,
                from: requesterDeviceJid
            })
            return
        }

        const requestedKeys = await Promise.all(
            requestedKeyIds.map((keyId) => this.appStateStore.getSyncKey(keyId))
        )
        const availableKeys = requestedKeys.filter(
            (key): key is NonNullable<(typeof requestedKeys)[number]> => key !== null
        )
        const missingKeyIds = requestedKeyIds.filter((_, index) => requestedKeys[index] === null)

        try {
            await this.messageDispatch.sendAppStateSyncKeyShare(
                requesterDeviceJid,
                availableKeys,
                missingKeyIds
            )
            this.logger.info('responded to app-state key request', {
                id: event.stanzaId,
                to: requesterDeviceJid,
                requested: requestedKeyIds.length,
                shared: availableKeys.length,
                missing: missingKeyIds.length
            })
        } catch (error) {
            this.logger.warn('failed to respond to app-state key request', {
                id: event.stanzaId,
                to: requesterDeviceJid,
                requested: requestedKeyIds.length,
                shared: availableKeys.length,
                missing: missingKeyIds.length,
                message: toError(error).message
            })
        }
    }

    private extractAppStateSyncKeyRequestIds(
        request: Proto.Message.IAppStateSyncKeyRequest
    ): readonly Uint8Array[] {
        const deduped = new Map<string, Uint8Array>()
        for (const key of request.keyIds ?? []) {
            try {
                const keyId = decodeProtoBytes(key.keyId, 'appStateSyncKeyRequest.keyIds[].keyId')
                const keyHex = bytesToHex(keyId)
                if (deduped.has(keyHex)) {
                    continue
                }
                deduped.set(keyHex, keyId)
            } catch (error) {
                this.logger.trace('ignoring malformed app-state key id request entry', {
                    message: toError(error).message
                })
            }
        }
        return [...deduped.values()]
    }

    private isOwnAccountDeviceJid(candidateJid: string): boolean {
        const credentials = this.authClient.getCurrentCredentials()
        if (!credentials) {
            return false
        }

        const candidateUser = toUserJid(candidateJid)
        const meUsers = [credentials.meJid, credentials.meLid]
            .filter((value): value is string => !!value)
            .map((jid) => toUserJid(jid))
        return meUsers.includes(candidateUser)
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
        this.emit('connection_open', {})
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
        this.notifyAppStateKeyShareWaiters(false)
        this.appStateBootstrapKeyShareWaitDone = false
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
            this.emit('connection_close', {})
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

    public async getLidsByPhoneNumbers(
        phoneNumbers: readonly string[]
    ): Promise<readonly SignalLidSyncResult[]> {
        if (!this.comms || !this.authClient.getCurrentCredentials()) {
            throw new Error('client is not connected')
        }
        const normalizedPhoneJids = phoneNumbers.map((phoneNumber) => {
            const atIndex = phoneNumber.indexOf('@')
            const phonePart = atIndex === -1 ? phoneNumber : phoneNumber.slice(0, atIndex)
            return parsePhoneJid(phonePart)
        })
        this.logger.trace('wa client query lids by phone numbers', {
            phones: normalizedPhoneJids.length
        })
        return this.signalDeviceSync.queryLidsByPhoneJids(normalizedPhoneJids)
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
        const shouldWaitForKeyShare = (await this.appStateStore.getActiveSyncKey()) === null
        if (shouldWaitForKeyShare && !this.appStateBootstrapKeyShareWaitDone) {
            this.appStateBootstrapKeyShareWaitDone = true
            this.logger.info('app-state bootstrap pre-sync waiting for key share', {
                timeoutMs: WA_APP_STATE_KEY_SHARE_WAIT_TIMEOUT_MS
            })
            const received = await this.waitForAppStateKeyShare(
                WA_APP_STATE_KEY_SHARE_WAIT_TIMEOUT_MS
            )
            if (received) {
                this.logger.info('app-state bootstrap pre-sync received key share, continuing sync')
            } else {
                this.logger.warn(
                    'app-state bootstrap pre-sync key share wait timed out, continuing sync',
                    {
                        timeoutMs: WA_APP_STATE_KEY_SHARE_WAIT_TIMEOUT_MS
                    }
                )
            }
        }
        let syncResult = await this.executeAppStateSync(options)
        let blockedCollections = this.getBlockedAppStateCollections(syncResult)
        if (!shouldWaitForKeyShare || blockedCollections.length === 0) {
            this.emitChatEventsFromAppStateSyncResult(syncResult)
            return syncResult
        }

        let retryCount = 0
        let observedKeyShareVersion = this.appStateKeyShareVersion
        while (blockedCollections.length > 0 && retryCount < WA_APP_STATE_KEY_SHARE_MAX_RETRIES) {
            const hasFreshShare = this.appStateKeyShareVersion !== observedKeyShareVersion
            if (!hasFreshShare) {
                this.logger.info('app-state bootstrap waiting for key share', {
                    blockedCollections: blockedCollections.join(','),
                    timeoutMs: WA_APP_STATE_KEY_SHARE_WAIT_TIMEOUT_MS,
                    retryCount: retryCount + 1
                })
                const received = await this.waitForAppStateKeyShare(
                    WA_APP_STATE_KEY_SHARE_WAIT_TIMEOUT_MS
                )
                if (!received) {
                    this.logger.warn('app-state bootstrap key share wait timed out', {
                        blockedCollections: blockedCollections.join(','),
                        timeoutMs: WA_APP_STATE_KEY_SHARE_WAIT_TIMEOUT_MS
                    })
                    break
                }
            }

            observedKeyShareVersion = this.appStateKeyShareVersion
            retryCount += 1
            this.logger.info('app-state bootstrap retrying sync after key share', {
                retryCount,
                blockedCollections: blockedCollections.join(',')
            })
            syncResult = await this.executeAppStateSync(options)
            blockedCollections = this.getBlockedAppStateCollections(syncResult)
        }

        if (blockedCollections.length > 0) {
            this.logger.warn('app-state bootstrap still blocked after waiting for key share', {
                blockedCollections: blockedCollections.join(','),
                retries: retryCount
            })
        }

        this.emitChatEventsFromAppStateSyncResult(syncResult)
        return syncResult
    }

    private async executeAppStateSync(
        options: WaAppStateSyncOptions
    ): Promise<WaAppStateSyncResult> {
        return options.downloadExternalBlob
            ? this.appStateSync.sync(options)
            : this.appStateSync.sync({
                  ...options,
                  downloadExternalBlob: async (_collection, _kind, reference) =>
                      downloadExternalBlobReference(this.mediaTransfer, reference)
              })
    }

    private getBlockedAppStateCollections(syncResult: WaAppStateSyncResult): readonly string[] {
        return syncResult.collections
            .filter((entry) => entry.state === WA_APP_STATE_COLLECTION_STATES.BLOCKED)
            .map((entry) => entry.collection)
    }

    private async waitForAppStateKeyShare(timeoutMs: number): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            let settled = false
            let timeoutHandle: ReturnType<typeof setTimeout> | null = null

            const waiter = (received: boolean) => {
                if (settled) {
                    return
                }
                settled = true
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle)
                    timeoutHandle = null
                }
                this.appStateKeyShareWaiters.delete(waiter)
                resolve(received)
            }

            this.appStateKeyShareWaiters.add(waiter)
            timeoutHandle = setTimeout(() => {
                waiter(false)
            }, timeoutMs)
        })
    }

    private notifyAppStateKeyShareWaiters(received: boolean): void {
        if (this.appStateKeyShareWaiters.size === 0) {
            return
        }
        const waiters = [...this.appStateKeyShareWaiters.values()]
        this.appStateKeyShareWaiters.clear()
        for (const waiter of waiters) {
            waiter(received)
        }
    }

    private emitChatEventsFromAppStateSyncResult(syncResult: WaAppStateSyncResult): void {
        const shouldEmitSnapshotMutations = this.options.chatEvents?.emitSnapshotMutations === true
        for (const collectionResult of syncResult.collections) {
            const mutations = collectionResult.mutations ?? []
            const lastMutationIndexByKey = new Map<string, number>()
            for (let mutationIndex = 0; mutationIndex < mutations.length; mutationIndex += 1) {
                const mutation = mutations[mutationIndex]
                if (!shouldEmitSnapshotMutations && mutation.source === 'snapshot') {
                    continue
                }
                lastMutationIndexByKey.set(
                    `${mutation.collection}\u0001${mutation.index}`,
                    mutationIndex
                )
            }

            for (let mutationIndex = 0; mutationIndex < mutations.length; mutationIndex += 1) {
                const mutation = mutations[mutationIndex]
                if (!shouldEmitSnapshotMutations && mutation.source === 'snapshot') {
                    continue
                }
                const coalesceKey = `${mutation.collection}\u0001${mutation.index}`
                if (lastMutationIndexByKey.get(coalesceKey) !== mutationIndex) {
                    continue
                }
                try {
                    const event = parseChatEventFromAppStateMutation(mutation)
                    if (!event) {
                        continue
                    }
                    this.emit('chat_event', event)
                } catch (error) {
                    this.logger.debug('failed to parse chat event from app-state mutation', {
                        collection: mutation.collection,
                        source: mutation.source,
                        index: mutation.index,
                        message: toError(error).message
                    })
                }
            }
        }
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
        await this.appStateStore.clear()
        await this.contactStore.clear()
        await this.messageStore.clear()
        await this.participantsStore.clear()
        await this.deviceListStore.clear()
        await this.retryStore.clear()
        await this.signalStore.clear()
        await this.senderKeyStore.clear()
        await this.threadStore.clear()
    }

    private handleError(error: Error): void {
        this.logger.error('wa client error', { message: error.message })
        this.emit('client_error', { error })
    }

    private clearCommsBinding(): void {
        this.notifyAppStateKeyShareWaiters(false)
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
