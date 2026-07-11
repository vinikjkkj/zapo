import {
    type BinaryNode,
    getContextInfo,
    resolveEncMediaType,
    unwrapMessage,
    type WaAppStateMutationEvent,
    type WaClientPluginContext,
    type WaConnectionEvent,
    type WaGroupEvent,
    type WaHistorySyncChunkEvent,
    type WaIncomingMessageEvent,
    type WaIncomingReceiptEvent,
    type WaIncomingUnhandledStanzaEvent,
    type WaOutgoingMessageEvent
} from 'zapo-js'
import {
    isGroupJid,
    isLidJid,
    isNewsletterJid,
    isStatusBroadcastJid,
    WA_ADDRESSING_MODES,
    WA_GROUP_MEMBERSHIP_ACTION_TAGS,
    WA_IQ_TYPES,
    WA_MESSAGE_TAGS,
    WA_MESSAGE_TYPES,
    WA_NODE_TAGS,
    WA_REGISTRATION_NOTIFICATION_TAGS,
    WA_XMLNS
} from 'zapo-js/protocol'
import { findNodeChild } from 'zapo-js/transport'

import {
    ciphertextTypeKey,
    documentTypeFor,
    e2eDestinationKey,
    editTypeKey,
    fileExtension,
    findFirstEncNode,
    mediaTypeKey,
    pinInChatTypeKey,
    type WamCiphertextTypeKey,
    type WamE2eDestinationKey,
    type WamEditTypeKey,
    type WamMediaTypeKey
} from './send-parse.js'
import type { WaWamCoordinator } from './WaWamCoordinator.js'

/** Outbound send context retained (bounded) so a later `<ack>` can enrich MessageSend. */
interface SentMessageInfo {
    readonly destination: WamE2eDestinationKey
    readonly isLid: boolean
    readonly isGroup: boolean
    readonly ciphertextType: WamCiphertextTypeKey | null
    readonly mediaType: WamMediaTypeKey | null
    readonly editType: WamEditTypeKey | null
}

type WamGroupJoinRequestAction = 'MEMBERSHIP_REQUEST_APPROVE' | 'MEMBERSHIP_REQUEST_REJECT'

type PendingIq =
    | {
          readonly kind: 'joinRequest'
          readonly startMs: number
          readonly groupJid: string
          readonly joinRequestAction: WamGroupJoinRequestAction
      }
    | { readonly kind: 'groupCreate'; readonly hasGroupName: boolean }
    | { readonly kind: 'ephemeral'; readonly duration: number }
    | { readonly kind: 'disappearingMode'; readonly duration: number }

const MAX_TRACKED_SENDS = 256
const MAX_TRACKED_IQS = 64

/** A retry receipt at or above this count fires MessageHighRetryCount (WA's threshold). */
const HIGH_RETRY_THRESHOLD = 5

/** A message whose offline-queue position reaches this fires OfflineCountTooHigh (WA's `s=11`). */
const OFFLINE_COUNT_TOO_HIGH_THRESHOLD = 11

const SECONDS_PER_HOUR = 3600

export type WaWamAutoEmitterContext = Pick<WaClientPluginContext, 'on' | 'off' | 'client'>

function isSelfJid(candidate: string | undefined, meJid?: string, meLid?: string): boolean {
    return candidate !== undefined && (candidate === meJid || candidate === meLid)
}

function muteChatTypeKey(jid: string): 'ONE_ON_ONE' | 'GROUP' | 'CHANNEL' {
    if (isGroupJid(jid)) return 'GROUP'
    if (isNewsletterJid(jid)) return 'CHANNEL'
    return 'ONE_ON_ONE'
}

/** Business chat type is not derivable here, so only GROUP/INDIVIDUAL. */
function chatActionChatTypeKey(jid: string): 'GROUP' | 'INDIVIDUAL' {
    return isGroupJid(jid) ? 'GROUP' : 'INDIVIDUAL'
}

function pollChatTypeKey(jid: string): 'INDIVIDUAL' | 'GROUP' | 'STATUS' | 'CHANNEL' {
    if (isGroupJid(jid)) return 'GROUP'
    if (isNewsletterJid(jid)) return 'CHANNEL'
    if (isStatusBroadcastJid(jid)) return 'STATUS'
    return 'INDIVIDUAL'
}

function messageTypeKey(
    key: WaIncomingMessageEvent['key']
): 'CHANNEL' | 'STATUS' | 'BROADCAST' | 'GROUP' | 'INDIVIDUAL' {
    if (key.isNewsletter) return 'CHANNEL'
    if (key.isBroadcast) return isStatusBroadcastJid(key.remoteJid ?? '') ? 'STATUS' : 'BROADCAST'
    if (key.isGroup) return 'GROUP'
    return 'INDIVIDUAL'
}

/**
 * Bridges the host client's typed events and raw stanzas to WAM commits,
 * mirroring where WA Web fires each analytics event. Only sets fields a headless
 * client can truthfully derive; {@link dispose} detaches all subscriptions.
 */
export class WaWamAutoEmitter {
    private readonly unsubscribes: Array<() => void> = []
    private readonly sentMessages = new Map<string, SentMessageInfo>()
    private readonly pendingIqs = new Map<string, PendingIq>()
    private clockSkewReported = false
    private streamMode: 'MAIN' | 'SYNCING' | 'OFFLINE' | null = null
    private connectedOnce = false
    private resumeCount = 0
    private platformReported = false
    private readonly client: WaWamAutoEmitterContext['client']

    constructor(
        private readonly coordinator: WaWamCoordinator,
        ctx: WaWamAutoEmitterContext
    ) {
        this.client = ctx.client
        const onConnection = (event: WaConnectionEvent): void => this.onConnection(event)
        const onGroup = (event: WaGroupEvent): void => this.onGroup(event)
        const onMutationSend = (event: WaAppStateMutationEvent): void => this.onMutationSend(event)
        const onMessageSend = (event: WaOutgoingMessageEvent): void => this.onMessageSend(event)
        const onMessage = (event: WaIncomingMessageEvent): void => this.onMessage(event)
        const onReceipt = (event: WaIncomingReceiptEvent): void => this.onReceipt(event)
        const onNodeOut = (event: { readonly node: BinaryNode }): void => this.onNodeOut(event.node)
        const onNodeIn = (event: { readonly node: BinaryNode }): void => this.onNodeIn(event.node)
        const onUnhandled = (event: WaIncomingUnhandledStanzaEvent): void =>
            this.onUnhandledStanza(event)
        const onHistory = (event: WaHistorySyncChunkEvent): void => this.onHistorySyncChunk(event)
        ctx.on('connection', onConnection)
        ctx.on('group', onGroup)
        ctx.on('mutation_send', onMutationSend)
        ctx.on('message_send', onMessageSend)
        ctx.on('message', onMessage)
        ctx.on('receipt', onReceipt)
        ctx.on('debug_transport_node_out', onNodeOut)
        ctx.on('debug_transport_node_in', onNodeIn)
        ctx.on('debug_unhandled_stanza', onUnhandled)
        ctx.on('history_sync_chunk', onHistory)
        this.unsubscribes.push(
            () => ctx.off('connection', onConnection),
            () => ctx.off('group', onGroup),
            () => ctx.off('mutation_send', onMutationSend),
            () => ctx.off('message_send', onMessageSend),
            () => ctx.off('message', onMessage),
            () => ctx.off('receipt', onReceipt),
            () => ctx.off('debug_transport_node_out', onNodeOut),
            () => ctx.off('debug_transport_node_in', onNodeIn),
            () => ctx.off('debug_unhandled_stanza', onUnhandled),
            () => ctx.off('history_sync_chunk', onHistory)
        )
    }

    private onConnection(event: WaConnectionEvent): void {
        if (event.status === 'close') {
            if (this.streamMode !== null) this.setStreamMode('OFFLINE')
            return
        }
        this.coordinator.commit('WebcSocketConnect', {
            webcSocketConnectReason: event.isNewLogin ? 'PAGE_LOAD' : 'RECONNECT'
        })
        this.setStreamMode('SYNCING')
        if (this.connectedOnce) {
            this.resumeCount += 1
            this.coordinator.commit('WebcPageResume', { webcResumeCount: this.resumeCount })
        }
        this.connectedOnce = true
        if (!this.platformReported) {
            const platform = this.client.getCredentials()?.platform
            if (platform !== undefined) {
                this.platformReported = true
                this.coordinator.commit('WebcRawPlatforms', { webcRawPlatform: platform })
            }
        }
    }

    private onGroup(event: WaGroupEvent): void {
        if (event.action !== 'create' && event.action !== 'add') return
        const creds = this.client.getCredentials()
        const meJid = creds?.meJid
        const meLid = creds?.meLid
        if (isSelfJid(event.authorJid, meJid, meLid)) return
        if (event.action === 'add') {
            const added = event.participants ?? []
            const meAdded = added.some(
                (p) =>
                    isSelfJid(p.jid, meJid, meLid) ||
                    isSelfJid(p.lidJid, meJid, meLid) ||
                    isSelfJid(p.phoneJid, meJid, meLid)
            )
            if (!meAdded) return
        }
        this.coordinator.commit('GroupJoinC', {})
    }

    /** `mutation_send` is this client's own outbound app-state action, mirroring where WA Web fires these. */
    private onMutationSend(event: WaAppStateMutationEvent): void {
        if (event.schema === 'Mute') {
            const muted = event.operation === 'set' && event.muted === true
            const actionConducted = muted ? 'MUTE' : 'UNMUTE'
            this.coordinator.commit('ChatMute', {
                actionConducted,
                muteChatType: muteChatTypeKey(event.chatJid),
                ...(event.operation === 'set' && typeof event.muteEndTimestamp === 'number'
                    ? { muteDuration: Math.max(0, event.muteEndTimestamp - Date.now()) }
                    : {})
            })
            this.commitChatAction(actionConducted, event.chatJid)
            return
        }
        if (event.schema === 'Pin' && event.operation === 'set' && event.pinned === true) {
            this.commitChatAction('PIN', event.chatJid)
            this.coordinator.commit('MdSyncdDogfoodingFeatureUsage', {
                mdSyncdDogfoodingFeature: 'PIN_MUTATION'
            })
            return
        }
        if (event.schema === 'Archive' && event.operation === 'set' && event.archived === true) {
            this.commitChatAction('ARCHIVE', event.chatJid)
            return
        }
        if (event.schema === 'MarkChatAsRead' && event.operation === 'set') {
            this.commitChatAction(event.read === true ? 'READ' : 'UNREAD', event.chatJid)
            return
        }
        if (event.schema === 'DeleteChat') {
            this.coordinator.commit('MdSyncdDogfoodingFeatureUsage', {
                mdSyncdDogfoodingFeature: 'DELETE_MUTATION'
            })
            return
        }
        if (event.schema === 'ClearChat') {
            this.coordinator.commit('MdSyncdDogfoodingFeatureUsage', {
                mdSyncdDogfoodingFeature:
                    event.deleteStarred === '1'
                        ? 'CLEAR_CHAT_REMOVE_STARRED_MUTATION'
                        : 'CLEAR_CHAT_KEEP_STARRED_MUTATION'
            })
        }
        if (event.schema === 'UserStatusMute') {
            this.coordinator.commit('StatusMute', {
                muteAction: event.operation === 'set' && event.muted === true ? 'MUTE' : 'UNMUTE',
                statusCategory: 'REGULAR_STATUS'
            })
        }
    }

    private commitChatAction(
        chatActionType: 'MUTE' | 'UNMUTE' | 'PIN' | 'ARCHIVE' | 'READ' | 'UNREAD',
        chatJid: string
    ): void {
        this.coordinator.commit('ChatAction', {
            chatActionType,
            chatActionChatType: chatActionChatTypeKey(chatJid)
        })
    }

    private onMessageSend(event: WaOutgoingMessageEvent): void {
        const msg = unwrapMessage(event.message)
        const destination = e2eDestinationKey(event.to)
        const isGroup = isGroupJid(event.to)

        const ctx = getContextInfo(msg)
        if (ctx?.isForwarded) {
            const media = mediaTypeKey(resolveEncMediaType(msg) ?? undefined)
            const score = ctx.forwardingScore ?? 0
            this.coordinator.commit('ForwardSend', {
                messageType: destination,
                isFrequentlyForwarded: score >= 4,
                isForwardedForward: score > 1,
                ...(media !== null ? { messageMediaType: media } : {}),
                ...(isGroup ? { typeOfGroup: 'GROUP' as const } : {})
            })
        }

        const reaction = msg.reactionMessage
        if (reaction) {
            this.coordinator.commit('ReactionActions', {
                reactionAction: (reaction.text ?? '').length > 0 ? 'UPDATE' : 'DELETE',
                messageType: destination
            })
            return
        }

        const poll =
            msg.pollCreationMessage ??
            msg.pollCreationMessageV2 ??
            msg.pollCreationMessageV3 ??
            msg.pollCreationMessageV5
        if (poll) {
            this.coordinator.commit('PollsActions', {
                pollAction: 'CREATE_POLL',
                chatType: pollChatTypeKey(event.to),
                isAGroup: isGroup,
                ...(poll.options ? { pollOptionsCount: poll.options.length } : {}),
                ...(isGroup ? { typeOfGroup: 'GROUP' as const } : {})
            })
            return
        }
        if (msg.pollUpdateMessage) {
            this.coordinator.commit('PollsActions', {
                pollAction: 'VOTE',
                chatType: pollChatTypeKey(event.to),
                isAGroup: isGroup,
                ...(isGroup ? { typeOfGroup: 'GROUP' as const } : {})
            })
            return
        }

        const doc = msg.documentMessage
        if (doc) {
            const ext = fileExtension(doc.fileName)
            this.coordinator.commit('SendDocument', {
                documentType: documentTypeFor(doc.mimetype),
                ...(ext !== undefined ? { documentExt: ext } : {}),
                ...(typeof doc.pageCount === 'number' ? { documentPageSize: doc.pageCount } : {}),
                ...(typeof doc.fileLength === 'number' ? { documentSize: doc.fileLength } : {})
            })
            return
        }

        const sticker = msg.stickerMessage
        if (sticker) {
            this.coordinator.commit('StickerSend', {
                stickerIsAnimated: sticker.isAnimated === true,
                stickerIsLottie: sticker.isLottie === true
            })
            return
        }

        const pin = msg.pinInChatMessage
        if (pin) {
            const pinType = pinInChatTypeKey(pin.type)
            this.coordinator.commit('PinInChatMessageSend', {
                ...(pinType !== null ? { pinInChatType: pinType } : {}),
                isAGroup: isGroup,
                isSelfPin: true,
                ...(typeof pin.key?.fromMe === 'boolean'
                    ? { isSelfParentMessage: pin.key.fromMe }
                    : {})
            })
            return
        }
    }

    /** Mirrors WA Web's stream model: emit on each real mode transition, deduped. */
    private setStreamMode(mode: 'MAIN' | 'SYNCING' | 'OFFLINE'): void {
        if (this.streamMode === mode) return
        this.streamMode = mode
        this.coordinator.commit('WebcStreamModeChange', { webcStreamMode: mode })
    }

    private onMessage(event: WaIncomingMessageEvent): void {
        const key = event.key
        const isLid = isLidJid(key.participant ?? key.remoteJid ?? '')

        const enc = findFirstEncNode(event.rawNode)
        const media = enc !== null ? mediaTypeKey(enc.attrs.mediatype) : null
        if (enc !== null) {
            const ciphertextType = ciphertextTypeKey(enc.attrs.type)
            this.coordinator.commit('E2eMessageRecv', {
                e2eSuccessful: true,
                e2eDestination: e2eDestinationKey(key.remoteJid ?? ''),
                isLid,
                offline: event.offline ?? false,
                ...(ciphertextType !== null ? { e2eCiphertextType: ciphertextType } : {}),
                ...(enc.attrs.v !== undefined ? { e2eCiphertextVersion: Number(enc.attrs.v) } : {}),
                ...(media !== null ? { messageMediaType: media } : {}),
                ...(enc.attrs.count !== undefined ? { retryCount: Number(enc.attrs.count) } : {}),
                ...(key.isGroup ? { typeOfGroup: 'GROUP' as const } : {})
            })
        }

        this.coordinator.commit('MessageReceive', {
            messageType: messageTypeKey(key),
            isLid,
            messageIsOffline: event.offline ?? false,
            ...(key.isGroup ? { typeOfGroup: 'GROUP' as const } : {})
        })

        const offlineCount = Number(event.rawNode.attrs.offline)
        if (Number.isFinite(offlineCount) && offlineCount >= OFFLINE_COUNT_TOO_HIGH_THRESHOLD) {
            this.coordinator.commit('OfflineCountTooHigh', {
                offlineCount,
                stanzaType: 'MESSAGE',
                messageType: messageTypeKey(key),
                mediaType: media ?? 'NONE'
            })
        }
    }

    private onReceipt(event: WaIncomingReceiptEvent): void {
        this.coordinator.commit('ReceiptStanzaReceive', {
            receiptStanzaType: event.status,
            receiptStanzaTotalCount: event.messageIds.length
        })
    }

    private onNodeOut(node: BinaryNode): void {
        if (node.tag === WA_NODE_TAGS.IQ) {
            this.trackOutgoingIq(node)
            return
        }
        if (node.tag !== WA_MESSAGE_TAGS.MESSAGE) return
        const enc = findFirstEncNode(node)
        if (enc === null) return
        const to = node.attrs.to ?? ''
        const destination = e2eDestinationKey(to)
        const isLid = isLidJid(to) || node.attrs.addressing_mode === WA_ADDRESSING_MODES.LID
        const isGroup = isGroupJid(to)
        const ciphertextType = ciphertextTypeKey(enc.attrs.type)
        const media = mediaTypeKey(enc.attrs.mediatype)
        const version = enc.attrs.v
        const count = enc.attrs.count
        const editType = editTypeKey(node.attrs.edit)

        this.coordinator.commit('E2eMessageSend', {
            e2eSuccessful: true,
            e2eDestination: destination,
            isLid,
            botType: 'UNKNOWN',
            editType: editType ?? 'NOT_EDITED',
            retryCount: count !== undefined ? Number(count) : 0,
            ...(ciphertextType !== null ? { e2eCiphertextType: ciphertextType } : {}),
            ...(version !== undefined ? { e2eCiphertextVersion: Number(version) } : {}),
            ...(media !== null ? { messageMediaType: media } : {}),
            ...(isGroup ? { typeOfGroup: 'GROUP' as const } : {})
        })

        this.coordinator.commit('WebcMessageSend', {
            messageType: destination,
            ...(media !== null ? { messageMediaType: media } : {})
        })

        const id = node.attrs.id
        if (id !== undefined) {
            this.trackSend(id, {
                destination,
                isLid,
                isGroup,
                ciphertextType,
                mediaType: media,
                editType
            })
        }
    }

    private onNodeIn(node: BinaryNode): void {
        if (node.tag === WA_NODE_TAGS.INFO_BULLETIN) {
            if (findNodeChild(node, WA_NODE_TAGS.OFFLINE) !== undefined) this.setStreamMode('MAIN')
            return
        }
        if (node.tag === WA_NODE_TAGS.NOTIFICATION) {
            const oldReg = findNodeChild(
                node,
                WA_REGISTRATION_NOTIFICATION_TAGS.WA_OLD_REGISTRATION
            )
            if (oldReg !== undefined && oldReg.attrs.device_id !== undefined) {
                this.coordinator.commit('WaOldCode', { deviceId: oldReg.attrs.device_id })
            }
        }
        if (!this.clockSkewReported && node.attrs.t !== undefined) {
            this.clockSkewReported = true
            const serverSeconds = Number(node.attrs.t)
            const skewSeconds = Date.now() / 1000 - serverSeconds
            if (Number.isFinite(serverSeconds) && Math.abs(skewSeconds) >= SECONDS_PER_HOUR) {
                this.coordinator.commit('ClockSkewDifferenceT', {
                    clockSkewHourly: Math.round(skewSeconds / SECONDS_PER_HOUR)
                })
            }
        }
        if (node.tag === WA_NODE_TAGS.IQ) {
            if (node.attrs.type === WA_IQ_TYPES.RESULT || node.attrs.type === WA_IQ_TYPES.ERROR) {
                this.resolveOutgoingIq(node, node.attrs.type === WA_IQ_TYPES.RESULT)
            }
            return
        }
        if (
            node.tag === WA_MESSAGE_TAGS.RECEIPT &&
            node.attrs.type === WA_MESSAGE_TYPES.RECEIPT_TYPE_RETRY
        ) {
            const retry = findNodeChild(node, WA_MESSAGE_TYPES.RECEIPT_TYPE_RETRY)
            const count = retry?.attrs.count !== undefined ? Number(retry.attrs.count) : 0
            if (count >= HIGH_RETRY_THRESHOLD) {
                this.coordinator.commit('MessageHighRetryCount', {
                    retryCount: count,
                    messageType: e2eDestinationKey(node.attrs.from ?? ''),
                    isSenderLidBased: node.attrs.is_lid === 'true'
                })
            }
            return
        }
        if (
            node.tag === WA_MESSAGE_TAGS.ACK &&
            node.attrs.class === WA_MESSAGE_TYPES.ACK_CLASS_MESSAGE
        ) {
            const id = node.attrs.id
            if (id === undefined) return
            const info = this.sentMessages.get(id)
            if (info === undefined) return
            this.sentMessages.delete(id)
            this.coordinator.commit('MessageSend', {
                messageSendResult: 'OK',
                messageSendResultIsTerminal: false,
                messageType: info.destination,
                isLid: info.isLid,
                botType: 'UNKNOWN',
                editType: info.editType ?? 'NOT_EDITED',
                messageIsRevoke:
                    info.editType === 'SENDER_REVOKE' || info.editType === 'ADMIN_REVOKE',
                e2eBackfill: false,
                ...(info.ciphertextType !== null ? { e2eCiphertextType: info.ciphertextType } : {}),
                ...(info.mediaType !== null ? { messageMediaType: info.mediaType } : {}),
                ...(info.isGroup ? { typeOfGroup: 'GROUP' as const } : {})
            })
            if (info.editType !== null) {
                this.coordinator.commit('EditMessageSend', {
                    editType: info.editType,
                    messageType: info.destination,
                    messageSendResultIsTerminal: false,
                    ...(info.mediaType !== null ? { mediaType: info.mediaType } : {}),
                    ...(info.isGroup ? { typeOfGroup: 'GROUP' as const } : {})
                })
            }
            if (info.editType === 'SENDER_REVOKE' || info.editType === 'ADMIN_REVOKE') {
                this.coordinator.commit('RevokeMessageSend', {
                    revokeType: info.editType === 'ADMIN_REVOKE' ? 'ADMIN' : 'SENDER',
                    messageType: info.destination,
                    messageSendResultIsTerminal: false
                })
                this.coordinator.commit('MessageDeleteActions', {
                    deleteActionType: 'DELETE_FOR_EVERYONE',
                    isAGroup: info.isGroup,
                    messagesDeleted: 1
                })
                this.coordinator.commit('SendRevokeMessage', { messageType: info.destination })
            }
        }
    }

    private trackSend(id: string, info: SentMessageInfo): void {
        if (this.sentMessages.size >= MAX_TRACKED_SENDS) {
            const oldest = this.sentMessages.keys().next().value
            if (oldest !== undefined) this.sentMessages.delete(oldest)
        }
        this.sentMessages.set(id, info)
    }

    /** Tracks a membership-request approve/reject IQ so its response can emit round-trip time + result. */
    private trackOutgoingIq(node: BinaryNode): void {
        const id = node.attrs.id
        if (id === undefined || node.attrs.type !== WA_IQ_TYPES.SET) return
        if (node.attrs.xmlns === WA_XMLNS.GROUPS) {
            const membership = findNodeChild(node, WA_GROUP_MEMBERSHIP_ACTION_TAGS.REQUESTS_ACTION)
            if (membership !== undefined) {
                const groupJid = node.attrs.to
                const joinRequestAction: WamGroupJoinRequestAction | null =
                    findNodeChild(membership, WA_GROUP_MEMBERSHIP_ACTION_TAGS.APPROVE) !== undefined
                        ? 'MEMBERSHIP_REQUEST_APPROVE'
                        : findNodeChild(membership, WA_GROUP_MEMBERSHIP_ACTION_TAGS.REJECT) !==
                            undefined
                          ? 'MEMBERSHIP_REQUEST_REJECT'
                          : null
                if (groupJid !== undefined && joinRequestAction !== null) {
                    this.trackIq(id, {
                        kind: 'joinRequest',
                        startMs: Date.now(),
                        groupJid,
                        joinRequestAction
                    })
                }
                return
            }
            const create = findNodeChild(node, 'create')
            if (create !== undefined) {
                this.trackIq(id, {
                    kind: 'groupCreate',
                    hasGroupName: create.attrs.subject !== undefined
                })
                return
            }
            const ephemeral = findNodeChild(node, WA_NODE_TAGS.EPHEMERAL)
            if (ephemeral?.attrs.expiration !== undefined) {
                this.trackIq(id, {
                    kind: 'ephemeral',
                    duration: Number(ephemeral.attrs.expiration)
                })
            }
            return
        }
        if (node.attrs.xmlns === WA_XMLNS.DISAPPEARING_MODE) {
            const dm = findNodeChild(node, WA_NODE_TAGS.DISAPPEARING_MODE)
            if (dm?.attrs.duration !== undefined) {
                this.trackIq(id, { kind: 'disappearingMode', duration: Number(dm.attrs.duration) })
            }
        }
    }

    private resolveOutgoingIq(node: BinaryNode, isSuccessful: boolean): void {
        const id = node.attrs.id
        if (id === undefined) return
        const pending = this.pendingIqs.get(id)
        if (pending === undefined) return
        this.pendingIqs.delete(id)
        switch (pending.kind) {
            case 'joinRequest':
                this.coordinator.commit('WaFsGroupJoinRequestAction', {
                    groupJid: pending.groupJid,
                    groupJoinRequestAction: pending.joinRequestAction,
                    isSuccessful,
                    serverResponseTime: Math.max(0, Date.now() - pending.startMs)
                })
                return
            case 'groupCreate':
                if (!isSuccessful) return
                this.coordinator.commit('GroupCreate', { hasGroupName: pending.hasGroupName })
                this.coordinator.commit('GroupCreateC', {})
                return
            case 'ephemeral':
                this.coordinator.commit('EphemeralSettingChange', {
                    chatEphemeralityDuration: pending.duration,
                    isSuccess: isSuccessful
                })
                return
            case 'disappearingMode':
                this.coordinator.commit('DisappearingModeSettingChange', {
                    newEphemeralityDuration: pending.duration,
                    isSuccess: isSuccessful
                })
        }
    }

    private trackIq(id: string, pending: PendingIq): void {
        if (this.pendingIqs.size >= MAX_TRACKED_IQS) {
            const oldest = this.pendingIqs.keys().next().value
            if (oldest !== undefined) this.pendingIqs.delete(oldest)
        }
        this.pendingIqs.set(id, pending)
    }

    private onUnhandledStanza(event: WaIncomingUnhandledStanzaEvent): void {
        this.coordinator.commit('UnknownStanza', {
            unknownStanzaTag: event.rawNode.tag,
            ...(event.rawNode.attrs.type !== undefined
                ? { unknownStanzaType: event.rawNode.attrs.type }
                : {})
        })
    }

    private onHistorySyncChunk(event: WaHistorySyncChunkEvent): void {
        this.coordinator.commit('MdBootstrapHistoryDataReceived', {
            ...(event.chunkOrder !== undefined ? { historySyncChunkOrder: event.chunkOrder } : {}),
            ...(event.progress !== undefined ? { historySyncStageProgress: event.progress } : {})
        })
    }

    dispose(): void {
        for (let i = this.unsubscribes.length - 1; i >= 0; i -= 1) this.unsubscribes[i]()
        this.unsubscribes.length = 0
    }
}
