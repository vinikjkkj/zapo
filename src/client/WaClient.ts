import { EventEmitter } from 'node:events'

import type { WaAppStateSyncClient } from '@appstate/sync/WaAppStateSyncClient'
import type { WaAuthClient } from '@auth/WaAuthClient'
import type { WaAppStateMutationCoordinator } from '@client/coordinators/WaAppStateMutationCoordinator'
import type { WaBotCoordinator } from '@client/coordinators/WaBotCoordinator'
import type { WaBroadcastListCoordinator } from '@client/coordinators/WaBroadcastListCoordinator'
import type { WaBusinessCoordinator } from '@client/coordinators/WaBusinessCoordinator'
import type { WaEmailCoordinator } from '@client/coordinators/WaEmailCoordinator'
import type { WaGroupCoordinator } from '@client/coordinators/WaGroupCoordinator'
import type { WaLowLevelCoordinator } from '@client/coordinators/WaLowLevelCoordinator'
import type { WaMessageCoordinator } from '@client/coordinators/WaMessageCoordinator'
import type { WaNewsletterCoordinator } from '@client/coordinators/WaNewsletterCoordinator'
import type { WaPresenceCoordinator } from '@client/coordinators/WaPresenceCoordinator'
import type { WaPrivacyCoordinator } from '@client/coordinators/WaPrivacyCoordinator'
import type { WaProfileCoordinator } from '@client/coordinators/WaProfileCoordinator'
import type { WaStatusCoordinator } from '@client/coordinators/WaStatusCoordinator'
import { runHistorySyncNotification } from '@client/persistence/history-sync'
import { persistIncomingMailboxEntities } from '@client/persistence/mailbox'
import { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type {
    WaClientEventMap,
    WaClientOptions,
    WaIncomingMessageEvent,
    WaIncomingProtocolMessageEvent
} from '@client/types'
import {
    buildWaClientDependencies,
    resolveWaClientBase,
    type WaClientDependencies
} from '@client/WaClientFactory'
import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import { proto, type Proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/constants'
import { normalizeDeviceJid } from '@protocol/jid'
import { WA_LOGOUT_REASONS, type WaLogoutReason } from '@protocol/stream'
import { NOOP_MESSAGE_SECRET_STORE } from '@store/noop.store'
import { buildRemoveCompanionDeviceIq } from '@transport/node/builders/device'
import { assertIqResult, queryWithContext as queryNodeWithContext } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
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
    private readonly stores!: ReturnType<WaClientOptions['store']['session']>
    private readonly deps!: WaClientDependencies
    private readonly appStateSync!: WaAppStateSyncClient
    private readonly mediaTransfer!: WaMediaTransferClient
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
        this.stores = base.sessionStore
        this.writeBehind = new WriteBehindPersistence(
            {
                messageStore: this.stores.messages,
                threadStore: this.stores.threads,
                contactStore: this.stores.contacts
            },
            this.logger,
            this.options.writeBehind
        )

        if (
            this.options.addons?.autoDecrypt &&
            this.stores.messageSecret === NOOP_MESSAGE_SECRET_STORE
        ) {
            this.logger.warn(
                'addons.autoDecrypt is enabled but messageSecret cache is noop — ' +
                    'addon decryption will only work if secrets are in the message store'
            )
        }

        const dependencies = buildWaClientDependencies({
            base,
            runtime: {
                sendNode: (node) => this.deps.lowLevelCoordinator.sendNode(node),
                query: (node, timeoutMs, options) =>
                    this.deps.lowLevelCoordinator.query(node, timeoutMs, options),
                queryWithContext: this.queryWithContext.bind(this),
                syncAppState: () => this.deps.chatCoordinator.sync().then(() => {}),
                syncAppStateWithOptions: (syncOptions) =>
                    this.deps.chatCoordinator.sync(syncOptions),
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
                },
                subscribeProtocolMessage: (handler) => {
                    this.on('message_protocol', handler)
                    return () => {
                        this.off('message_protocol', handler)
                    }
                }
            }
        })
        this.deps = dependencies
        this.appStateSync = dependencies.appStateSync
        this.mediaTransfer = dependencies.mediaTransfer

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
        const connected = this.deps.connectionManager.isConnected()
        this.logger.trace('wa client state requested', { connected })
        return this.deps.authClient.getState(connected)
    }

    public getCredentials() {
        return this.deps.authClient.getCurrentCredentials()
    }

    public getClockSkewMs(): number | null {
        return this.deps.connectionManager.getClockSkewMs()
    }

    private bindNodeTransportEvents(): void {
        this.deps.nodeTransport.on('frame_in', (frame) =>
            this.emit('debug_transport_frame_in', { frame })
        )
        this.deps.nodeTransport.on('frame_out', (frame) =>
            this.emit('debug_transport_frame_out', { frame })
        )
        this.deps.nodeTransport.on('node_in', (node, frame) =>
            this.emit('debug_transport_node_in', { node, frame })
        )
        this.deps.nodeTransport.on('node_out', (node, frame) =>
            this.emit('debug_transport_node_out', { node, frame })
        )
        this.deps.nodeTransport.on('decode_error', (error, frame) => {
            this.emit('debug_transport_decode_error', { error, frame })
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
                messageSecretStore: this.stores.messageSecret,
                event
            })
            if (this.options.addons?.autoDecrypt && event.message) {
                void this.deps.messageCoordinator.tryDecryptAddon(event).catch((err) => {
                    this.logger.warn('addon auto-decrypt failed', {
                        id: event.stanzaId,
                        message: toError(err).message
                    })
                })
            }
            // Decode unconditionally — chunks whose parent prompt we never sent
            // are skipped by the secret-store lookup downstream.
            if (event.message) {
                void this.deps.botCoordinator.tryDecryptChunk(event).catch((err) => {
                    this.logger.warn('bot chunk auto-decrypt failed', {
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
                await this.appStateSync.handleIncomingKeyRequest(event, protocolMessage)
                return
            }

            if (protocolType === proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_SHARE) {
                await this.appStateSync.handleIncomingKeyShare(event, protocolMessage)
                return
            }

            if (protocolType === proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION) {
                if (this.options.history?.enabled && protocolMessage.historySyncNotification) {
                    await runHistorySyncNotification(
                        {
                            logger: this.logger,
                            mediaTransfer: this.mediaTransfer,
                            writeBehind: this.writeBehind,
                            emitEvent: this.emit.bind(this) as Parameters<
                                typeof runHistorySyncNotification
                            >[0]['emitEvent'],
                            onPrivacyTokens: (conversations) =>
                                this.deps.trustedContactToken.hydrateFromHistorySync(conversations),
                            onNctSalt: (salt) =>
                                this.deps.trustedContactToken.hydrateNctSaltFromHistorySync(salt)
                        },
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

    private async queryWithContext(
        context: string,
        node: BinaryNode,
        timeoutMs: number = this.options.iqTimeoutMs ?? WA_DEFAULTS.IQ_TIMEOUT_MS,
        contextData: Readonly<Record<string, unknown>> = {},
        options: { readonly useSystemId?: boolean } = {}
    ): Promise<BinaryNode> {
        return queryNodeWithContext(
            async (queryNode, queryTimeoutMs) =>
                this.deps.lowLevelCoordinator.query(queryNode, queryTimeoutMs, options),
            this.logger,
            context,
            node,
            timeoutMs,
            contextData
        )
    }

    private async handleIncomingFrame(frame: Uint8Array): Promise<void> {
        try {
            await this.deps.nodeTransport.dispatchIncomingFrame(frame, async (node) =>
                this.deps.incomingNode.handleIncomingNode(node)
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
        this.connectPromise = this.deps.connectionManager
            .connect((frame) => this.handleIncomingFrame(frame))
            .then(() => {
                if (!this.deps.authClient.getCurrentCredentials()?.meJid) {
                    return
                }
                this.emit('connection', {
                    status: 'open',
                    reason: 'connected',
                    code: null,
                    isLogout: false,
                    isNewLogin: false
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
        await this.deps.connectionManager.disconnect()
        this.emit('connection', {
            status: 'close',
            reason: 'client_disconnected',
            code: null,
            isLogout: false,
            isNewLogin: false
        })
    }

    public get auth(): WaAuthClient {
        return this.deps.authClient
    }
    public get message(): WaMessageCoordinator {
        return this.deps.messageCoordinator
    }
    public get presence(): WaPresenceCoordinator {
        return this.deps.presenceCoordinator
    }
    public get lowlevel(): WaLowLevelCoordinator {
        return this.deps.lowLevelCoordinator
    }
    public get chat(): WaAppStateMutationCoordinator {
        return this.deps.chatCoordinator
    }
    public get group(): WaGroupCoordinator {
        return this.deps.groupCoordinator
    }
    public get status(): WaStatusCoordinator {
        return this.deps.statusCoordinator
    }
    public get broadcastList(): WaBroadcastListCoordinator {
        return this.deps.broadcastListCoordinator
    }
    public get newsletter(): WaNewsletterCoordinator {
        return this.deps.newsletterCoordinator
    }
    public get privacy(): WaPrivacyCoordinator {
        return this.deps.privacyCoordinator
    }
    public get profile(): WaProfileCoordinator {
        return this.deps.profileCoordinator
    }
    public get business(): WaBusinessCoordinator {
        return this.deps.businessCoordinator
    }
    public get bot(): WaBotCoordinator {
        return this.deps.botCoordinator
    }
    public get email(): WaEmailCoordinator {
        return this.deps.emailCoordinator
    }

    public async logout(reason: WaLogoutReason = WA_LOGOUT_REASONS.USER_INITIATED): Promise<void> {
        const meJid = this.deps.authClient.getCurrentCredentials()?.meJid
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
        const danglingReceipts = this.deps.receiptQueue.take()
        if (danglingReceipts.length > 0) {
            this.logger.debug('cleared dangling receipts while clearing stored state', {
                count: danglingReceipts.length
            })
        }

        const s = this.options.logoutStoreClear
        const shouldClear = (key: keyof NonNullable<typeof s>): boolean =>
            s === undefined || s[key] !== false

        if (shouldClear('auth')) await this.deps.authClient.clearStoredCredentials()
        if (shouldClear('appState')) await this.stores.appState.clear()
        if (shouldClear('contacts')) await this.stores.contacts.clear()
        if (shouldClear('messages')) await this.stores.messages.clear()
        if (shouldClear('messageSecret')) await this.stores.messageSecret.clear()
        if (shouldClear('groupMetadata')) await this.stores.groupMetadata.clear()
        if (shouldClear('deviceList')) await this.stores.deviceList.clear()
        if (shouldClear('retry')) await this.stores.retry.clear()
        if (shouldClear('signal')) await this.stores.signal.clear()
        if (shouldClear('preKey')) await this.stores.preKey.clear()
        if (shouldClear('session')) await this.stores.session.clear()
        if (shouldClear('identity')) await this.stores.identity.clear()
        if (shouldClear('senderKey')) await this.stores.senderKey.clear()
        if (shouldClear('threads')) await this.stores.threads.clear()
        if (shouldClear('privacyToken')) await this.stores.privacyToken.clear()
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
        this.emit('debug_client_error', { error })
    }
}
