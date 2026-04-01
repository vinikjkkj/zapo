import type { WaAppStateSyncOptions, WaAppStateSyncResult } from '@appstate/types'
import { WaAppStateSyncClient } from '@appstate/WaAppStateSyncClient'
import { WaAuthClient } from '@auth/WaAuthClient'
import { WaConnectionManager } from '@client/connection/WaConnectionManager'
import { WaKeyShareCoordinator } from '@client/connection/WaKeyShareCoordinator'
import { WaReceiptQueue } from '@client/connection/WaReceiptQueue'
import { WaAbPropsCoordinator } from '@client/coordinators/WaAbPropsCoordinator'
import { WaAppStateMutationCoordinator } from '@client/coordinators/WaAppStateMutationCoordinator'
import {
    createBusinessCoordinator,
    type WaBusinessCoordinator
} from '@client/coordinators/WaBusinessCoordinator'
import {
    createGroupCoordinator,
    type WaGroupCoordinator
} from '@client/coordinators/WaGroupCoordinator'
import { WaIncomingNodeCoordinator } from '@client/coordinators/WaIncomingNodeCoordinator'
import { WaMessageDispatchCoordinator } from '@client/coordinators/WaMessageDispatchCoordinator'
import { WaPassiveTasksCoordinator } from '@client/coordinators/WaPassiveTasksCoordinator'
import {
    createPrivacyCoordinator,
    type WaPrivacyCoordinator
} from '@client/coordinators/WaPrivacyCoordinator'
import {
    createProfileCoordinator,
    type WaProfileCoordinator
} from '@client/coordinators/WaProfileCoordinator'
import { WaRetryCoordinator } from '@client/coordinators/WaRetryCoordinator'
import {
    createStreamControlHandler,
    type WaStreamControlHandler
} from '@client/coordinators/WaStreamControlCoordinator'
import { WaTrustedContactTokenCoordinator } from '@client/coordinators/WaTrustedContactTokenCoordinator'
import { handleDirtyBits, parseDirtyBits } from '@client/dirty'
import { DEVICE_NOTIFICATION_ACTIONS, parseDeviceNotification } from '@client/events/devices'
import { parseIdentityChangeNotification } from '@client/events/identity'
import { parsePrivacyTokenNotification } from '@client/events/privacy-token'
import {
    buildMediaMessageContent,
    getMediaConn as getClientMediaConn,
    type WaMediaMessageOptions
} from '@client/messages'
import { createDeviceFanoutResolver } from '@client/messaging/fanout'
import { createAppStateSyncKeyProtocol } from '@client/messaging/key-protocol'
import { createGroupParticipantsCache } from '@client/messaging/participants'
import type {
    WaClientEventMap,
    WaClientOptions,
    WaIncomingMessageEvent,
    WaIncomingUnhandledStanzaEvent
} from '@client/types'
import type { Logger } from '@infra/log/types'
import type { WaMediaConn } from '@media/types'
import { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { handleIncomingMessageAck } from '@message/incoming'
import { WaMessageClient } from '@message/WaMessageClient'
import {
    getWaCompanionPlatformId,
    WA_DEFAULTS,
    WA_DISCONNECT_REASONS,
    WA_NODE_TAGS,
    WA_NOTIFICATION_TYPES,
    WA_PRIVACY_TOKEN_NOTIFICATION_TYPE
} from '@protocol/constants'
import { parseSignalAddressFromJid, toUserJid } from '@protocol/jid'
import type { WaConnectionCode, WaConnectionOpenReason, WaDisconnectReason } from '@protocol/stream'
import { createOutboundRetryTracker } from '@retry/tracker'
import type { WaRetryDecryptFailureContext } from '@retry/types'
import { SignalDeviceSyncApi } from '@signal/api/SignalDeviceSyncApi'
import { SignalDigestSyncApi } from '@signal/api/SignalDigestSyncApi'
import { SignalIdentitySyncApi } from '@signal/api/SignalIdentitySyncApi'
import { SignalMissingPreKeysSyncApi } from '@signal/api/SignalMissingPreKeysSyncApi'
import { SignalRotateKeyApi } from '@signal/api/SignalRotateKeyApi'
import { SignalSessionSyncApi } from '@signal/api/SignalSessionSyncApi'
import { SenderKeyManager } from '@signal/group/SenderKeyManager'
import { createSignalSessionResolver } from '@signal/session/resolver'
import { SignalProtocol } from '@signal/session/SignalProtocol'
import { WaKeepAlive } from '@transport/keepalive/WaKeepAlive'
import { buildAckNode } from '@transport/node/builders/global'
import { getFirstNodeChild } from '@transport/node/helpers'
import { createUsyncSidGenerator } from '@transport/node/usync'
import { WaNodeOrchestrator } from '@transport/node/WaNodeOrchestrator'
import { WaNodeTransport } from '@transport/node/WaNodeTransport'
import { isProxyTransport, toProxyAgent, toProxyDispatcher } from '@transport/proxy'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'
import { getRuntimeOsDisplayName } from '@util/runtime'

interface WaClientBase {
    readonly options: Readonly<WaClientOptions>
    readonly logger: Logger
    readonly sessionStore: ReturnType<WaClientOptions['store']['session']>
}

interface WaClientBuildRuntime {
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly syncAppState: () => Promise<void>
    readonly syncAppStateWithOptions: (
        options?: WaAppStateSyncOptions
    ) => Promise<WaAppStateSyncResult>
    readonly emitEvent: <K extends keyof WaClientEventMap>(
        event: K,
        ...args: Parameters<WaClientEventMap[K]>
    ) => void
    readonly handleIncomingMessageEvent: (event: WaIncomingMessageEvent) => Promise<void>
    readonly handleError: (error: Error) => void
    readonly handleIncomingFrame: (frame: Uint8Array) => Promise<void>
    readonly clearStoredState: () => Promise<void>
    readonly resumeIncomingEvents: () => void
}

interface WaClientDependencies {
    readonly nodeTransport: WaNodeTransport
    readonly nodeOrchestrator: WaNodeOrchestrator
    readonly keepAlive: WaKeepAlive
    readonly mediaTransfer: WaMediaTransferClient
    readonly mediaMessageBuildOptions: WaMediaMessageOptions
    readonly messageClient: WaMessageClient
    readonly senderKeyManager: SenderKeyManager
    readonly signalProtocol: SignalProtocol
    readonly signalDigestSync: SignalDigestSyncApi
    readonly signalDeviceSync: SignalDeviceSyncApi
    readonly signalIdentitySync: SignalIdentitySyncApi
    readonly signalMissingPreKeysSync: SignalMissingPreKeysSyncApi
    readonly signalRotateKey: SignalRotateKeyApi
    readonly signalSessionSync: SignalSessionSyncApi
    readonly authClient: WaAuthClient
    readonly messageDispatch: WaMessageDispatchCoordinator
    readonly retryCoordinator: WaRetryCoordinator
    readonly appStateSync: WaAppStateSyncClient
    readonly chatCoordinator: WaAppStateMutationCoordinator
    readonly streamControl: WaStreamControlHandler
    readonly incomingNode: WaIncomingNodeCoordinator
    readonly passiveTasks: WaPassiveTasksCoordinator
    readonly groupCoordinator: WaGroupCoordinator
    readonly privacyCoordinator: WaPrivacyCoordinator
    readonly profileCoordinator: WaProfileCoordinator
    readonly businessCoordinator: WaBusinessCoordinator
    readonly receiptQueue: WaReceiptQueue
    readonly keyShareCoordinator: WaKeyShareCoordinator
    readonly connectionManager: WaConnectionManager
    readonly trustedContactToken: WaTrustedContactTokenCoordinator
    readonly abPropsCoordinator: WaAbPropsCoordinator
}

function assertProxyTransport(value: unknown, path: string): void {
    if (value === undefined) {
        return
    }
    if (!isProxyTransport(value)) {
        throw new Error(
            `${path} must be a proxy transport instance (dispatcher with dispatch(...) or agent with addRequest(...))`
        )
    }
}

function validateProxyOptions(options: WaClientOptions): void {
    const rawProxy = options.proxy as unknown
    if (rawProxy === undefined) {
        return
    }
    if (typeof rawProxy !== 'object' || rawProxy === null || Array.isArray(rawProxy)) {
        throw new Error('proxy must be an object with optional ws/mediaUpload/mediaDownload')
    }
    const proxy = rawProxy as {
        readonly ws?: unknown
        readonly mediaUpload?: unknown
        readonly mediaDownload?: unknown
    }
    assertProxyTransport(proxy?.ws, 'proxy.ws')
    assertProxyTransport(proxy?.mediaUpload, 'proxy.mediaUpload')
    assertProxyTransport(proxy?.mediaDownload, 'proxy.mediaDownload')
}

export function resolveWaClientBase(options: WaClientOptions, logger: Logger): WaClientBase {
    validateProxyOptions(options)

    const deviceBrowser = options.deviceBrowser ?? WA_DEFAULTS.DEVICE_BROWSER
    const sessionId = options.sessionId.trim()
    if (sessionId.length === 0) {
        throw new Error('sessionId must be a non-empty string')
    }

    const sessionStore = options.store.session(sessionId)
    const normalizedOptions = Object.freeze({
        ...options,
        sessionId,
        deviceBrowser,
        deviceOsDisplayName: options.deviceOsDisplayName ?? getRuntimeOsDisplayName(),
        devicePlatform: options.devicePlatform ?? getWaCompanionPlatformId(deviceBrowser),
        urls: options.urls ?? options.chatSocketUrls ?? WA_DEFAULTS.CHAT_SOCKET_URLS,
        iqTimeoutMs: options.iqTimeoutMs ?? WA_DEFAULTS.IQ_TIMEOUT_MS,
        nodeQueryTimeoutMs: options.nodeQueryTimeoutMs ?? WA_DEFAULTS.NODE_QUERY_TIMEOUT_MS,
        keepAliveIntervalMs: options.keepAliveIntervalMs ?? WA_DEFAULTS.HEALTH_CHECK_INTERVAL_MS,
        deadSocketTimeoutMs: options.deadSocketTimeoutMs ?? WA_DEFAULTS.DEAD_SOCKET_TIMEOUT_MS,
        mediaTimeoutMs: options.mediaTimeoutMs ?? WA_DEFAULTS.MEDIA_TIMEOUT_MS,
        appStateSyncTimeoutMs:
            options.appStateSyncTimeoutMs ?? WA_DEFAULTS.APP_STATE_SYNC_TIMEOUT_MS,
        signalFetchKeyBundlesTimeoutMs:
            options.signalFetchKeyBundlesTimeoutMs ??
            WA_DEFAULTS.SIGNAL_FETCH_KEY_BUNDLES_TIMEOUT_MS,
        messageAckTimeoutMs: options.messageAckTimeoutMs ?? WA_DEFAULTS.MESSAGE_ACK_TIMEOUT_MS,
        messageMaxAttempts: options.messageMaxAttempts ?? WA_DEFAULTS.MESSAGE_MAX_ATTEMPTS,
        messageRetryDelayMs: options.messageRetryDelayMs ?? WA_DEFAULTS.MESSAGE_RETRY_DELAY_MS
    })

    return {
        options: normalizedOptions,
        logger,
        sessionStore
    }
}

function createIncomingNodeRuntime(input: {
    readonly logger: Logger
    readonly emitEvent: <K extends keyof WaClientEventMap>(
        event: K,
        ...args: Parameters<WaClientEventMap[K]>
    ) => void
    readonly authClient: WaAuthClient
    readonly connectionManager: WaConnectionManager
    readonly nodeOrchestrator: WaNodeOrchestrator
    readonly streamControl: WaStreamControlHandler
    readonly mediaMessageBuildOptions: WaMediaMessageOptions
    readonly retryCoordinator: WaRetryCoordinator
    readonly messageDispatch: WaMessageDispatchCoordinator
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly syncAppState: () => Promise<void>
    readonly disconnect: (
        reason: WaDisconnectReason,
        isLogout: boolean,
        code: WaConnectionCode | null
    ) => Promise<void>
    readonly clearStoredCredentials: () => Promise<void>
    readonly getCurrentMeJid: () => string | null | undefined
    readonly handleClientDirtyBits: (
        dirtyBits: Parameters<typeof handleDirtyBits>[1]
    ) => Promise<void>
    readonly incomingMessageAckOptions: Parameters<typeof handleIncomingMessageAck>[1]
}): ConstructorParameters<typeof WaIncomingNodeCoordinator>[0]['runtime'] {
    const {
        logger,
        emitEvent,
        authClient,
        connectionManager,
        nodeOrchestrator,
        streamControl,
        mediaMessageBuildOptions,
        retryCoordinator,
        messageDispatch,
        sendNode,
        syncAppState,
        disconnect,
        clearStoredCredentials,
        getCurrentMeJid,
        handleClientDirtyBits,
        incomingMessageAckOptions
    } = input

    return {
        handleStreamControlResult: streamControl.handleStreamControlResult,
        persistSuccessAttributes: (attributes) => authClient.persistSuccessAttributes(attributes),
        emitSuccessNode: (node) => emitEvent('connection_success', { node }),
        updateClockSkewFromSuccess: (serverUnixSeconds) =>
            connectionManager.updateClockSkewFromSuccess(serverUnixSeconds),
        shouldWarmupMediaConn: () => !!(getCurrentMeJid() && connectionManager.isConnected()),
        warmupMediaConn: async () => {
            await getClientMediaConn(mediaMessageBuildOptions, true)
        },
        persistRoutingInfo: (routingInfo) => authClient.persistRoutingInfo(routingInfo),
        tryResolvePendingNode: (node) => nodeOrchestrator.tryResolvePending(node),
        handleGenericIncomingNode: (node) => nodeOrchestrator.handleIncomingNode(node),
        handleIncomingIqSetNode: (node) => authClient.handleIncomingIqSet(node),
        handleLinkCodeNotificationNode: (node) => authClient.handleLinkCodeNotification(node),
        handleCompanionRegRefreshNotificationNode: (node) =>
            authClient.handleCompanionRegRefreshNotification(node),
        handleIncomingMessageNode: (node) =>
            handleIncomingMessageAck(node, incomingMessageAckOptions),
        sendNode,
        handleIncomingRetryReceipt: (node) => retryCoordinator.handleIncomingRetryReceipt(node),
        trackOutboundReceipt: (node) => retryCoordinator.trackOutboundReceipt(node),
        emitIncomingReceipt: (event) => emitEvent('message_receipt', event),
        emitIncomingPresence: (event) => emitEvent('presence', event),
        emitIncomingChatstate: (event) => emitEvent('chatstate', event),
        emitIncomingCall: (event) => emitEvent('call', event),
        emitIncomingFailure: (event) => emitEvent('failure', event),
        emitIncomingErrorStanza: (event) => emitEvent('stanza_error', event),
        emitIncomingNotification: (event) => emitEvent('notification', event),
        emitGroupEvent: (event) => {
            emitEvent('group_event', event)
            void messageDispatch.mutateParticipantsCacheFromGroupEvent(event).catch((error) => {
                logger.warn('failed to mutate participants cache from group event', {
                    action: event.action,
                    groupJid: event.groupJid,
                    contextGroupJid: event.contextGroupJid,
                    message: toError(error).message
                })
            })
        },
        emitUnhandledIncomingNode: (event) => emitEvent('stanza_unhandled', event),
        syncAppState,
        stopComms: () => {
            void connectionManager.getComms()?.stopComms()
        },
        disconnect,
        clearStoredCredentials,
        parseDirtyBits: (nodes) => parseDirtyBits(nodes, logger),
        handleDirtyBits: (dirtyBits) => handleClientDirtyBits(dirtyBits)
    }
}

function createPassiveTasksRuntime(input: {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly authClient: WaAuthClient
    readonly nodeOrchestrator: WaNodeOrchestrator
    readonly receiptQueue: WaReceiptQueue
    readonly getCurrentCredentials: () => ReturnType<WaAuthClient['getCurrentCredentials']>
    readonly abPropsCoordinator: WaAbPropsCoordinator
}): ConstructorParameters<typeof WaPassiveTasksCoordinator>[0]['runtime'] {
    const {
        queryWithContext,
        authClient,
        nodeOrchestrator,
        receiptQueue,
        getCurrentCredentials,
        abPropsCoordinator
    } = input

    return {
        queryWithContext,
        getCurrentCredentials,
        persistServerHasPreKeys: (serverHasPreKeys) =>
            authClient.persistServerHasPreKeys(serverHasPreKeys),
        sendNodeDirect: (node) => nodeOrchestrator.sendNode(node),
        takeDanglingReceipts: () => receiptQueue.take(),
        requeueDanglingReceipt: (node) => receiptQueue.enqueue(node),
        shouldQueueDanglingReceipt: (node, error) => receiptQueue.shouldQueue(node, error),
        syncAbProps: () => abPropsCoordinator.sync()
    }
}

export function buildWaClientDependencies(input: {
    readonly base: WaClientBase
    readonly runtime: WaClientBuildRuntime
}): WaClientDependencies {
    const { base, runtime } = input
    const { options, logger, sessionStore } = base

    const receiptQueue = new WaReceiptQueue()
    const keyShareCoordinator = new WaKeyShareCoordinator()

    let connectionManager: WaConnectionManager | null = null
    let passiveTasks: WaPassiveTasksCoordinator | null = null
    let mediaConnCacheFallback: WaMediaConn | null = null
    let scheduleReconnectAfterPairing: () => void = () => undefined

    const nodeTransport = new WaNodeTransport(logger)
    const nodeOrchestrator = new WaNodeOrchestrator({
        sendNode: async (node) => nodeTransport.sendNode(node),
        logger,
        defaultTimeoutMs: options.nodeQueryTimeoutMs,
        hostDomain: WA_DEFAULTS.HOST_DOMAIN
    })
    const keepAlive = new WaKeepAlive({
        logger,
        nodeOrchestrator,
        getComms: () => connectionManager?.getComms() ?? null,
        intervalMs: options.keepAliveIntervalMs,
        timeoutMs: options.deadSocketTimeoutMs,
        hostDomain: WA_DEFAULTS.HOST_DOMAIN
    })

    const mediaTransfer = new WaMediaTransferClient({
        logger,
        defaultTimeoutMs: options.mediaTimeoutMs,
        defaultUploadDispatcher: toProxyDispatcher(options.proxy?.mediaUpload),
        defaultDownloadDispatcher: toProxyDispatcher(options.proxy?.mediaDownload),
        defaultUploadAgent: toProxyAgent(options.proxy?.mediaUpload),
        defaultDownloadAgent: toProxyAgent(options.proxy?.mediaDownload)
    })
    const mediaMessageBuildOptions: WaMediaMessageOptions = {
        logger,
        mediaTransfer,
        iqTimeoutMs: options.iqTimeoutMs,
        queryWithContext: runtime.queryWithContext,
        getMediaConnCache: () => {
            if (connectionManager) {
                return connectionManager.getMediaConnCache()
            }
            return mediaConnCacheFallback
        },
        setMediaConnCache: (mediaConn) => {
            mediaConnCacheFallback = mediaConn
            connectionManager?.setMediaConnCache(mediaConn)
        }
    }

    const messageClient = new WaMessageClient({
        logger,
        sendNode: runtime.sendNode,
        query: runtime.query,
        defaultAckTimeoutMs: options.messageAckTimeoutMs,
        defaultMaxAttempts: options.messageMaxAttempts,
        defaultRetryDelayMs: options.messageRetryDelayMs
    })
    const senderKeyManager = new SenderKeyManager(sessionStore.senderKey)
    const signalProtocol = new SignalProtocol(
        {
            signal: sessionStore.signal,
            preKey: sessionStore.preKey,
            session: sessionStore.session,
            identity: sessionStore.identity
        },
        logger
    )
    const signalDigestSync = new SignalDigestSyncApi({
        logger,
        query: runtime.query,
        signalStore: sessionStore.signal,
        preKeyStore: sessionStore.preKey,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs
    })
    const generateUsyncSid = createUsyncSidGenerator()
    const signalDeviceSync = new SignalDeviceSyncApi({
        logger,
        query: runtime.query,
        deviceListStore: sessionStore.deviceList,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs,
        generateSid: generateUsyncSid
    })
    const signalIdentitySync = new SignalIdentitySyncApi({
        logger,
        query: runtime.query,
        identityStore: sessionStore.identity,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs
    })
    const signalMissingPreKeysSync = new SignalMissingPreKeysSyncApi({
        logger,
        query: runtime.query,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs
    })
    const signalRotateKey = new SignalRotateKeyApi({
        logger,
        query: runtime.query,
        signalStore: sessionStore.signal,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs
    })
    const signalSessionSync = new SignalSessionSyncApi({
        logger,
        query: runtime.query,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs
    })

    const authClient = new WaAuthClient(
        {
            deviceBrowser: options.deviceBrowser,
            deviceOsDisplayName: options.deviceOsDisplayName,
            devicePlatform: options.devicePlatform,
            requireFullSync: options.requireFullSync,
            version: options.version
        },
        {
            logger,
            authStore: sessionStore.auth,
            signalStore: sessionStore.signal,
            preKeyStore: sessionStore.preKey,
            socket: {
                sendNode: runtime.sendNode,
                query: runtime.query
            },
            callbacks: {
                onQr: (qr, ttlMs) => runtime.emitEvent('auth_qr', { qr, ttlMs }),
                onPairingCode: (code) => runtime.emitEvent('auth_pairing_code', { code }),
                onPairingRefresh: (forceManual) =>
                    runtime.emitEvent('auth_pairing_refresh', { forceManual }),
                onPaired: (credentials) => {
                    runtime.emitEvent('auth_paired', { credentials })
                    scheduleReconnectAfterPairing()
                },
                onError: (error) => runtime.handleError(error)
            }
        }
    )

    const getCurrentCredentials = authClient.getCurrentCredentials.bind(authClient)
    const getCurrentMeJid = () => getCurrentCredentials()?.meJid
    const getCurrentMeLid = () => getCurrentCredentials()?.meLid
    const getCurrentSignedIdentity = () => getCurrentCredentials()?.signedIdentity

    const groupCoordinator = createGroupCoordinator({
        queryWithContext: runtime.queryWithContext
    })

    const privacyCoordinator = createPrivacyCoordinator({
        queryWithContext: runtime.queryWithContext
    })

    const profileCoordinator = createProfileCoordinator({
        queryWithContext: runtime.queryWithContext,
        generateSid: generateUsyncSid
    })

    const businessCoordinator = createBusinessCoordinator({
        queryWithContext: runtime.queryWithContext
    })

    const retryTracker = createOutboundRetryTracker({
        retryStore: sessionStore.retry,
        logger
    })
    const sessionResolver = createSignalSessionResolver({
        signalProtocol,
        sessionStore: sessionStore.session,
        identityStore: sessionStore.identity,
        signalIdentitySync,
        signalSessionSync,
        logger
    })
    const fanoutResolver = createDeviceFanoutResolver({
        signalDeviceSync,
        getCurrentMeJid,
        getCurrentMeLid,
        logger
    })
    const participantsCache = createGroupParticipantsCache({
        participantsStore: sessionStore.participants,
        queryGroupParticipantJids: async (groupJid) => {
            const metadata = await groupCoordinator.queryGroupMetadata(groupJid)
            const participantJids = new Array<string>(metadata.participants.length)
            for (let index = 0; index < metadata.participants.length; index += 1) {
                participantJids[index] = metadata.participants[index].jid
            }
            return participantJids
        },
        logger
    })

    const trustedContactToken = new WaTrustedContactTokenCoordinator({
        logger,
        store: sessionStore.privacyToken,
        runtime: {
            queryWithContext: runtime.queryWithContext,
            emitEvent: runtime.emitEvent,
            getCurrentMeLid: () => getCurrentMeLid() ?? null
        },
        durationS: options.privacyToken?.tcTokenDurationS,
        numBuckets: options.privacyToken?.tcTokenNumBuckets,
        senderDurationS: options.privacyToken?.tcTokenSenderDurationS,
        senderNumBuckets: options.privacyToken?.tcTokenSenderNumBuckets,
        maxDurationS: options.privacyToken?.tcTokenMaxDurationS
    })

    const abPropsCoordinator = new WaAbPropsCoordinator({
        logger,
        runtime: {
            queryWithContext: runtime.queryWithContext
        }
    })

    let messageDispatch!: WaMessageDispatchCoordinator

    const appStateSyncKeyProtocol = createAppStateSyncKeyProtocol({
        publishSignalMessage: (signalInput, publishOptions) =>
            messageDispatch.publishSignalMessage(signalInput, publishOptions),
        fanoutResolver,
        getCurrentMeJid,
        getCurrentMeLid,
        logger
    })

    messageDispatch = new WaMessageDispatchCoordinator({
        logger,
        messageClient,
        retryTracker,
        sessionResolver,
        fanoutResolver,
        participantsCache,
        appStateSyncKeyProtocol,
        buildMessageContent: async (content) =>
            buildMediaMessageContent(mediaMessageBuildOptions, content),
        senderKeyManager,
        signalProtocol,
        signalStore: sessionStore.signal,
        sessionStore: sessionStore.session,
        identityStore: sessionStore.identity,
        deviceListStore: sessionStore.deviceList,
        messageSecretStore: sessionStore.messageSecret,
        getCurrentMeJid,
        getCurrentMeLid,
        getCurrentSignedIdentity,
        resolvePrivacyTokenNode: (recipientJid) =>
            trustedContactToken.resolveTokenForMessage(recipientJid),
        onDirectMessageSent: (recipientJid) => {
            trustedContactToken.maybeIssueSenderToken(recipientJid).catch((err) =>
                logger.warn('sender token issue failed', {
                    to: recipientJid,
                    message: toError(err).message
                })
            )
        }
    })

    const retryCoordinator = new WaRetryCoordinator({
        logger,
        retryStore: sessionStore.retry,
        signalStore: sessionStore.signal,
        preKeyStore: sessionStore.preKey,
        sessionStore: sessionStore.session,
        senderKeyStore: sessionStore.senderKey,
        signalProtocol,
        signalDeviceSync,
        signalMissingPreKeysSync,
        messageClient,
        sendNode: runtime.sendNode,
        getCurrentMeJid,
        getCurrentMeLid,
        getCurrentSignedIdentity
    })

    const appStateSync = new WaAppStateSyncClient({
        logger,
        query: runtime.query,
        getCurrentMeJid,
        defaultTimeoutMs: options.appStateSyncTimeoutMs,
        store: sessionStore.appState,
        onMissingKeys: async ({ keyIds }) => {
            await messageDispatch.requestAppStateSyncKeys(keyIds)
        }
    })

    const appStateMutations = new WaAppStateMutationCoordinator({
        logger,
        messageStore: sessionStore.messages,
        syncAppState: runtime.syncAppStateWithOptions
    })

    connectionManager = new WaConnectionManager({
        logger,
        options,
        authClient,
        keepAlive,
        nodeOrchestrator,
        nodeTransport,
        getPassiveTasks: () => passiveTasks,
        clearStoredCredentials: runtime.clearStoredState
    })

    if (mediaConnCacheFallback !== null) {
        connectionManager.setMediaConnCache(mediaConnCacheFallback)
    }
    scheduleReconnectAfterPairing = () => connectionManager?.scheduleReconnectAfterPairing()

    const disconnectWithClientSideEffects = async (
        reason: WaDisconnectReason,
        isLogout: boolean,
        code: WaConnectionCode | null
    ): Promise<void> => {
        keyShareCoordinator.notifyDisconnected()
        abPropsCoordinator.reset()
        await connectionManager?.disconnect()
        runtime.emitEvent('connection', {
            status: 'close',
            reason,
            code,
            isLogout,
            isNewLogin: false
        })
    }

    const connectWithClientSideEffects = async (reason: WaConnectionOpenReason): Promise<void> => {
        runtime.resumeIncomingEvents()
        await connectionManager?.connect(runtime.handleIncomingFrame)
        runtime.emitEvent('connection', {
            status: 'open',
            reason,
            code: null,
            isLogout: false,
            isNewLogin: connectionManager?.wasNewLogin() ?? false
        })
    }

    const clearStoredCredentialsWithClientSideEffects = async (): Promise<void> => {
        await connectionManager?.clearStoredCredentials()
    }

    const streamControl = createStreamControlHandler({
        logger,
        getComms: () => connectionManager?.getComms() ?? null,
        clearPendingQueries: (error) => nodeOrchestrator.clearPending(error),
        clearMediaConnCache: () => {
            mediaConnCacheFallback = null
            connectionManager?.setMediaConnCache(null)
        },
        disconnect: disconnectWithClientSideEffects,
        clearStoredCredentials: clearStoredCredentialsWithClientSideEffects,
        connect: connectWithClientSideEffects
    })

    const incomingMessageAckOptions: Parameters<typeof handleIncomingMessageAck>[1] = {
        logger,
        sendNode: runtime.sendNode,
        getMeJid: getCurrentMeJid,
        signalProtocol,
        senderKeyManager,
        onDecryptFailure: (context: WaRetryDecryptFailureContext, error: unknown) =>
            retryCoordinator.onDecryptFailure(context, error),
        emitIncomingMessage: (event: WaIncomingMessageEvent) => {
            void runtime
                .handleIncomingMessageEvent(event)
                .catch((err) => runtime.handleError(toError(err)))
        },
        emitUnhandledStanza: (event: WaIncomingUnhandledStanzaEvent) =>
            runtime.emitEvent('stanza_unhandled', event)
    }

    const handleClientDirtyBits = (dirtyBits: Parameters<typeof handleDirtyBits>[1]) =>
        handleDirtyBits(
            {
                logger,
                queryWithContext: runtime.queryWithContext,
                getCurrentCredentials,
                syncAppState: runtime.syncAppState,
                generateUsyncSid
            },
            dirtyBits
        )

    const incomingNode = new WaIncomingNodeCoordinator({
        logger,
        runtime: createIncomingNodeRuntime({
            logger,
            emitEvent: runtime.emitEvent,
            authClient,
            connectionManager,
            nodeOrchestrator,
            streamControl,
            mediaMessageBuildOptions,
            retryCoordinator,
            messageDispatch,
            sendNode: runtime.sendNode,
            syncAppState: runtime.syncAppState,
            disconnect: disconnectWithClientSideEffects,
            clearStoredCredentials: clearStoredCredentialsWithClientSideEffects,
            getCurrentMeJid,
            handleClientDirtyBits,
            incomingMessageAckOptions
        })
    })

    incomingNode.registerIncomingHandler({
        tag: WA_NODE_TAGS.NOTIFICATION,
        subtype: WA_NOTIFICATION_TYPES.ENCRYPT,
        prepend: true,
        handler: async (node) => {
            const firstChild = getFirstNodeChild(node)
            if (!firstChild) {
                return false
            }

            const childTag = firstChild.tag

            // <count value="N"/> — server prekeys running low
            if (childTag === 'count') {
                const ackNode = buildAckNode({
                    kind: 'notification',
                    node,
                    includeType: false
                })
                await runtime.sendNode(ackNode)

                const tasks = passiveTasks
                if (!tasks) {
                    logger.warn('encrypt-count: passive tasks not available')
                    return true
                }
                await tasks.handlePreKeyLowNotification().catch((error) => {
                    logger.warn('encrypt-count: prekey upload failed', {
                        message: toError(error).message
                    })
                })
                return true
            }

            // <digest/> — digest key sync
            if (childTag === 'digest') {
                const ackNode = buildAckNode({
                    kind: 'notification',
                    node,
                    includeType: false
                })
                await runtime.sendNode(ackNode)

                const tasks = passiveTasks
                if (!tasks) {
                    logger.warn('encrypt-digest: passive tasks not available')
                    return true
                }
                await tasks.handleDigestNotification().catch((error) => {
                    logger.warn('encrypt-digest: digest sync failed', {
                        message: toError(error).message
                    })
                })
                return true
            }

            // <identity/> — contact identity key changed
            if (childTag === 'identity') {
                const parsed = parseIdentityChangeNotification(node)
                if (!parsed) {
                    return false
                }

                const ackNode = buildAckNode({
                    kind: 'notification',
                    node,
                    includeType: false
                })
                await runtime.sendNode(ackNode)

                const address = parseSignalAddressFromJid(parsed.fromJid)

                // ignore companion devices (non-primary)
                if (address.device !== 0) {
                    logger.debug('identity-change: ignoring companion device', {
                        jid: parsed.fromJid
                    })
                    return true
                }

                // self-primary identity change → must disconnect
                const meJid = getCurrentMeJid()
                if (meJid) {
                    const meUser = toUserJid(meJid)
                    const fromUser = toUserJid(parsed.fromJid)
                    if (meUser === fromUser) {
                        logger.error('self primary identity changed, disconnecting')
                        void connectionManager?.getComms()?.stopComms()
                        await disconnectWithClientSideEffects(
                            WA_DISCONNECT_REASONS.PRIMARY_IDENTITY_KEY_CHANGE,
                            true,
                            null
                        )
                        await clearStoredCredentialsWithClientSideEffects()
                        return true
                    }
                }

                const oldIdentity = await sessionStore.identity.getRemoteIdentity(address)

                if (oldIdentity) {
                    logger.info('identity-change: clearing session', {
                        jid: parsed.fromJid
                    })
                    await sessionStore.session.deleteSession(address)

                    const userJid = toUserJid(parsed.fromJid)
                    await trustedContactToken.reissueOnIdentityChange(userJid).catch((error) => {
                        logger.warn('identity-change: reissue tc token failed', {
                            message: toError(error).message
                        })
                    })
                }

                runtime.emitEvent('notification', {
                    rawNode: node,
                    stanzaId: parsed.stanzaId,
                    chatJid: parsed.fromJid,
                    stanzaType: 'encrypt',
                    notificationType: 'encrypt',
                    classification: 'core',
                    details: {
                        kind: 'identity_change',
                        displayName: parsed.displayName,
                        lid: parsed.lid,
                        hadPreviousIdentity: !!oldIdentity
                    }
                })

                return true
            }

            return false
        }
    })

    incomingNode.registerIncomingHandler({
        tag: WA_NODE_TAGS.NOTIFICATION,
        subtype: WA_NOTIFICATION_TYPES.DEVICES,
        prepend: true,
        handler: async (node) => {
            const parsed = parseDeviceNotification(node)
            if (!parsed) {
                return false
            }

            const ackNode = buildAckNode({
                kind: 'notification',
                node,
                includeType: false
            })
            await runtime.sendNode(ackNode)

            const userJid = toUserJid(parsed.fromJid)

            if (parsed.action === DEVICE_NOTIFICATION_ACTIONS.REMOVE) {
                const baseAddress = parseSignalAddressFromJid(parsed.fromJid)
                for (const device of parsed.devices) {
                    const address = {
                        user: baseAddress.user,
                        server: baseAddress.server,
                        device: device.deviceId
                    }
                    await sessionStore.session.deleteSession(address).catch((error) => {
                        logger.warn('devices-notification: delete session failed', {
                            message: toError(error).message
                        })
                    })
                }
            }

            // invalidate device list cache so next fanout fetches fresh list
            if (sessionStore.deviceList) {
                await sessionStore.deviceList.deleteUserDevices(userJid).catch((error) => {
                    logger.warn('devices-notification: invalidate cache failed', {
                        message: toError(error).message
                    })
                })
            }

            // for update notifications, re-sync immediately
            if (parsed.action === DEVICE_NOTIFICATION_ACTIONS.UPDATE) {
                signalDeviceSync.syncDeviceList([userJid]).catch((error) => {
                    logger.warn('devices-notification: sync device list failed', {
                        message: toError(error).message
                    })
                })
            }

            runtime.emitEvent('notification', {
                rawNode: node,
                stanzaId: parsed.stanzaId,
                chatJid: parsed.fromJid,
                stanzaType: 'devices',
                notificationType: 'devices',
                classification: 'core',
                details: {
                    kind: 'device_list_change',
                    action: parsed.action,
                    devices: parsed.devices
                }
            })

            return true
        }
    })

    incomingNode.registerIncomingHandler({
        tag: WA_NODE_TAGS.NOTIFICATION,
        subtype: WA_PRIVACY_TOKEN_NOTIFICATION_TYPE,
        prepend: true,
        handler: async (node) => {
            const fromJid = node.attrs.from ?? node.attrs.sender_lid
            if (!fromJid) {
                return false
            }
            const tokens = parsePrivacyTokenNotification(node)
            if (tokens.length === 0) {
                return false
            }
            await trustedContactToken.handleIncomingToken(fromJid, tokens)
            const ackNode = buildAckNode({
                kind: 'notification',
                node,
                typeOverride: WA_PRIVACY_TOKEN_NOTIFICATION_TYPE
            })
            await runtime.sendNode(ackNode)
            return true
        }
    })

    // AB Props: sync after successful login and on server notification
    incomingNode.registerIncomingHandler({
        tag: WA_NODE_TAGS.NOTIFICATION,
        subtype: WA_NOTIFICATION_TYPES.SERVER,
        prepend: true,
        handler: async (node) => {
            const firstChild = getFirstNodeChild(node)
            if (!firstChild || firstChild.tag !== WA_NODE_TAGS.ABPROPS) {
                return false
            }
            const ackNode = buildAckNode({
                kind: 'notification',
                node,
                includeType: false
            })
            await runtime.sendNode(ackNode)
            abPropsCoordinator.sync()
            return true
        }
    })

    passiveTasks = new WaPassiveTasksCoordinator({
        logger,
        signalStore: sessionStore.signal,
        preKeyStore: sessionStore.preKey,
        signalDigestSync,
        signalRotateKey,
        runtime: createPassiveTasksRuntime({
            queryWithContext: runtime.queryWithContext,
            authClient,
            nodeOrchestrator,
            receiptQueue,
            getCurrentCredentials,
            abPropsCoordinator
        })
    })

    return {
        nodeTransport,
        nodeOrchestrator,
        keepAlive,
        mediaTransfer,
        mediaMessageBuildOptions,
        messageClient,
        senderKeyManager,
        signalProtocol,
        signalDigestSync,
        signalDeviceSync,
        signalIdentitySync,
        signalMissingPreKeysSync,
        signalRotateKey,
        signalSessionSync,
        authClient,
        messageDispatch,
        retryCoordinator,
        appStateSync,
        chatCoordinator: appStateMutations,
        streamControl,
        incomingNode,
        passiveTasks,
        groupCoordinator,
        privacyCoordinator,
        profileCoordinator,
        businessCoordinator,
        receiptQueue,
        keyShareCoordinator,
        connectionManager,
        trustedContactToken,
        abPropsCoordinator
    }
}
