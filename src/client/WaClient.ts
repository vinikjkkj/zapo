import { EventEmitter } from 'node:events'

import type {
    WaAppStateStoreData,
    WaAppStateSyncOptions,
    WaAppStateSyncResult
} from '@appstate/types'
import { downloadExternalBlobReference } from '@appstate/utils'
import type { WaAppStateSyncClient } from '@appstate/WaAppStateSyncClient'
import type { WaAuthClient } from '@auth/WaAuthClient'
import type { WaConnectionManager } from '@client/connection/WaConnectionManager'
import type { WaReceiptQueue } from '@client/connection/WaReceiptQueue'
import type { WaAppStateMutationCoordinator } from '@client/coordinators/WaAppStateMutationCoordinator'
import type { WaBusinessCoordinator } from '@client/coordinators/WaBusinessCoordinator'
import type { WaGroupCoordinator } from '@client/coordinators/WaGroupCoordinator'
import type { WaIncomingNodeCoordinator } from '@client/coordinators/WaIncomingNodeCoordinator'
import type { WaMessageDispatchCoordinator } from '@client/coordinators/WaMessageDispatchCoordinator'
import type { WaPassiveTasksCoordinator } from '@client/coordinators/WaPassiveTasksCoordinator'
import type { WaPrivacyCoordinator } from '@client/coordinators/WaPrivacyCoordinator'
import type { WaProfileCoordinator } from '@client/coordinators/WaProfileCoordinator'
import type { WaTrustedContactTokenCoordinator } from '@client/coordinators/WaTrustedContactTokenCoordinator'
import { parseChatEventFromAppStateMutation } from '@client/events/chat'
import { processHistorySyncNotification } from '@client/history-sync'
import { persistIncomingMailboxEntities } from '@client/mailbox'
import {
    type WriteBehindDrainResult,
    WriteBehindPersistence
} from '@client/persistence/WriteBehindPersistence'
import type {
    WaClientEventMap,
    WaClientOptions,
    WaIncomingAddonEvent,
    WaIncomingMessageEvent,
    WaIncomingNodeHandlerRegistration,
    WaIncomingProtocolMessageEvent,
    WaSendMessageOptions
} from '@client/types'
import { buildWaClientDependencies, resolveWaClientBase } from '@client/WaClientFactory'
import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import {
    buildAddonAdditionalData,
    decodeAddonPlaintext,
    decryptAddonPayload,
    identifyEncryptedAddon,
    resolveParentMessageSecret,
    resolvePollOptionNames,
    shouldUseAddonAdditionalData
} from '@message/addon-crypto'
import type {
    WaMessagePublishResult,
    WaSendMessageContent,
    WaSendReceiptInput
} from '@message/types'
import type { WaMessageClient } from '@message/WaMessageClient'
import { proto, type Proto } from '@proto'
import { WA_APP_STATE_COLLECTION_STATES, WA_DEFAULTS } from '@protocol/constants'
import { normalizeDeviceJid, parsePhoneJid, toUserJid } from '@protocol/jid'
import { WA_LOGOUT_REASONS, type WaLogoutReason } from '@protocol/stream'
import type { SignalDeviceSyncApi, SignalLidSyncResult } from '@signal/api/SignalDeviceSyncApi'
import type { WaAppStateStore } from '@store/contracts/appstate.store'
import type { WaContactStore } from '@store/contracts/contact.store'
import type { WaDeviceListStore } from '@store/contracts/device-list.store'
import type { WaIdentityStore } from '@store/contracts/identity.store'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import type { WaParticipantsStore } from '@store/contracts/participants.store'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaPrivacyTokenStore } from '@store/contracts/privacy-token.store'
import type { WaRetryStore } from '@store/contracts/retry.store'
import type { WaSenderKeyStore } from '@store/contracts/sender-key.store'
import type { WaSessionStore } from '@store/contracts/session.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import type { WaThreadStore } from '@store/contracts/thread.store'
import { NOOP_MESSAGE_SECRET_STORE } from '@store/noop.store'
import type { WaKeepAlive } from '@transport/keepalive/WaKeepAlive'
import { buildRemoveCompanionDeviceIq } from '@transport/node/builders/device'
import { buildPresenceNode } from '@transport/node/builders/presence'
import { assertIqResult, queryWithContext as queryNodeWithContext } from '@transport/node/query'
import type { WaNodeOrchestrator } from '@transport/node/WaNodeOrchestrator'
import type { WaNodeTransport } from '@transport/node/WaNodeTransport'
import type { BinaryNode } from '@transport/types'
import { bytesToHex, decodeProtoBytes } from '@util/bytes'
import { toError } from '@util/primitives'

type WaIncomingProtocolType = NonNullable<Proto.Message.IProtocolMessage['type']>
const SYNC_RELATED_PROTOCOL_TYPES = new Set<WaIncomingProtocolType>([
    proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_REQUEST,
    proto.Message.ProtocolMessage.Type.APP_STATE_FATAL_EXCEPTION_NOTIFICATION,
    proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE,
    proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE
])

export class WaClient extends EventEmitter {
    private readonly options!: Readonly<WaClientOptions>
    private readonly logger!: Logger
    private readonly appStateStore!: WaAppStateStore
    private readonly contactStore!: WaContactStore
    private readonly messageStore!: WaMessageStore
    private readonly messageSecretStore!: WaMessageSecretStore
    private readonly participantsStore!: WaParticipantsStore
    private readonly privacyTokenStore!: WaPrivacyTokenStore
    private readonly deviceListStore!: WaDeviceListStore
    private readonly retryStore!: WaRetryStore
    private readonly signalStore!: WaSignalStore
    private readonly preKeyStore!: WaPreKeyStore
    private readonly sessionStore!: WaSessionStore
    private readonly identityStore!: WaIdentityStore
    private readonly senderKeyStore!: WaSenderKeyStore
    private readonly threadStore!: WaThreadStore
    private readonly authClient!: WaAuthClient
    private readonly nodeOrchestrator!: WaNodeOrchestrator
    private readonly nodeTransport!: WaNodeTransport
    private readonly signalDeviceSync!: SignalDeviceSyncApi
    public readonly appStateSync!: WaAppStateSyncClient
    public readonly chatCoordinator!: WaAppStateMutationCoordinator
    private readonly incomingNode!: WaIncomingNodeCoordinator
    public readonly mediaTransfer!: WaMediaTransferClient
    public readonly messageDispatch!: WaMessageDispatchCoordinator
    public readonly messageClient!: WaMessageClient
    public readonly groupCoordinator!: WaGroupCoordinator
    public readonly privacyCoordinator!: WaPrivacyCoordinator
    public readonly profileCoordinator!: WaProfileCoordinator
    public readonly businessCoordinator!: WaBusinessCoordinator
    private readonly passiveTasks!: WaPassiveTasksCoordinator
    private readonly keepAlive!: WaKeepAlive
    private readonly receiptQueue!: WaReceiptQueue
    private readonly connectionManager!: WaConnectionManager
    private readonly trustedContactToken!: WaTrustedContactTokenCoordinator
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
        this.messageSecretStore = base.sessionStore.messageSecret
        this.participantsStore = base.sessionStore.participants
        this.privacyTokenStore = base.sessionStore.privacyToken
        this.deviceListStore = base.sessionStore.deviceList
        this.retryStore = base.sessionStore.retry
        this.signalStore = base.sessionStore.signal
        this.preKeyStore = base.sessionStore.preKey
        this.sessionStore = base.sessionStore.session
        this.identityStore = base.sessionStore.identity
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

        if (
            this.options.addons?.autoDecrypt &&
            this.messageSecretStore === NOOP_MESSAGE_SECRET_STORE
        ) {
            this.logger.warn(
                'addons.autoDecrypt is enabled but messageSecret cache is noop — ' +
                    'addon decryption will only work if secrets are in the message store'
            )
        }

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
                clearStoredState: this.clearStoredState.bind(this),
                resumeIncomingEvents: () => {
                    this.acceptingIncomingEvents = true
                }
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

    public async sendPresence(type?: 'available' | 'unavailable'): Promise<void> {
        const credentials = this.authClient.getCurrentCredentials()
        await this.nodeOrchestrator.sendNode(
            buildPresenceNode({ type, name: credentials?.meDisplayName ?? undefined }),
            false
        )
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

    private async handleIncomingMessageEvent(event: WaIncomingMessageEvent): Promise<void> {
        if (!this.tryEnterIncomingHandler()) {
            return
        }
        try {
            this.emit('message', event)
            void persistIncomingMailboxEntities({
                logger: this.logger,
                writeBehind: this.writeBehind,
                messageSecretStore: this.messageSecretStore,
                event
            })
            if (this.options.addons?.autoDecrypt && event.message) {
                void this.tryDecryptAddon(event).catch((err) => {
                    this.logger.warn('addon auto-decrypt failed', {
                        id: event.stanzaId,
                        message: toError(err).message
                    })
                })
            }
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

        const requestedKeys = await this.appStateStore.getSyncKeysBatch(requestedKeyIds)
        const availableKeys: WaAppStateStoreData['keys'][number][] = []
        const missingKeyIds: Uint8Array[] = []
        for (let i = 0; i < requestedKeys.length; i += 1) {
            const key = requestedKeys[i]
            if (key !== null) {
                availableKeys.push(key)
            } else {
                missingKeyIds.push(requestedKeyIds[i])
            }
        }

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
        return (
            (!!credentials.meJid && toUserJid(credentials.meJid) === candidateUser) ||
            (!!credentials.meLid && toUserJid(credentials.meLid) === candidateUser)
        )
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
                    >[0]['emitEvent'],
                    onPrivacyTokens: (conversations) =>
                        this.trustedContactToken.hydrateFromHistorySync(conversations),
                    onNctSalt: (salt) =>
                        this.trustedContactToken.hydrateNctSaltFromHistorySync(salt)
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
                this.emit('connection', {
                    status: 'open',
                    reason: 'connected',
                    code: null,
                    isLogout: false,
                    isNewLogin: this.connectionManager.wasNewLogin()
                })
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
        await this.connectionManager.disconnect()
        this.emit('connection', {
            status: 'close',
            reason: 'client_disconnected',
            code: null,
            isLogout: false,
            isNewLogin: false
        })
    }

    public async requestPairingCode(
        phoneNumber: string,
        shouldShowPushNotification = false,
        customCode?: string
    ): Promise<string> {
        if (!this.connectionManager.isConnected() || !this.authClient.getCurrentCredentials()) {
            throw new Error('client is not connected')
        }
        this.logger.debug('wa client request pairing code')
        return this.authClient.requestPairingCode(
            phoneNumber,
            shouldShowPushNotification,
            customCode
        )
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
        const normalizedPhoneJids = new Array<string>(phoneNumbers.length)
        for (let index = 0; index < phoneNumbers.length; index += 1) {
            normalizedPhoneJids[index] = parsePhoneJid(phoneNumbers[index])
        }
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

    public async syncSignalSession(jid: string, reasonIdentity = false): Promise<void> {
        await this.messageDispatch.syncSignalSession(jid, reasonIdentity)
        if (reasonIdentity) {
            this.trustedContactToken.reissueOnIdentityChange(jid).catch((err) =>
                this.logger.warn('tc token reissue on identity change failed', {
                    jid,
                    message: toError(err).message
                })
            )
        }
    }

    public get chat(): WaAppStateMutationCoordinator {
        return this.chatCoordinator
    }
    public get group(): WaGroupCoordinator {
        return this.groupCoordinator
    }
    public get privacy(): WaPrivacyCoordinator {
        return this.privacyCoordinator
    }
    public get profile(): WaProfileCoordinator {
        return this.profileCoordinator
    }
    public get business(): WaBusinessCoordinator {
        return this.businessCoordinator
    }

    public async logout(reason: WaLogoutReason = WA_LOGOUT_REASONS.USER_INITIATED): Promise<void> {
        const meJid = this.authClient.getCurrentCredentials()?.meJid
        if (!meJid) {
            throw new Error('cannot logout: client is not authenticated')
        }
        const deviceJid = normalizeDeviceJid(meJid)
        const node = buildRemoveCompanionDeviceIq(deviceJid, reason)
        const result = await this.queryWithContext('client.logout', node, undefined, {
            jid: deviceJid,
            reason
        })
        assertIqResult(result, 'client.logout')
    }

    public sendReceipt(input: WaSendReceiptInput): Promise<void> {
        return this.messageDispatch.sendReceipt(input)
    }

    public flushAppStateMutations(): Promise<void> {
        return this.chatCoordinator.flushMutations()
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
        const syncResult = await this.executeAppStateSync(options)
        const blockedCollections = this.getBlockedAppStateCollections(syncResult)
        if (blockedCollections.length > 0) {
            this.logger.warn('app-state sync has blocked collections', {
                blockedCollections: blockedCollections.join(',')
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
        const blocked: string[] = []
        for (const entry of syncResult.collections) {
            if (entry.state === WA_APP_STATE_COLLECTION_STATES.BLOCKED) {
                blocked.push(entry.collection)
            }
        }
        return blocked
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
                    this.handleNctSaltMutation(mutation)
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

    private handleNctSaltMutation(mutation: {
        readonly operation: 'set' | 'remove'
        readonly value: {
            readonly nctSaltSyncAction?: { readonly salt?: Uint8Array | null } | null
        } | null
    }): void {
        const nctAction = mutation.value?.nctSaltSyncAction
        if (!nctAction) {
            return
        }
        if (mutation.operation === 'set' && nctAction.salt) {
            this.trustedContactToken.handleNctSaltSync(nctAction.salt).catch((err) =>
                this.logger.warn('nct salt sync set failed', {
                    message: toError(err).message
                })
            )
        } else if (mutation.operation === 'remove') {
            this.trustedContactToken.handleNctSaltSync(null).catch((err) =>
                this.logger.warn('nct salt sync remove failed', {
                    message: toError(err).message
                })
            )
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

        const s = this.options.logoutStoreClear
        const shouldClear = (key: keyof NonNullable<typeof s>): boolean =>
            s === undefined || s[key] !== false

        if (shouldClear('auth')) await this.authClient.clearStoredCredentials()
        if (shouldClear('appState')) await this.appStateStore.clear()
        if (shouldClear('contacts')) await this.contactStore.clear()
        if (shouldClear('messages')) await this.messageStore.clear()
        if (shouldClear('messageSecret')) await this.messageSecretStore.clear()
        if (shouldClear('participants')) await this.participantsStore.clear()
        if (shouldClear('deviceList')) await this.deviceListStore.clear()
        if (shouldClear('retry')) await this.retryStore.clear()
        if (shouldClear('signal')) await this.signalStore.clear()
        if (shouldClear('preKey')) await this.preKeyStore.clear()
        if (shouldClear('session')) await this.sessionStore.clear()
        if (shouldClear('identity')) await this.identityStore.clear()
        if (shouldClear('senderKey')) await this.senderKeyStore.clear()
        if (shouldClear('threads')) await this.threadStore.clear()
        if (shouldClear('privacyToken')) await this.privacyTokenStore.clear()
    }

    private async tryDecryptAddon(event: WaIncomingMessageEvent): Promise<void> {
        const message = event.message
        if (!message) return

        const addon = identifyEncryptedAddon(message)
        if (!addon) return

        const targetMessageId = addon.targetMessageKey.id
        if (!targetMessageId) return

        const parentEntry = await resolveParentMessageSecret(
            targetMessageId,
            this.messageSecretStore,
            this.messageStore
        )
        if (!parentEntry) {
            this.logger.debug('addon parent message secret not found', {
                id: event.stanzaId,
                targetId: targetMessageId
            })
            return
        }

        const parentMsgOriginalSender = parentEntry.senderJid
        const modificationSender = event.senderJid ?? ''

        const plaintext = await decryptAddonPayload({
            messageSecret: parentEntry.secret,
            stanzaId: targetMessageId,
            parentMsgOriginalSender,
            modificationSender,
            modificationType: addon.modificationType,
            ciphertext: addon.encPayload,
            iv: addon.encIv,
            additionalData: shouldUseAddonAdditionalData(addon.modificationType)
                ? buildAddonAdditionalData(targetMessageId, modificationSender)
                : undefined
        })

        let decrypted = decodeAddonPlaintext(addon.kind, plaintext)
        if (decrypted.kind === 'poll_vote' && decrypted.pollVote.selectedOptions) {
            const names = await resolvePollOptionNames(
                decrypted.pollVote.selectedOptions,
                targetMessageId,
                this.messageStore
            )
            if (names) {
                decrypted = { ...decrypted, selectedOptionNames: names }
            }
        }
        const addonEvent: WaIncomingAddonEvent = {
            rawNode: event.rawNode,
            stanzaId: event.stanzaId,
            chatJid: event.chatJid,
            stanzaType: event.stanzaType,
            kind: addon.kind,
            targetMessageId,
            senderJid: modificationSender,
            decrypted,
            raw: message
        }
        this.emit('message_addon', addonEvent)
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
