import type { AppStateCollectionName } from '@appstate/types'
import type { WaAuthClientOptions, WaAuthCredentials, WaAuthSocketOptions } from '@auth/types'
import type { WaMediaProcessor } from '@media/processor'
import type { WaDecodedAddon } from '@message/addon-crypto'
import type { WaMessagePublishOptions } from '@message/types'
import type { Proto } from '@proto'
import type { WaConnectionCode, WaConnectionOpenReason, WaDisconnectReason } from '@protocol/stream'
import type { WaStore } from '@store/types'
import type { BinaryNode, WaProxyTransport } from '@transport/types'

export interface WaClientProxyOptions {
    readonly ws?: WaProxyTransport
    readonly mediaUpload?: WaProxyTransport
    readonly mediaDownload?: WaProxyTransport
}

export interface WaLogoutStoreClearOptions {
    readonly auth?: boolean
    readonly signal?: boolean
    readonly preKey?: boolean
    readonly session?: boolean
    readonly identity?: boolean
    readonly senderKey?: boolean
    readonly appState?: boolean
    readonly retry?: boolean
    readonly participants?: boolean
    readonly deviceList?: boolean
    readonly messages?: boolean
    readonly messageSecret?: boolean
    readonly threads?: boolean
    readonly contacts?: boolean
    readonly privacyToken?: boolean
}

export interface WaClientOptions extends WaAuthClientOptions, WaAuthSocketOptions {
    readonly store: WaStore
    readonly sessionId: string
    readonly proxy?: WaClientProxyOptions
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
    readonly writeBehind?: WaWriteBehindOptions
    readonly history?: WaHistorySyncOptions
    readonly chatEvents?: {
        readonly emitSnapshotMutations?: boolean
    }
    readonly privacyToken?: WaPrivacyTokenOptions
    readonly addons?: WaAddonOptions
    readonly logoutStoreClear?: WaLogoutStoreClearOptions
    readonly media?: WaMediaOptions
}

export interface WaMediaOptions {
    readonly processor?: WaMediaProcessor
    readonly generateThumbnail?: boolean
    readonly generateProbe?: boolean
    readonly generateWaveform?: boolean
    readonly generateStickerThumbnail?: boolean
}

export interface WaAddonOptions {
    readonly autoDecrypt?: boolean
}

export interface WaPrivacyTokenOptions {
    readonly tcTokenDurationS?: number
    readonly tcTokenNumBuckets?: number
    readonly tcTokenSenderDurationS?: number
    readonly tcTokenSenderNumBuckets?: number
    readonly tcTokenMaxDurationS?: number
}

export interface WaWriteBehindOptions {
    readonly maxPendingKeys?: number
    readonly maxWriteConcurrency?: number
    readonly flushTimeoutMs?: number
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
    readonly category?: string
    readonly pushPriority?: string
    readonly participant?: string
    readonly deviceFanout?: string
}

export interface WaSendMessageOptions extends WaMessagePublishOptions {
    readonly id?: string
    readonly expectedIdentity?: Uint8Array
    readonly subtype?: string
}

export interface WaClearChatOptions {
    readonly deleteStarred?: boolean
    readonly deleteMedia?: boolean
}

export interface WaDeleteChatOptions {
    readonly deleteMedia?: boolean
}

export interface WaAppStateMessageKey {
    readonly chatJid: string
    readonly id: string
    readonly fromMe: boolean
    readonly participantJid?: string
}

export interface WaDeleteMessageForMeOptions {
    readonly deleteMedia?: boolean
    readonly messageTimestampMs?: number
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
    readonly stanzaId?: string
    readonly chatJid?: string
    readonly stanzaType?: string
}

export interface WaIncomingMessageEvent extends WaIncomingBaseEvent {
    readonly timestampSeconds?: number
    readonly senderJid?: string
    readonly encryptionType?: string
    readonly isGroupChat: boolean
    readonly isBroadcastChat: boolean
    readonly plaintext?: Uint8Array
    readonly message?: Proto.IMessage
}

export interface WaIncomingProtocolMessageEvent extends WaIncomingMessageEvent {
    readonly protocolMessage: Proto.Message.IProtocolMessage
}

export interface WaIncomingReceiptEvent extends WaIncomingBaseEvent {
    readonly participantJid?: string
    readonly recipientJid?: string
}

export interface WaIncomingPresenceEvent extends WaIncomingBaseEvent {}

export interface WaIncomingChatstateEvent extends WaIncomingBaseEvent {
    readonly participantJid?: string
}

export interface WaIncomingCallEvent extends WaIncomingBaseEvent {}

export interface WaIncomingNotificationEvent extends WaIncomingBaseEvent {
    readonly notificationType?: string
    readonly classification?: 'core' | 'out_of_scope' | 'unknown' | 'info_bulletin'
    readonly details?: Readonly<Record<string, unknown>>
}

export type WaAddonKind = 'reaction' | 'poll_vote' | 'event_response' | 'comment'

export interface WaIncomingAddonEvent extends WaIncomingBaseEvent {
    readonly kind: WaAddonKind
    readonly targetMessageId: string
    readonly senderJid: string
    readonly decrypted: WaDecodedAddon
    readonly raw: Proto.IMessage
}

export interface WaIncomingFailureEvent extends WaIncomingBaseEvent {
    readonly failureReason?: number
    readonly failureCode?: number
    readonly failureMessage?: string
    readonly failureUrl?: string
}

export interface WaIncomingUnhandledStanzaEvent extends WaIncomingBaseEvent {
    readonly reason: string
}

export type WaGroupEventAction =
    | 'create'
    | 'add'
    | 'delete'
    | 'remove'
    | 'promote'
    | 'demote'
    | 'linked_group_promote'
    | 'linked_group_demote'
    | 'modify'
    | 'subject'
    | 'description'
    | 'restrict'
    | 'announce'
    | 'no_frequently_forwarded'
    | 'invite'
    | 'ephemeral'
    | 'revoke_invite'
    | 'suspend'
    | 'growth_locked'
    | 'growth_unlocked'
    | 'link'
    | 'unlink'
    | 'membership_approval_mode'
    | 'membership_approval_request'
    | 'created_membership_requests'
    | 'revoked_membership_requests'
    | 'allow_non_admin_sub_group_creation'
    | 'allow_admin_reports'
    | 'admin_reports'
    | 'created_sub_group_suggestion'
    | 'revoked_sub_group_suggestions'
    | 'change_number'
    | 'member_add_mode'
    | 'auto_add_disabled'
    | 'is_capi_hosted_group'
    | 'group_safety_check'
    | 'limit_sharing_enabled'
    | 'missing_participant_identification'

export interface WaGroupEventParticipant {
    readonly jid?: string
    readonly role?: string
    readonly lidJid?: string
    readonly phoneJid?: string
    readonly displayName?: string
    readonly username?: string
    readonly expirationSeconds?: number
}

export interface WaGroupEventLinkedGroup {
    readonly jid?: string
    readonly subject?: string
    readonly subjectTimestampSeconds?: number
    readonly hiddenSubgroup?: boolean
}

export interface WaGroupEventMembershipRequest {
    readonly jid?: string
    readonly username?: string
    readonly phoneJid?: string
}

export interface WaGroupEventSubgroupSuggestion {
    readonly groupJid?: string
    readonly ownerJid?: string
    readonly subject?: string
    readonly description?: string
    readonly timestampSeconds?: number
    readonly isExistingGroup?: boolean
    readonly participantCount?: number
    readonly reason?: string
}

export interface WaGroupEvent extends WaIncomingBaseEvent {
    readonly rawActionNode: BinaryNode
    readonly groupJid?: string
    readonly authorJid?: string
    readonly timestampSeconds?: number
    readonly action: WaGroupEventAction
    readonly participants?: readonly WaGroupEventParticipant[]
    readonly linkedGroups?: readonly WaGroupEventLinkedGroup[]
    readonly membershipRequests?: readonly WaGroupEventMembershipRequest[]
    readonly subgroupSuggestions?: readonly WaGroupEventSubgroupSuggestion[]
    readonly contextGroupJid?: string
    readonly requestMethod?: string
    readonly subject?: string
    readonly subjectOwnerJid?: string
    readonly description?: string
    readonly descriptionId?: string
    readonly code?: string
    readonly expirationSeconds?: number
    readonly mode?: string
    readonly enabled?: boolean
    readonly reason?: string
    readonly details?: Readonly<Record<string, unknown>>
}

export interface WaHistorySyncChunkEvent {
    readonly syncType: number
    readonly messagesCount: number
    readonly conversationsCount: number
    readonly pushnamesCount: number
    readonly chunkOrder?: number
    readonly progress?: number
}

export type WaChatEventAction =
    | 'archive'
    | 'mute'
    | 'pin'
    | 'mark_read'
    | 'clear'
    | 'delete'
    | 'lock'
    | 'chat_assignment'
    | (string & {})

export type WaChatEventSource = 'snapshot' | 'patch'

export interface WaChatEvent {
    readonly action: WaChatEventAction
    readonly source: WaChatEventSource
    readonly collection: AppStateCollectionName
    readonly operation: 'set' | 'remove'
    readonly mutationIndex: string
    readonly indexAction?: string
    readonly indexParts?: readonly string[]
    readonly syncActionValueKey?: string
    readonly chatJid?: string
    readonly timestamp: number
    readonly version: number
    readonly archived?: boolean
    readonly muted?: boolean
    readonly muteEndTimestampMs?: number
    readonly pinned?: boolean
    readonly read?: boolean
    readonly deleteStarred?: boolean
    readonly deleteMedia?: boolean
    readonly locked?: boolean
    readonly deviceAgentId?: string
}

export type WaConnectionEvent =
    | {
          readonly status: 'open'
          readonly reason: WaConnectionOpenReason
          readonly code: null
          readonly isLogout: false
          readonly isNewLogin: boolean
      }
    | {
          readonly status: 'close'
          readonly reason: WaDisconnectReason
          readonly code: WaConnectionCode | null
          readonly isLogout: boolean
          readonly isNewLogin: false
      }

export interface WaClientEventMap {
    readonly auth_qr: (event: { readonly qr: string; readonly ttlMs: number }) => void
    readonly auth_pairing_code: (event: { readonly code: string }) => void
    readonly auth_pairing_refresh: (event: { readonly forceManual: boolean }) => void
    readonly auth_paired: (event: { readonly credentials: WaAuthCredentials }) => void
    readonly connection_success: (event: { readonly node: BinaryNode }) => void
    readonly client_error: (event: { readonly error: Error }) => void
    readonly connection: (event: WaConnectionEvent) => void
    readonly transport_frame_in: (event: { readonly frame: Uint8Array }) => void
    readonly transport_frame_out: (event: { readonly frame: Uint8Array }) => void
    readonly transport_node_in: (event: {
        readonly node: BinaryNode
        readonly frame: Uint8Array
    }) => void
    readonly transport_node_out: (event: {
        readonly node: BinaryNode
        readonly frame: Uint8Array
    }) => void
    readonly transport_decode_error: (event: {
        readonly error: Error
        readonly frame: Uint8Array
    }) => void
    readonly message: (event: WaIncomingMessageEvent) => void
    readonly message_addon: (event: WaIncomingAddonEvent) => void
    readonly message_protocol: (event: WaIncomingProtocolMessageEvent) => void
    readonly message_receipt: (event: WaIncomingReceiptEvent) => void
    readonly presence: (event: WaIncomingPresenceEvent) => void
    readonly chatstate: (event: WaIncomingChatstateEvent) => void
    readonly call: (event: WaIncomingCallEvent) => void
    readonly notification: (event: WaIncomingNotificationEvent) => void
    readonly failure: (event: WaIncomingFailureEvent) => void
    readonly stanza_error: (event: WaIncomingBaseEvent) => void
    readonly stanza_unhandled: (event: WaIncomingUnhandledStanzaEvent) => void
    readonly group_event: (event: WaGroupEvent) => void
    readonly chat_event: (event: WaChatEvent) => void
    readonly history_sync_chunk: (event: WaHistorySyncChunkEvent) => void
    readonly privacy_token_update: (event: WaPrivacyTokenUpdateEvent) => void
    readonly offline_resume: (event: WaOfflineResumeEvent) => void
}

export interface WaOfflineResumeEvent {
    readonly status: 'resuming' | 'complete'
    readonly totalMessages: number
    readonly remainingMessages: number
    readonly forced: boolean
}

export interface WaPrivacyTokenUpdateEvent {
    readonly jid: string
    readonly timestampS: number
    readonly type: string
    readonly source: 'notification' | 'history_sync'
}
