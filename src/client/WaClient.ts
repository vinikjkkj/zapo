import { EventEmitter } from 'node:events'

import type { WaAppStateStoreData, WaAppStateSyncResult } from '@appstate/types'
import type { WaAppStateSyncOptions } from '@appstate/types'
import { downloadExternalBlobReference } from '@appstate/utils'
import type { WaAppStateSyncClient } from '@appstate/WaAppStateSyncClient'
import type { WaAuthClient } from '@auth/WaAuthClient'
import type { WaConnectionManager } from '@client/connection/WaConnectionManager'
import type { WaKeyShareCoordinator } from '@client/connection/WaKeyShareCoordinator'
import type { WaReceiptQueue } from '@client/connection/WaReceiptQueue'
import type { WaAppStateMutationCoordinator } from '@client/coordinators/WaAppStateMutationCoordinator'
import type { WaGroupCoordinator } from '@client/coordinators/WaGroupCoordinator'
import type { WaIncomingNodeCoordinator } from '@client/coordinators/WaIncomingNodeCoordinator'
import type { WaMessageDispatchCoordinator } from '@client/coordinators/WaMessageDispatchCoordinator'
import type { WaPassiveTasksCoordinator } from '@client/coordinators/WaPassiveTasksCoordinator'
import { parseChatEventFromAppStateMutation } from '@client/events/chat'
import { processHistorySyncNotification } from '@client/history-sync'
import { persistIncomingMailboxEntities } from '@client/mailbox'
import type { WriteBehindDrainResult } from '@client/persistence/WriteBehindPersistence'
import { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type {
    WaAppStateMessageKey,
    WaClearChatOptions,
    WaClientOptions,
    WaDeleteChatOptions,
    WaDeleteMessageForMeOptions,
    WaSendMessageOptions,
    WaClientEventMap,
    WaIncomingProtocolMessageEvent,
    WaIncomingNodeHandlerRegistration,
    WaIncomingMessageEvent
} from '@client/types'
import { buildWaClientDependencies, resolveWaClientBase } from '@client/WaClientFactory'
import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import type {
    WaMessagePublishResult,
    WaSendMessageContent,
    WaSendReceiptInput
} from '@message/types'
import type { WaMessageClient } from '@message/WaMessageClient'
import { proto, type Proto } from '@proto'
import { WA_APP_STATE_COLLECTION_STATES, WA_DEFAULTS } from '@protocol/constants'
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
import { decodeProtoBytes } from '@util/bytes'
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
    private readonly nodeTransport!: WaNodeTransport
    private readonly signalDeviceSync!: SignalDeviceSyncApi
    public readonly appStateSync!: WaAppStateSyncClient
    private readonly appStateMutations!: WaAppStateMutationCoordinator
    private readonly incomingNode!: WaIncomingNodeCoordinator
    public readonly mediaTransfer!: WaMediaTransferClient
    public readonly messageDispatch!: WaMessageDispatchCoordinator
    public readonly messageClient!: WaMessageClient
    public readonly groupCoordinator!: WaGroupCoordinator
    private readonly passiveTasks!: WaPassiveTasksCoordinator
    private readonly keepAlive!: WaKeepAlive
    private readonly receiptQueue!: WaReceiptQueue
    private readonly keyShareCoordinator!: WaKeyShareCoordinator
    private readonly connectionManager!: WaConnectionManager
    private readonly writeBehind!: WriteBehindPersistence
    private connectPromise: Promise<void> | null = null
    private acceptingIncomingEvents = true
    private activeIncomingHandlers = 0
    private readonly incomingHandlersDrainedWaiters: Array<() => void> = []

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
        this.writeBehind = new WriteBehindPersistence(
            {
                messageStore: this.messageStore,
                threadStore: this.threadStore,
                contactStore: this.contactStore
            },
            this.logger,
            this.options.writeBehind
        )

        const dependencies = buildWaClientDependencies({
            base,
            runtime: {
                sendNode: (node) => this.sendNode(node),
                query: (node, timeoutMs) => this.query(node, timeoutMs),
                queryWithContext: this.queryWithContext.bind(this),
                syncAppState: () => this.syncAppState().then(() => {}),
                syncAppStateWithOptions: (syncOptions) => this.syncAppState(syncOptions),
                emitEvent: this.emit.bind(this) as <K extends keyof WaClientEventMap>(
                    event: K,
                    ...args: Parameters<WaClientEventMap[K]>
                ) => void,
                handleIncomingMessageEvent: this.handleIncomingMessageEvent.bind(this),
                handleError: this.handleError.bind(this),
                handleIncomingFrame: this.handleIncomingFrame.bind(this),
                clearStoredState: this.clearStoredState.bind(this)
            }
        })
        Object.assign(this, dependencies)

        this.bindNodeTransportEvents()
    }

    public on<K extends keyof WaClientEventMap>(event: K, listener: WaClientEventMap[K]): this
    public on(event: string | symbol, listener: (...args: unknown[]) => void): this
    public on(event: string | symbol, listener: (...args: unknown[]) => void): this {
        return super.on(event, listener)
    }

    public once<K extends keyof WaClientEventMap>(event: K, listener: WaClientEventMap[K]): this
    public once(event: string | symbol, listener: (...args: unknown[]) => void): this
    public once(event: string | symbol, listener: (...args: unknown[]) => void): this {
        return super.once(event, listener)
    }

    public off<K extends keyof WaClientEventMap>(event: K, listener: WaClientEventMap[K]): this
    public off(event: string | symbol, listener: (...args: unknown[]) => void): this
    public off(event: string | symbol, listener: (...args: unknown[]) => void): this {
        return super.off(event, listener)
    }

    public emit<K extends keyof WaClientEventMap>(
        event: K,
        payload: Parameters<WaClientEventMap[K]>[0]
    ): boolean
    public emit(event: string | symbol, ...args: unknown[]): boolean
    public emit(event: string | symbol, ...args: unknown[]): boolean {
        return super.emit(event, ...args)
    }

    public getState() {
        const connected = this.connectionManager.isConnected()
        this.logger.trace('wa client state requested', { connected })
        return this.authClient.getState(connected)
    }

    public getCredentials() {
        return this.authClient.getCurrentCredentials()
    }

    public getClockSkewMs(): number | null {
        return this.connectionManager.getClockSkewMs()
    }

    public async sendNode(node: BinaryNode): Promise<void> {
        try {
            await this.nodeOrchestrator.sendNode(node)
        } catch (error) {
            const normalized = toError(error)
            if (this.receiptQueue.shouldQueue(node, normalized)) {
                this.receiptQueue.enqueue(node)
                this.logger.warn('queued dangling receipt after send failure', {
                    id: node.attrs.id,
                    to: node.attrs.to,
                    message: normalized.message,
                    queueSize: this.receiptQueue.size()
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
        if (!this.connectionManager.isConnected()) {
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

    private getMailboxPersistenceDeps(): {
        readonly logger: Logger
        readonly writeBehind: WriteBehindPersistence
    } {
        return {
            logger: this.logger,
            writeBehind: this.writeBehind
        }
    }

    private async handleIncomingMessageEvent(event: WaIncomingMessageEvent): Promise<void> {
        if (!this.tryEnterIncomingHandler()) {
            return
        }
        try {
            this.emit('message', event)
            void persistIncomingMailboxEntities({
                ...this.getMailboxPersistenceDeps(),
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
                    await this.handleHistorySyncNotification(
                        protocolMessage.historySyncNotification
                    )
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
        } finally {
            this.leaveIncomingHandler()
        }
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
                const hadWaiters = this.keyShareCoordinator.hasWaiters()
                this.keyShareCoordinator.notifyReceived()
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
                    writeBehind: this.writeBehind,
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

        this.acceptingIncomingEvents = true
        this.connectPromise = this.connectionManager
            .connect((frame) => this.handleIncomingFrame(frame))
            .then(() => {
                this.emit('connection_open', {})
            })
            .finally(() => {
                this.connectPromise = null
            })
        return this.connectPromise
    }

    public async disconnect(): Promise<void> {
        await this.pauseIncomingEventsAndWaitDrain()
        const writeBehindFlush = await this.writeBehind.flush(
            this.options.writeBehind?.flushTimeoutMs
        )
        if (writeBehindFlush.remaining > 0) {
            this.logger.warn('disconnect continuing with pending write-behind entries', {
                remaining: writeBehindFlush.remaining
            })
        }
        this.keyShareCoordinator.notifyDisconnected()
        await this.connectionManager.disconnect()
        this.emit('connection_close', {})
    }

    public async requestPairingCode(
        phoneNumber: string,
        shouldShowPushNotification = false
    ): Promise<string> {
        if (!this.connectionManager.isConnected() || !this.authClient.getCurrentCredentials()) {
            throw new Error('client is not connected')
        }
        this.logger.debug('wa client request pairing code')
        return this.authClient.requestPairingCode(phoneNumber, shouldShowPushNotification)
    }

    public async fetchPairingCountryCodeIso(): Promise<string> {
        if (!this.connectionManager.isConnected() || !this.authClient.getCurrentCredentials()) {
            throw new Error('client is not connected')
        }
        this.logger.trace('wa client fetch pairing country code iso')
        return this.authClient.fetchPairingCountryCodeIso()
    }

    public async getLidsByPhoneNumbers(
        phoneNumbers: readonly string[]
    ): Promise<readonly SignalLidSyncResult[]> {
        if (!this.connectionManager.isConnected() || !this.authClient.getCurrentCredentials()) {
            throw new Error('client is not connected')
        }
        const normalizedPhoneJids = phoneNumbers.map(parsePhoneJid)
        this.logger.trace('wa client query lids by phone numbers', {
            phones: normalizedPhoneJids.length
        })
        return this.signalDeviceSync.queryLidsByPhoneJids(normalizedPhoneJids)
    }

    public sendMessage(
        to: string,
        content: WaSendMessageContent,
        options: WaSendMessageOptions = {}
    ): Promise<WaMessagePublishResult> {
        return this.messageDispatch.sendMessage(to, content, options)
    }

    public syncSignalSession(jid: string, reasonIdentity = false): Promise<void> {
        return this.messageDispatch.syncSignalSession(jid, reasonIdentity)
    }

    public sendReceipt(input: WaSendReceiptInput): Promise<void> {
        return this.messageDispatch.sendReceipt(input)
    }

    public setChatMute(
        chatJid: string,
        muted: boolean,
        muteEndTimestampMs?: number
    ): Promise<void> {
        return this.appStateMutations.setChatMute(chatJid, muted, muteEndTimestampMs)
    }

    public setChatRead(chatJid: string, read: boolean): Promise<void> {
        return this.appStateMutations.setChatRead(chatJid, read)
    }

    public setChatPin(chatJid: string, pinned: boolean): Promise<void> {
        return this.appStateMutations.setChatPin(chatJid, pinned)
    }

    public setChatArchive(chatJid: string, archived: boolean): Promise<void> {
        return this.appStateMutations.setChatArchive(chatJid, archived)
    }

    public clearChat(chatJid: string, options: WaClearChatOptions = {}): Promise<void> {
        return this.appStateMutations.clearChat(chatJid, options)
    }

    public deleteChat(chatJid: string, options: WaDeleteChatOptions = {}): Promise<void> {
        return this.appStateMutations.deleteChat(chatJid, options)
    }

    public setChatLock(chatJid: string, locked: boolean): Promise<void> {
        return this.appStateMutations.setChatLock(chatJid, locked)
    }

    public setMessageStar(message: WaAppStateMessageKey, starred: boolean): Promise<void> {
        return this.appStateMutations.setMessageStar(message, starred)
    }

    public deleteMessageForMe(
        message: WaAppStateMessageKey,
        options: WaDeleteMessageForMeOptions = {}
    ): Promise<void> {
        return this.appStateMutations.deleteMessageForMe(message, options)
    }

    public flushAppStateMutations(): Promise<void> {
        return this.appStateMutations.flushMutations()
    }

    public flushWriteBehind(timeoutMs?: number): Promise<WriteBehindDrainResult> {
        return this.writeBehind.flush(timeoutMs)
    }

    public async exportAppState(): Promise<WaAppStateStoreData> {
        return this.appStateSync.exportState()
    }

    public async syncAppState(options: WaAppStateSyncOptions = {}): Promise<WaAppStateSyncResult> {
        if (!this.connectionManager.isConnected()) {
            throw new Error('client is not connected')
        }
        const shouldWaitForKeyShare = (await this.appStateStore.getActiveSyncKey()) === null
        if (shouldWaitForKeyShare && !this.keyShareCoordinator.isBootstrapDone()) {
            this.keyShareCoordinator.markBootstrapDone()
            this.logger.info('app-state bootstrap pre-sync waiting for key share', {
                timeoutMs: WA_APP_STATE_KEY_SHARE_WAIT_TIMEOUT_MS
            })
            const received = await this.keyShareCoordinator.waitForShare(
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
        let observedKeyShareVersion = this.keyShareCoordinator.getVersion()
        while (blockedCollections.length > 0 && retryCount < WA_APP_STATE_KEY_SHARE_MAX_RETRIES) {
            const hasFreshShare = this.keyShareCoordinator.getVersion() !== observedKeyShareVersion
            if (!hasFreshShare) {
                this.logger.info('app-state bootstrap waiting for key share', {
                    blockedCollections: blockedCollections.join(','),
                    timeoutMs: WA_APP_STATE_KEY_SHARE_WAIT_TIMEOUT_MS,
                    retryCount: retryCount + 1
                })
                const received = await this.keyShareCoordinator.waitForShare(
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

            observedKeyShareVersion = this.keyShareCoordinator.getVersion()
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

    private async clearStoredState(): Promise<void> {
        await this.pauseIncomingEventsAndWaitDrain()
        const writeBehindDestroy = await this.writeBehind.destroy(
            this.options.writeBehind?.flushTimeoutMs
        )
        if (writeBehindDestroy.remaining > 0) {
            throw new Error(
                `clear stored state aborted: write-behind did not fully drain (remaining=${writeBehindDestroy.remaining})`
            )
        }
        const danglingReceipts = this.receiptQueue.take()
        if (danglingReceipts.length > 0) {
            this.logger.debug('cleared dangling receipts while clearing stored state', {
                count: danglingReceipts.length
            })
        }
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

    private tryEnterIncomingHandler(): boolean {
        if (!this.acceptingIncomingEvents) {
            return false
        }
        this.activeIncomingHandlers += 1
        if (this.acceptingIncomingEvents) {
            return true
        }
        this.leaveIncomingHandler()
        return false
    }

    private leaveIncomingHandler(): void {
        if (this.activeIncomingHandlers <= 0) {
            return
        }
        this.activeIncomingHandlers -= 1
        if (this.activeIncomingHandlers === 0) {
            this.notifyIncomingHandlersDrained()
        }
    }

    private async pauseIncomingEventsAndWaitDrain(): Promise<void> {
        this.acceptingIncomingEvents = false
        if (this.activeIncomingHandlers === 0) {
            return
        }
        await new Promise<void>((resolve) => {
            this.incomingHandlersDrainedWaiters[this.incomingHandlersDrainedWaiters.length] =
                resolve
        })
    }

    private notifyIncomingHandlersDrained(): void {
        if (this.incomingHandlersDrainedWaiters.length === 0) {
            return
        }
        const waitersLength = this.incomingHandlersDrainedWaiters.length
        for (let index = 0; index < waitersLength; index += 1) {
            this.incomingHandlersDrainedWaiters[index]()
        }
        this.incomingHandlersDrainedWaiters.length = 0
    }

    private handleError(error: Error): void {
        this.logger.error('wa client error', { message: error.message })
        this.emit('client_error', { error })
    }
}
