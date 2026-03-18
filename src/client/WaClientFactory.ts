import { WaAppStateSyncClient } from '@appstate/WaAppStateSyncClient'
import { WaAuthClient } from '@auth/WaAuthClient'
import {
    createGroupCoordinator,
    type WaGroupCoordinator
} from '@client/coordinators/WaGroupCoordinator'
import { WaIncomingNodeCoordinator } from '@client/coordinators/WaIncomingNodeCoordinator'
import { WaMessageDispatchCoordinator } from '@client/coordinators/WaMessageDispatchCoordinator'
import { WaPassiveTasksCoordinator } from '@client/coordinators/WaPassiveTasksCoordinator'
import { WaRetryCoordinator } from '@client/coordinators/WaRetryCoordinator'
import {
    createStreamControlHandler,
    type WaStreamControlHandler
} from '@client/coordinators/WaStreamControlCoordinator'
import { handleDirtyBits, parseDirtyBits } from '@client/dirty'
import { buildMediaMessageContent, getMediaConn as getClientMediaConn } from '@client/messages'
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
import type { Proto } from '@proto'
import { getWaCompanionPlatformId, WA_DEFAULTS } from '@protocol/constants'
import type { WaRetryDecryptFailureContext } from '@retry/types'
import { SignalDeviceSyncApi } from '@signal/api/SignalDeviceSyncApi'
import { SignalDigestSyncApi } from '@signal/api/SignalDigestSyncApi'
import { SignalIdentitySyncApi } from '@signal/api/SignalIdentitySyncApi'
import { SignalMissingPreKeysSyncApi } from '@signal/api/SignalMissingPreKeysSyncApi'
import { SignalRotateKeyApi } from '@signal/api/SignalRotateKeyApi'
import { SignalSessionSyncApi } from '@signal/api/SignalSessionSyncApi'
import { SenderKeyManager } from '@signal/group/SenderKeyManager'
import { SignalProtocol } from '@signal/session/SignalProtocol'
import { WaKeepAlive } from '@transport/keepalive/WaKeepAlive'
import { createUsyncSidGenerator, type WaUsyncSidGenerator } from '@transport/node/usync'
import { WaNodeOrchestrator } from '@transport/node/WaNodeOrchestrator'
import { WaNodeTransport } from '@transport/node/WaNodeTransport'
import { isProxyTransport, toProxyAgent, toProxyDispatcher } from '@transport/proxy'
import type { BinaryNode } from '@transport/types'
import type { WaComms } from '@transport/WaComms'
import { toError } from '@util/primitives'
import { getRuntimeOsDisplayName } from '@util/runtime'

type WaMediaMessageBuildOptions = Parameters<typeof buildMediaMessageContent>[0]

interface WaClientBase {
    readonly options: Readonly<WaClientOptions>
    readonly logger: Logger
    readonly sessionStore: ReturnType<WaClientOptions['store']['session']>
}

interface WaClientDependencies {
    readonly nodeTransport: WaNodeTransport
    readonly nodeOrchestrator: WaNodeOrchestrator
    readonly keepAlive: WaKeepAlive
    readonly mediaTransfer: WaMediaTransferClient
    readonly mediaMessageBuildOptions: WaMediaMessageBuildOptions
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
    readonly streamControl: WaStreamControlHandler
    readonly incomingNode: WaIncomingNodeCoordinator
    readonly passiveTasks: WaPassiveTasksCoordinator
    readonly groupCoordinator: WaGroupCoordinator
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

export interface WaClientDependencyHost {
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly syncAppState: () => Promise<void>
    readonly emitEvent: <K extends keyof WaClientEventMap>(
        event: K,
        ...args: Parameters<WaClientEventMap[K]>
    ) => void
    readonly handleIncomingMessageEvent: (event: WaIncomingMessageEvent) => Promise<void>
    readonly handleError: (error: Error) => void
    readonly scheduleReconnectAfterPairing: () => void
    readonly updateClockSkewFromSuccess: (serverUnixSeconds: number) => void
    readonly getComms: () => WaComms | null
    readonly getMediaConnCache: () => WaMediaConn | null
    readonly setMediaConnCache: (mediaConn: WaMediaConn | null) => void
    readonly disconnect: () => Promise<void>
    readonly clearStoredState: () => Promise<void>
    readonly connect: () => Promise<void>
    readonly shouldQueueDanglingReceipt: (node: BinaryNode, error: Error) => boolean
    readonly enqueueDanglingReceipt: (node: BinaryNode) => void
    readonly takeDanglingReceipts: () => BinaryNode[]
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

function createAuthClient(input: {
    readonly options: WaClientOptions
    readonly logger: Logger
    readonly sessionStore: ReturnType<WaClientOptions['store']['session']>
    readonly host: WaClientDependencyHost
}): WaAuthClient {
    const { options, logger, sessionStore, host } = input
    return new WaAuthClient(
        {
            deviceBrowser: options.deviceBrowser,
            deviceOsDisplayName: options.deviceOsDisplayName,
            devicePlatform: options.devicePlatform,
            requireFullSync: options.requireFullSync
        },
        {
            logger,
            authStore: sessionStore.auth,
            signalStore: sessionStore.signal,
            socket: {
                sendNode: host.sendNode,
                query: host.query
            },
            callbacks: {
                onQr: (qr, ttlMs) => host.emitEvent('auth_qr', { qr, ttlMs }),
                onPairingCode: (code) => host.emitEvent('auth_pairing_code', { code }),
                onPairingRefresh: (forceManual) =>
                    host.emitEvent('auth_pairing_refresh', { forceManual }),
                onPaired: (credentials) => {
                    host.emitEvent('auth_paired', { credentials })
                    host.scheduleReconnectAfterPairing()
                },
                onError: (error) => host.handleError(error)
            }
        }
    )
}

function createCurrentAuthGetters(authClient: WaAuthClient): {
    readonly getCurrentCredentials: () => ReturnType<WaAuthClient['getCurrentCredentials']>
    readonly getCurrentMeJid: () => string | null | undefined
    readonly getCurrentMeLid: () => string | null | undefined
    readonly getCurrentSignedIdentity: () => Proto.IADVSignedDeviceIdentity | null | undefined
} {
    const getCurrentCredentials = () => authClient.getCurrentCredentials()
    return {
        getCurrentCredentials,
        getCurrentMeJid: () => getCurrentCredentials()?.meJid,
        getCurrentMeLid: () => getCurrentCredentials()?.meLid,
        getCurrentSignedIdentity: () => getCurrentCredentials()?.signedIdentity
    }
}

function createIncomingMessageAckOptions(input: {
    readonly logger: Logger
    readonly host: WaClientDependencyHost
    readonly getCurrentMeJid: () => string | null | undefined
    readonly signalProtocol: SignalProtocol
    readonly senderKeyManager: SenderKeyManager
    readonly retryCoordinator: WaRetryCoordinator
}): Parameters<typeof handleIncomingMessageAck>[1] {
    const { logger, host, getCurrentMeJid, signalProtocol, senderKeyManager, retryCoordinator } =
        input
    return {
        logger,
        sendNode: host.sendNode,
        getMeJid: getCurrentMeJid,
        signalProtocol,
        senderKeyManager,
        onDecryptFailure: (context: WaRetryDecryptFailureContext, error: unknown) =>
            retryCoordinator.onDecryptFailure(context, error),
        emitIncomingMessage: (event: WaIncomingMessageEvent) => {
            void host
                .handleIncomingMessageEvent(event)
                .catch((err) => host.handleError(toError(err)))
        },
        emitUnhandledStanza: (event: WaIncomingUnhandledStanzaEvent) =>
            host.emitEvent('stanza_unhandled', event)
    }
}

function createHandleClientDirtyBits(input: {
    readonly logger: Logger
    readonly host: WaClientDependencyHost
    readonly getCurrentCredentials: () => ReturnType<WaAuthClient['getCurrentCredentials']>
    readonly generateUsyncSid: WaUsyncSidGenerator
}): (dirtyBits: Parameters<typeof handleDirtyBits>[1]) => Promise<void> {
    const { logger, host, getCurrentCredentials, generateUsyncSid } = input
    return (dirtyBits) =>
        handleDirtyBits(
            {
                logger,
                queryWithContext: host.queryWithContext,
                getCurrentCredentials,
                syncAppState: host.syncAppState,
                generateUsyncSid
            },
            dirtyBits
        )
}

function createIncomingNodeRuntime(input: {
    readonly logger: Logger
    readonly host: WaClientDependencyHost
    readonly authClient: WaAuthClient
    readonly nodeOrchestrator: WaNodeOrchestrator
    readonly streamControl: WaStreamControlHandler
    readonly mediaMessageBuildOptions: WaMediaMessageBuildOptions
    readonly retryCoordinator: WaRetryCoordinator
    readonly messageDispatch: WaMessageDispatchCoordinator
    readonly getCurrentMeJid: () => string | null | undefined
    readonly handleClientDirtyBits: (
        dirtyBits: Parameters<typeof handleDirtyBits>[1]
    ) => Promise<void>
    readonly incomingMessageAckOptions: Parameters<typeof handleIncomingMessageAck>[1]
}): ConstructorParameters<typeof WaIncomingNodeCoordinator>[0]['runtime'] {
    const {
        logger,
        host,
        authClient,
        nodeOrchestrator,
        streamControl,
        mediaMessageBuildOptions,
        retryCoordinator,
        messageDispatch,
        getCurrentMeJid,
        handleClientDirtyBits,
        incomingMessageAckOptions
    } = input

    return {
        handleStreamControlResult: streamControl.handleStreamControlResult,
        persistSuccessAttributes: (attributes) => authClient.persistSuccessAttributes(attributes),
        emitSuccessNode: (node) => host.emitEvent('connection_success', { node }),
        updateClockSkewFromSuccess: host.updateClockSkewFromSuccess,
        shouldWarmupMediaConn: () => {
            const comms = host.getComms()
            return !!(getCurrentMeJid() && comms && comms.getCommsState().connected)
        },
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
        sendNode: host.sendNode,
        handleIncomingRetryReceipt: (node) => retryCoordinator.handleIncomingRetryReceipt(node),
        trackOutboundReceipt: (node) => retryCoordinator.trackOutboundReceipt(node),
        emitIncomingReceipt: (event) => host.emitEvent('message_receipt', event),
        emitIncomingPresence: (event) => host.emitEvent('presence', event),
        emitIncomingChatstate: (event) => host.emitEvent('chatstate', event),
        emitIncomingCall: (event) => host.emitEvent('call', event),
        emitIncomingFailure: (event) => host.emitEvent('failure', event),
        emitIncomingErrorStanza: (event) => host.emitEvent('stanza_error', event),
        emitIncomingNotification: (event) => host.emitEvent('notification', event),
        emitGroupEvent: (event) => {
            host.emitEvent('group_event', event)
            void messageDispatch.mutateParticipantsCacheFromGroupEvent(event).catch((error) => {
                logger.warn('failed to mutate participants cache from group event', {
                    action: event.action,
                    groupJid: event.groupJid,
                    contextGroupJid: event.contextGroupJid,
                    message: toError(error).message
                })
            })
        },
        emitUnhandledIncomingNode: (event) => host.emitEvent('stanza_unhandled', event),
        syncAppState: host.syncAppState,
        disconnect: host.disconnect,
        clearStoredCredentials: host.clearStoredState,
        parseDirtyBits: (nodes) => parseDirtyBits(nodes, logger),
        handleDirtyBits: (dirtyBits) => handleClientDirtyBits(dirtyBits)
    }
}

function createPassiveTasksRuntime(input: {
    readonly host: WaClientDependencyHost
    readonly authClient: WaAuthClient
    readonly nodeOrchestrator: WaNodeOrchestrator
    readonly getCurrentCredentials: () => ReturnType<WaAuthClient['getCurrentCredentials']>
}): ConstructorParameters<typeof WaPassiveTasksCoordinator>[0]['runtime'] {
    const { host, authClient, nodeOrchestrator, getCurrentCredentials } = input
    return {
        queryWithContext: host.queryWithContext,
        getCurrentCredentials,
        persistServerHasPreKeys: (serverHasPreKeys) =>
            authClient.persistServerHasPreKeys(serverHasPreKeys),
        sendNodeDirect: (node) => nodeOrchestrator.sendNode(node),
        takeDanglingReceipts: host.takeDanglingReceipts,
        requeueDanglingReceipt: host.enqueueDanglingReceipt,
        shouldQueueDanglingReceipt: host.shouldQueueDanglingReceipt
    }
}

export function buildWaClientDependencies(input: {
    readonly base: WaClientBase
    readonly host: WaClientDependencyHost
}): WaClientDependencies {
    const { base, host } = input
    const { options, logger, sessionStore } = base

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
        getComms: host.getComms,
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
    const mediaMessageBuildOptions: WaMediaMessageBuildOptions = {
        logger,
        mediaTransfer,
        iqTimeoutMs: options.iqTimeoutMs,
        queryWithContext: host.queryWithContext,
        getMediaConnCache: host.getMediaConnCache,
        setMediaConnCache: host.setMediaConnCache
    }

    const messageClient = new WaMessageClient({
        logger,
        sendNode: host.sendNode,
        query: host.query,
        defaultAckTimeoutMs: options.messageAckTimeoutMs,
        defaultMaxAttempts: options.messageMaxAttempts,
        defaultRetryDelayMs: options.messageRetryDelayMs
    })
    const senderKeyManager = new SenderKeyManager(sessionStore.senderKey)
    const signalProtocol = new SignalProtocol(sessionStore.signal, logger)
    const signalDigestSync = new SignalDigestSyncApi({
        logger,
        query: host.query,
        signalStore: sessionStore.signal,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs
    })
    const generateUsyncSid = createUsyncSidGenerator()
    const signalDeviceSync = new SignalDeviceSyncApi({
        logger,
        query: host.query,
        deviceListStore: sessionStore.deviceList,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs,
        generateSid: generateUsyncSid
    })
    const signalIdentitySync = new SignalIdentitySyncApi({
        logger,
        query: host.query,
        signalStore: sessionStore.signal,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs
    })
    const signalMissingPreKeysSync = new SignalMissingPreKeysSyncApi({
        logger,
        query: host.query,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs
    })
    const signalRotateKey = new SignalRotateKeyApi({
        logger,
        query: host.query,
        signalStore: sessionStore.signal,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs
    })
    const signalSessionSync = new SignalSessionSyncApi({
        logger,
        query: host.query,
        defaultTimeoutMs: options.signalFetchKeyBundlesTimeoutMs
    })
    const authClient = createAuthClient({ options, logger, sessionStore, host })
    const { getCurrentCredentials, getCurrentMeJid, getCurrentMeLid, getCurrentSignedIdentity } =
        createCurrentAuthGetters(authClient)
    const groupCoordinator = createGroupCoordinator({
        queryWithContext: host.queryWithContext
    })
    const messageDispatch = new WaMessageDispatchCoordinator({
        logger,
        messageClient,
        retryStore: sessionStore.retry,
        participantsStore: sessionStore.participants,
        buildMessageContent: async (content) =>
            buildMediaMessageContent(mediaMessageBuildOptions, content),
        queryGroupParticipantJids: async (groupJid) =>
            (await groupCoordinator.queryGroupMetadata(groupJid)).participants.map(
                (participant) => participant.jid
            ),
        senderKeyManager,
        signalProtocol,
        signalStore: sessionStore.signal,
        signalDeviceSync,
        signalIdentitySync,
        signalSessionSync,
        getCurrentMeJid,
        getCurrentMeLid,
        getCurrentSignedIdentity
    })
    const retryCoordinator = new WaRetryCoordinator({
        logger,
        retryStore: sessionStore.retry,
        signalStore: sessionStore.signal,
        senderKeyStore: sessionStore.senderKey,
        signalProtocol,
        signalDeviceSync,
        signalMissingPreKeysSync,
        messageClient,
        sendNode: host.sendNode,
        getCurrentMeJid,
        getCurrentMeLid,
        getCurrentSignedIdentity
    })
    const appStateSync = new WaAppStateSyncClient({
        logger,
        query: host.query,
        defaultTimeoutMs: options.appStateSyncTimeoutMs,
        store: sessionStore.appState,
        onMissingKeys: async ({ keyIds }) => {
            await messageDispatch.requestAppStateSyncKeys(keyIds)
        }
    })
    const streamControl = createStreamControlHandler({
        logger,
        getComms: host.getComms,
        clearPendingQueries: (error) => nodeOrchestrator.clearPending(error),
        clearMediaConnCache: () => host.setMediaConnCache(null),
        disconnect: host.disconnect,
        clearStoredCredentials: host.clearStoredState,
        connect: host.connect
    })
    const incomingMessageAckOptions = createIncomingMessageAckOptions({
        logger,
        host,
        getCurrentMeJid,
        signalProtocol,
        senderKeyManager,
        retryCoordinator
    })
    const handleClientDirtyBits = createHandleClientDirtyBits({
        logger,
        host,
        getCurrentCredentials,
        generateUsyncSid
    })
    const incomingNode = new WaIncomingNodeCoordinator({
        logger,
        runtime: createIncomingNodeRuntime({
            logger,
            host,
            authClient,
            nodeOrchestrator,
            streamControl,
            mediaMessageBuildOptions,
            retryCoordinator,
            messageDispatch,
            getCurrentMeJid,
            handleClientDirtyBits,
            incomingMessageAckOptions
        })
    })
    const passiveTasks = new WaPassiveTasksCoordinator({
        logger,
        signalStore: sessionStore.signal,
        signalDigestSync,
        signalRotateKey,
        runtime: createPassiveTasksRuntime({
            host,
            authClient,
            nodeOrchestrator,
            getCurrentCredentials
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
        streamControl,
        incomingNode,
        passiveTasks,
        groupCoordinator
    }
}
