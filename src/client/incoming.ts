import { parseGroupNotificationEvents } from '@client/events/group'
import { parseRegistrationNotification } from '@client/events/registration'
import type {
    WaAccountTakeoverNoticeEvent,
    WaGroupEvent,
    WaIncomingBaseEvent,
    WaIncomingFailureEvent,
    WaIncomingNotificationEvent,
    WaIncomingReceiptEvent,
    WaIncomingUnhandledStanzaEvent,
    WaRegistrationCodeEvent
} from '@client/types'
import type { Logger } from '@infra/log/types'
import { WA_DISCONNECT_REASONS, WA_NODE_TAGS, WA_NOTIFICATION_TYPES } from '@protocol/constants'
import type { WaConnectionCode, WaDisconnectReason } from '@protocol/stream'
import { buildAckNode } from '@transport/node/builders/global'
import { getFirstNodeChild, getNodeChildrenNonEmptyAttrValuesByTag } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt, toError } from '@util/primitives'

interface IncomingAckRuntime {
    readonly logger: Logger
    readonly sendNode: (node: BinaryNode) => Promise<void>
}

type IncomingReceiptHandlerOptions = IncomingAckRuntime & {
    readonly handleIncomingRetryReceipt?: (node: BinaryNode) => Promise<void>
    readonly trackOutboundReceipt?: (node: BinaryNode) => Promise<void>
    readonly emitIncomingReceipt: (event: WaIncomingReceiptEvent) => void
}

type IncomingFailureHandlerOptions = {
    readonly logger: Logger
    readonly emitIncomingFailure: (event: WaIncomingFailureEvent) => void
    readonly stopComms: () => void
    readonly disconnect: (
        reason: WaDisconnectReason,
        isLogout: boolean,
        code: WaConnectionCode | null
    ) => Promise<void>
    readonly clearStoredCredentials: () => Promise<void>
}

type IncomingNotificationHandlerOptions = IncomingAckRuntime & {
    readonly emitIncomingNotification: (event: WaIncomingNotificationEvent) => void
    readonly emitUnhandledStanza: (event: WaIncomingUnhandledStanzaEvent) => void
    readonly syncAppState?: () => Promise<void>
}

type IncomingGroupNotificationHandlerOptions = IncomingAckRuntime & {
    readonly emitGroupEvent: (event: WaGroupEvent) => void
    readonly emitUnhandledStanza: (event: WaIncomingUnhandledStanzaEvent) => void
}

type IncomingRegistrationNotificationHandlerOptions = IncomingAckRuntime & {
    readonly emitRegistrationCode: (event: WaRegistrationCodeEvent) => void
    readonly emitAccountTakeoverNotice: (event: WaAccountTakeoverNoticeEvent) => void
}

const FAILURE_REASON_TO_DISCONNECT: Readonly<Record<number, WaDisconnectReason>> = {
    401: WA_DISCONNECT_REASONS.FAILURE_NOT_AUTHORIZED,
    403: WA_DISCONNECT_REASONS.FAILURE_LOCKED,
    406: WA_DISCONNECT_REASONS.FAILURE_BANNED,
    405: WA_DISCONNECT_REASONS.FAILURE_CLIENT_TOO_OLD,
    409: WA_DISCONNECT_REASONS.FAILURE_BAD_USER_AGENT,
    503: WA_DISCONNECT_REASONS.FAILURE_SERVICE_UNAVAILABLE
}
const LOGOUT_FAILURE_REASONS = new Set<number>([401, 403, 406])
const DISCONNECT_FAILURE_REASONS = new Set<number>([405, 409, 503])

const CORE_NOTIFICATION_TYPES = new Set<string>([
    'server_sync',
    'picture',
    'contacts',
    'devices',
    'disappearing_mode',
    'mediaretry',
    'encrypt',
    'server',
    'status',
    'account_sync',
    'privacy_token',
    'newsletter',
    'w:growth',
    'registration',
    'mex'
])

const OUT_OF_SCOPE_NOTIFICATION_TYPES = new Set<string>([
    'business',
    'pay',
    'psa',
    'waffle',
    'hosted'
])

const NOTIFICATION_TYPES_WITH_PARTICIPANT_ACK = new Set<string>(['mediaretry', 'psa'])
const NOTIFICATION_TYPES_WITHOUT_TYPE_ACK = new Set<string>(['encrypt', 'devices'])

export function createIncomingBaseEvent(node: BinaryNode): WaIncomingBaseEvent {
    return {
        rawNode: node,
        stanzaId: node.attrs.id,
        chatJid: node.attrs.from,
        stanzaType: node.attrs.type
    }
}

async function sendSafeAck(
    logger: Logger,
    sendNode: (node: BinaryNode) => Promise<void>,
    node: BinaryNode
): Promise<void> {
    try {
        await sendNode(node)
    } catch (error) {
        logger.warn('failed to send inbound ack', {
            tag: node.tag,
            class: node.attrs.class,
            type: node.attrs.type,
            id: node.attrs.id,
            message: toError(error).message
        })
    }
}

function classifyNotificationType(
    notificationType: string
): WaIncomingNotificationEvent['classification'] {
    if (CORE_NOTIFICATION_TYPES.has(notificationType)) {
        return 'core'
    }
    if (OUT_OF_SCOPE_NOTIFICATION_TYPES.has(notificationType)) {
        return 'out_of_scope'
    }
    return 'unknown'
}

async function applyFailureAction(
    options: IncomingFailureHandlerOptions,
    reason: number,
    clearStoredCredentials: boolean
): Promise<void> {
    try {
        options.stopComms()
        const disconnectReason =
            FAILURE_REASON_TO_DISCONNECT[reason] ?? WA_DISCONNECT_REASONS.STREAM_ERROR_OTHER
        await options.disconnect(
            disconnectReason,
            clearStoredCredentials,
            reason as WaConnectionCode
        )
        if (clearStoredCredentials) {
            await options.clearStoredCredentials()
        }
    } catch (error) {
        options.logger.warn('failed applying failure stanza action', {
            reason,
            clearStoredCredentials,
            message: toError(error).message
        })
    }
}

export function createIncomingReceiptHandler(
    options: IncomingReceiptHandlerOptions
): (node: BinaryNode) => Promise<boolean> {
    return async (node: BinaryNode): Promise<boolean> => {
        if (!node.attrs.id || !node.attrs.from) {
            options.logger.warn('incoming receipt missing required attrs for ack', {
                hasFrom: node.attrs.from !== undefined,
                hasId: node.attrs.id !== undefined,
                type: node.attrs.type
            })
            return true
        }

        options.emitIncomingReceipt({
            ...createIncomingBaseEvent(node),
            participantJid: node.attrs.participant,
            recipientJid: node.attrs.recipient
        })

        try {
            await options.trackOutboundReceipt?.(node)
        } catch (error) {
            options.logger.warn('failed to track outbound message receipt state', {
                id: node.attrs.id,
                from: node.attrs.from,
                type: node.attrs.type,
                message: toError(error).message
            })
        }

        const receiptType = node.attrs.type
        if (receiptType === 'retry' || receiptType === 'enc_rekey_retry') {
            if (options.handleIncomingRetryReceipt) {
                await options.handleIncomingRetryReceipt(node)
            } else {
                await sendSafeAck(
                    options.logger,
                    options.sendNode,
                    buildAckNode({
                        kind: 'receipt',
                        node,
                        retryType: true
                    })
                )
            }
            return true
        }

        await sendSafeAck(
            options.logger,
            options.sendNode,
            buildAckNode({
                kind: 'receipt',
                node,
                includeParticipant: receiptType !== 'server-error'
            })
        )
        return true
    }
}

export function createIncomingFailureHandler(
    options: IncomingFailureHandlerOptions
): (node: BinaryNode) => Promise<boolean> {
    return async (node: BinaryNode): Promise<boolean> => {
        const reason = parseOptionalInt(node.attrs.reason)
        const code = parseOptionalInt(node.attrs.code)
        options.emitIncomingFailure({
            ...createIncomingBaseEvent(node),
            failureReason: reason,
            failureCode: code,
            failureMessage: node.attrs.message,
            failureUrl: node.attrs.url
        })

        const shouldClearStoredCredentials =
            reason !== undefined && LOGOUT_FAILURE_REASONS.has(reason)
        if (
            shouldClearStoredCredentials ||
            (reason !== undefined && DISCONNECT_FAILURE_REASONS.has(reason))
        ) {
            await applyFailureAction(options, reason ?? 0, shouldClearStoredCredentials)
        }

        return true
    }
}

export function createIncomingNotificationHandler(
    options: IncomingNotificationHandlerOptions
): (node: BinaryNode) => Promise<boolean> {
    return async (node: BinaryNode): Promise<boolean> => {
        const notificationType = node.attrs.type ?? ''
        const includeParticipantInAck =
            NOTIFICATION_TYPES_WITH_PARTICIPANT_ACK.has(notificationType)
        const includeTypeInAck = !NOTIFICATION_TYPES_WITHOUT_TYPE_ACK.has(notificationType)
        const classification = classifyNotificationType(notificationType)
        const firstChildTag = getFirstNodeChild(node)?.tag
        const baseEvent = createIncomingBaseEvent(node)
        const serverSyncCollections =
            notificationType === 'server_sync'
                ? getNodeChildrenNonEmptyAttrValuesByTag(node, WA_NODE_TAGS.COLLECTION, 'name')
                : []

        let details: Record<string, unknown> | undefined
        if (firstChildTag || serverSyncCollections.length > 0) {
            details = {}
            if (firstChildTag) {
                details.firstChildTag = firstChildTag
            }
            if (serverSyncCollections.length > 0) {
                details.collections = serverSyncCollections
            }
        }

        options.emitIncomingNotification({
            ...baseEvent,
            notificationType,
            classification,
            details
        })

        if (classification === 'out_of_scope') {
            options.emitUnhandledStanza({
                ...baseEvent,
                reason: `notification.${notificationType}.out_of_scope`
            })
        } else if (classification === 'unknown') {
            options.emitUnhandledStanza({
                ...baseEvent,
                reason: `notification.${notificationType || 'unknown'}.not_supported`
            })
        }

        await sendSafeAck(
            options.logger,
            options.sendNode,
            buildAckNode({
                kind: 'notification',
                node,
                includeParticipant: includeParticipantInAck,
                includeType: includeTypeInAck
            })
        )
        if (notificationType === 'server_sync' && serverSyncCollections.length > 0) {
            const collectionsCsv = serverSyncCollections.join(',')
            if (!options.syncAppState) {
                options.logger.warn(
                    'received server_sync notification without app-state sync runtime',
                    {
                        collections: collectionsCsv
                    }
                )
                return true
            }
            void options.syncAppState().catch((error) => {
                options.logger.warn('failed to sync app-state after server_sync notification', {
                    collections: collectionsCsv,
                    message: toError(error).message
                })
            })
        }
        return true
    }
}

export function createIncomingRegistrationNotificationHandler(
    options: IncomingRegistrationNotificationHandlerOptions
): (node: BinaryNode) => Promise<boolean> {
    return async (node: BinaryNode): Promise<boolean> => {
        if (node.attrs.type !== WA_NOTIFICATION_TYPES.REGISTRATION) {
            return false
        }

        const parsed = parseRegistrationNotification(node)
        if (!parsed) {
            return false
        }

        const baseEvent = createIncomingBaseEvent(node)
        if (parsed.kind === 'registration_code') {
            options.emitRegistrationCode({
                ...baseEvent,
                code: parsed.code,
                expiryTimestampMs: parsed.expiryTimestampMs,
                fromDeviceId: parsed.fromDeviceId
            })
        } else {
            options.emitAccountTakeoverNotice({
                ...baseEvent,
                serverToken: parsed.serverToken,
                attemptTimestampMs: parsed.attemptTimestampMs,
                newDeviceName: parsed.newDeviceName,
                newDevicePlatform: parsed.newDevicePlatform,
                newDeviceAppVersion: parsed.newDeviceAppVersion
            })
        }

        await sendSafeAck(
            options.logger,
            options.sendNode,
            buildAckNode({
                kind: 'notification',
                node
            })
        )
        return true
    }
}

export function createIncomingGroupNotificationHandler(
    options: IncomingGroupNotificationHandlerOptions
): (node: BinaryNode) => Promise<boolean> {
    return async (node: BinaryNode): Promise<boolean> => {
        if (node.attrs.type !== WA_NOTIFICATION_TYPES.GROUP) {
            return false
        }

        const baseEvent = createIncomingBaseEvent(node)
        const parsed = parseGroupNotificationEvents(node)
        for (const event of parsed.events) {
            options.emitGroupEvent(event)
        }
        for (const unhandled of parsed.unhandled) {
            options.emitUnhandledStanza(unhandled)
        }
        if (parsed.events.length === 0 && parsed.unhandled.length === 0) {
            options.emitUnhandledStanza({
                ...baseEvent,
                reason: `notification.${WA_NOTIFICATION_TYPES.GROUP}.empty`
            })
        }
        await sendSafeAck(
            options.logger,
            options.sendNode,
            buildAckNode({
                kind: 'notification',
                node,
                includeParticipant: true
            })
        )
        return true
    }
}

export function createInfoBulletinNotificationEvent(
    node: BinaryNode,
    type: string,
    details?: Readonly<Record<string, unknown>>
): WaIncomingNotificationEvent {
    return {
        ...createIncomingBaseEvent(node),
        notificationType: `ib.${type}`,
        classification: 'info_bulletin',
        details
    }
}

export function createUnhandledIncomingNodeEvent(
    node: BinaryNode,
    reason = `unhandled.${node.tag}`
): WaIncomingUnhandledStanzaEvent {
    return {
        ...createIncomingBaseEvent(node),
        reason
    }
}
