import type { WaAuthClientOptions, WaAuthCredentials, WaAuthSocketOptions } from '@auth/types'
import type { WaMessagePublishOptions } from '@message/types'
import type { Proto } from '@proto'
import type { WaStore } from '@store/types'
import type { BinaryNode } from '@transport/types'

export interface WaClientOptions extends WaAuthClientOptions, WaAuthSocketOptions {
    readonly store: WaStore
    readonly sessionId: string
    readonly chatSocketUrls?: readonly string[]
    readonly iqTimeoutMs?: number
    readonly nodeQueryTimeoutMs?: number
    readonly keepAliveIntervalMs?: number
    readonly deadSocketTimeoutMs?: number
    readonly mediaTimeoutMs?: number
    readonly appStateSyncTimeoutMs?: number
    readonly signalFetchKeyBundlesTimeoutMs?: number
    readonly messageAckTimeoutMs?: number
    readonly messageMaxAttempts?: number
    readonly messageRetryDelayMs?: number
    readonly history?: WaHistorySyncOptions
}

export interface WaHistorySyncOptions {
    readonly enabled?: boolean
    readonly requireFullSync?: boolean
}

export interface WaSignalMessagePublishInput {
    readonly to: string
    readonly plaintext: Uint8Array
    readonly expectedIdentity?: Uint8Array
    readonly id?: string
    readonly type?: string
    readonly participant?: string
    readonly deviceFanout?: string
}

export interface WaSendMessageOptions extends WaMessagePublishOptions {
    readonly id?: string
    readonly expectedIdentity?: Uint8Array
}

export type WaIncomingNodeHandler = (node: BinaryNode) => Promise<boolean>

export interface WaIncomingNodeHandlerRegistration {
    readonly tag: string
    readonly subtype?: string
    readonly handler: WaIncomingNodeHandler
    readonly prepend?: boolean
}

export interface WaIncomingBaseEvent {
    readonly rawNode: BinaryNode
    readonly id?: string
    readonly from?: string
    readonly type?: string
}

export interface WaIncomingMessageEvent extends WaIncomingBaseEvent {
    readonly timestamp?: number
    readonly senderJid?: string
    readonly encType?: string
    readonly plaintext?: Uint8Array
    readonly message?: Proto.IMessage
}

export interface WaIncomingProtocolMessageEvent extends WaIncomingMessageEvent {
    readonly protocolMessage: Proto.Message.IProtocolMessage
}

export interface WaIncomingReceiptEvent extends WaIncomingBaseEvent {
    readonly participant?: string
    readonly recipient?: string
}

export interface WaIncomingPresenceEvent extends WaIncomingBaseEvent {}

export interface WaIncomingChatstateEvent extends WaIncomingBaseEvent {
    readonly participant?: string
}

export interface WaIncomingCallEvent extends WaIncomingBaseEvent {}

export interface WaIncomingNotificationEvent extends WaIncomingBaseEvent {
    readonly notificationType?: string
    readonly classification?: 'core' | 'out_of_scope' | 'unknown' | 'info_bulletin'
    readonly details?: Readonly<Record<string, unknown>>
}

export interface WaIncomingFailureEvent extends WaIncomingBaseEvent {
    readonly reason?: number
    readonly code?: number
    readonly message?: string
    readonly url?: string
}

export interface WaIncomingUnhandledStanzaEvent extends WaIncomingBaseEvent {
    readonly reason: string
}

export interface WaHistorySyncChunkEvent {
    readonly syncType: number
    readonly messagesCount: number
    readonly conversationsCount: number
    readonly pushnamesCount: number
    readonly chunkOrder?: number
    readonly progress?: number
}

export interface WaClientEventMap {
    readonly qr: (qr: string, ttlMs: number) => void
    readonly pairing_code: (code: string) => void
    readonly pairing_refresh: (forceManual: boolean) => void
    readonly paired: (credentials: WaAuthCredentials) => void
    readonly success: (node: BinaryNode) => void
    readonly error: (error: Error) => void
    readonly connected: () => void
    readonly disconnected: () => void
    readonly frame_in: (frame: Uint8Array) => void
    readonly frame_out: (frame: Uint8Array) => void
    readonly node_in: (node: BinaryNode, frame: Uint8Array) => void
    readonly node_out: (node: BinaryNode, frame: Uint8Array) => void
    readonly decode_error: (error: Error, frame: Uint8Array) => void
    readonly incoming_message: (event: WaIncomingMessageEvent) => void
    readonly incoming_protocol_message: (event: WaIncomingProtocolMessageEvent) => void
    readonly incoming_receipt: (event: WaIncomingReceiptEvent) => void
    readonly incoming_presence: (event: WaIncomingPresenceEvent) => void
    readonly incoming_chatstate: (event: WaIncomingChatstateEvent) => void
    readonly incoming_call: (event: WaIncomingCallEvent) => void
    readonly incoming_notification: (event: WaIncomingNotificationEvent) => void
    readonly incoming_failure: (event: WaIncomingFailureEvent) => void
    readonly incoming_error_stanza: (event: WaIncomingBaseEvent) => void
    readonly incoming_unhandled_stanza: (event: WaIncomingUnhandledStanzaEvent) => void
    readonly history_sync_chunk: (event: WaHistorySyncChunkEvent) => void
}
