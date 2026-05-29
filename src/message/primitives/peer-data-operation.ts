import type { WaAuthCredentials } from '@auth/types'
import type { PublishProtocolMessageToDeviceFn } from '@client/messaging/key-protocol'
import type { WaIncomingProtocolMessageEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { proto, type Proto } from '@proto'
import { toUserJid } from '@protocol/jid'
import { setBoundedMapEntry } from '@util/collections'

export interface PeerDataOperationRequesterOptions {
    readonly logger: Logger
    readonly publishProtocolMessageToDevice: PublishProtocolMessageToDeviceFn
    readonly getCurrentCredentials: () => WaAuthCredentials | null
    readonly generateOutgoingMessageId: () => Promise<string>
    readonly subscribeToProtocolMessage: (
        handler: (event: WaIncomingProtocolMessageEvent) => void
    ) => () => void
    readonly defaultTimeoutMs?: number
    readonly maxPending?: number
}

export interface PeerDataOperationRequester {
    readonly request: (
        type: Proto.Message.PeerDataOperationRequestType,
        body: Proto.Message.IPeerDataOperationRequestMessage,
        options?: { readonly timeoutMs?: number }
    ) => Promise<
        readonly Proto.Message.PeerDataOperationRequestResponseMessage.IPeerDataOperationResult[]
    >
    readonly send: (
        type: Proto.Message.PeerDataOperationRequestType,
        body: Proto.Message.IPeerDataOperationRequestMessage
    ) => Promise<{ readonly messageId: string }>
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_PENDING = 256

interface PendingPdo {
    readonly resolve: (
        results: readonly Proto.Message.PeerDataOperationRequestResponseMessage.IPeerDataOperationResult[]
    ) => void
    readonly reject: (error: Error) => void
    readonly timeout: ReturnType<typeof setTimeout>
}

function buildRequestProtocolMessage(
    type: Proto.Message.PeerDataOperationRequestType,
    body: Proto.Message.IPeerDataOperationRequestMessage
): Proto.Message.IProtocolMessage {
    return {
        type: proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE,
        peerDataOperationRequestMessage: {
            ...body,
            peerDataOperationRequestType: type
        }
    }
}

export function createPeerDataOperationRequester(
    options: PeerDataOperationRequesterOptions
): PeerDataOperationRequester {
    const {
        logger,
        publishProtocolMessageToDevice,
        getCurrentCredentials,
        generateOutgoingMessageId,
        subscribeToProtocolMessage
    } = options
    const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxPending = options.maxPending ?? DEFAULT_MAX_PENDING
    const pending = new Map<string, PendingPdo>()

    subscribeToProtocolMessage((event) => {
        const protocolMessage = event.protocolMessage
        if (
            protocolMessage.type !==
            proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE
        ) {
            return
        }
        const response = protocolMessage.peerDataOperationRequestResponseMessage
        if (!response) {
            return
        }
        const stanzaId = response.stanzaId
        const results = response.peerDataOperationResult ?? []
        if (!stanzaId) {
            logger.debug('pdo response without stanzaId', {
                from: event.key.remoteJid,
                resultCount: results.length
            })
            return
        }
        const entry = pending.get(stanzaId)
        if (!entry) {
            logger.debug('pdo response for unknown stanzaId', {
                stanzaId,
                resultCount: results.length
            })
            return
        }
        clearTimeout(entry.timeout)
        pending.delete(stanzaId)
        entry.resolve(results)
    })

    const publish = async (
        type: Proto.Message.PeerDataOperationRequestType,
        body: Proto.Message.IPeerDataOperationRequestMessage,
        id: string
    ): Promise<string> => {
        const meJid = getCurrentCredentials()?.meJid
        if (!meJid) {
            throw new Error('peer data operation requires current me jid')
        }
        const result = await publishProtocolMessageToDevice(
            toUserJid(meJid),
            buildRequestProtocolMessage(type, body),
            { id, pushPriority: 'high_force' }
        )
        return result.id
    }

    return {
        request: async (type, body, requestOptions) => {
            const messageId = await generateOutgoingMessageId()
            const timeoutMs = requestOptions?.timeoutMs ?? defaultTimeoutMs
            return new Promise<
                readonly Proto.Message.PeerDataOperationRequestResponseMessage.IPeerDataOperationResult[]
            >((resolve, reject) => {
                const timeout = setTimeout(() => {
                    if (!pending.delete(messageId)) {
                        return
                    }
                    logger.debug('pdo request timed out', { messageId, timeoutMs, type })
                    reject(
                        new Error(
                            `peer data operation timed out after ${timeoutMs}ms (id=${messageId})`
                        )
                    )
                }, timeoutMs)
                const entry: PendingPdo = { resolve, reject, timeout }
                setBoundedMapEntry(pending, messageId, entry, maxPending, (evictedKey, evicted) => {
                    clearTimeout(evicted.timeout)
                    logger.warn('pdo pending entry evicted: capacity reached', {
                        evictedId: evictedKey,
                        maxPending
                    })
                    evicted.reject(
                        new Error(
                            `peer data operation evicted from pending map (id=${String(evictedKey)})`
                        )
                    )
                })
                publish(type, body, messageId).catch((error) => {
                    clearTimeout(timeout)
                    if (pending.delete(messageId)) {
                        reject(error instanceof Error ? error : new Error(String(error)))
                    }
                })
            })
        },
        send: async (type, body) => {
            const messageId = await generateOutgoingMessageId()
            return { messageId: await publish(type, body, messageId) }
        }
    }
}
