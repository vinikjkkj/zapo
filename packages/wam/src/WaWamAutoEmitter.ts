import type {
    BinaryNode,
    WaClientPluginContext,
    WaConnectionEvent,
    WaHistorySyncChunkEvent,
    WaIncomingMessageEvent,
    WaIncomingReceiptEvent,
    WaIncomingUnhandledStanzaEvent
} from 'zapo-js'
import { isGroupJid, isLidJid, isStatusBroadcastJid } from 'zapo-js/protocol'
import { findNodeChild } from 'zapo-js/transport'

import {
    ciphertextTypeKey,
    e2eDestinationKey,
    editTypeKey,
    findFirstEncNode,
    mediaTypeKey,
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

/** Cap on tracked in-flight sends; oldest evict first when exceeded. */
const MAX_TRACKED_SENDS = 256

/** A retry receipt at or above this count fires MessageHighRetryCount (WA's threshold). */
const HIGH_RETRY_THRESHOLD = 5

const SECONDS_PER_HOUR = 3600

/** Subset of the plugin context the auto-emitter subscribes through. */
export type WaWamAutoEmitterContext = Pick<WaClientPluginContext, 'on' | 'off'>

/** MESSAGE_TYPE enum key for the chat a received message belongs to. */
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
    private clockSkewReported = false
    private streamMode: 'MAIN' | 'SYNCING' | 'OFFLINE' | null = null
    private connectedOnce = false
    private resumeCount = 0

    constructor(
        private readonly coordinator: WaWamCoordinator,
        ctx: WaWamAutoEmitterContext
    ) {
        const onConnection = (event: WaConnectionEvent): void => this.onConnection(event)
        const onMessage = (event: WaIncomingMessageEvent): void => this.onMessage(event)
        const onReceipt = (event: WaIncomingReceiptEvent): void => this.onReceipt(event)
        const onNodeOut = (event: { readonly node: BinaryNode }): void => this.onNodeOut(event.node)
        const onNodeIn = (event: { readonly node: BinaryNode }): void => this.onNodeIn(event.node)
        const onUnhandled = (event: WaIncomingUnhandledStanzaEvent): void =>
            this.onUnhandledStanza(event)
        const onHistory = (event: WaHistorySyncChunkEvent): void => this.onHistorySyncChunk(event)
        ctx.on('connection', onConnection)
        ctx.on('message', onMessage)
        ctx.on('receipt', onReceipt)
        ctx.on('debug_transport_node_out', onNodeOut)
        ctx.on('debug_transport_node_in', onNodeIn)
        ctx.on('debug_unhandled_stanza', onUnhandled)
        ctx.on('history_sync_chunk', onHistory)
        this.unsubscribes.push(
            () => ctx.off('connection', onConnection),
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
        if (enc !== null) {
            const ciphertextType = ciphertextTypeKey(enc.attrs.type)
            const media = mediaTypeKey(enc.attrs.mediatype)
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
    }

    private onReceipt(event: WaIncomingReceiptEvent): void {
        this.coordinator.commit('ReceiptStanzaReceive', {
            receiptStanzaType: event.status,
            receiptStanzaTotalCount: event.messageIds.length
        })
    }

    private onNodeOut(node: BinaryNode): void {
        if (node.tag !== 'message') return
        const enc = findFirstEncNode(node)
        if (enc === null) return
        const to = node.attrs.to ?? ''
        const destination = e2eDestinationKey(to)
        const isLid = isLidJid(to) || node.attrs.addressing_mode === 'lid'
        const isGroup = isGroupJid(to)
        const ciphertextType = ciphertextTypeKey(enc.attrs.type)
        const media = mediaTypeKey(enc.attrs.mediatype)
        const version = enc.attrs.v
        const count = enc.attrs.count

        this.coordinator.commit('E2eMessageSend', {
            e2eSuccessful: true,
            e2eDestination: destination,
            isLid,
            ...(ciphertextType !== null ? { e2eCiphertextType: ciphertextType } : {}),
            ...(version !== undefined ? { e2eCiphertextVersion: Number(version) } : {}),
            ...(media !== null ? { messageMediaType: media } : {}),
            ...(count !== undefined ? { retryCount: Number(count) } : {}),
            ...(isGroup ? { typeOfGroup: 'GROUP' as const } : {})
        })

        this.coordinator.commit('WebcMessageSend', {
            messageType: destination,
            ...(media !== null ? { messageMediaType: media } : {})
        })

        const id = node.attrs.id
        if (id !== undefined) {
            const editType = editTypeKey(node.attrs.edit)
            this.trackSend(id, { destination, isLid, isGroup, ciphertextType, mediaType: media, editType })
        }
    }

    private onNodeIn(node: BinaryNode): void {
        if (node.tag === 'ib') {
            if (findNodeChild(node, 'offline') !== null) this.setStreamMode('MAIN')
            return
        }
        if (node.tag === 'notification') {
            const oldReg = findNodeChild(node, 'wa_old_registration')
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
        if (node.tag === 'receipt' && node.attrs.type === 'retry') {
            const retry = findNodeChild(node, 'retry')
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
        if (node.tag === 'ack' && node.attrs.class === 'message') {
            const id = node.attrs.id
            if (id === undefined) return
            const info = this.sentMessages.get(id)
            if (info === undefined) return
            this.sentMessages.delete(id)
            this.coordinator.commit('MessageSend', {
                messageSendResult: 'OK',
                messageType: info.destination,
                isLid: info.isLid,
                ...(info.ciphertextType !== null ? { e2eCiphertextType: info.ciphertextType } : {}),
                ...(info.mediaType !== null ? { messageMediaType: info.mediaType } : {}),
                ...(info.isGroup ? { typeOfGroup: 'GROUP' as const } : {})
            })
            if (info.editType !== null) {
                this.coordinator.commit('EditMessageSend', {
                    editType: info.editType,
                    messageType: info.destination,
                    ...(info.mediaType !== null ? { mediaType: info.mediaType } : {}),
                    ...(info.isGroup ? { typeOfGroup: 'GROUP' as const } : {})
                })
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

    /** Detaches every event subscription. */
    dispose(): void {
        for (let i = this.unsubscribes.length - 1; i >= 0; i -= 1) this.unsubscribes[i]()
        this.unsubscribes.length = 0
    }
}
