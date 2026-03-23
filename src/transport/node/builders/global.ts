import {
    WA_DEFAULTS,
    WA_IQ_TYPES,
    WA_MESSAGE_TAGS,
    WA_MESSAGE_TYPES,
    WA_NODE_TAGS
} from '@protocol'
import { isGroupOrBroadcastJid } from '@protocol/jid'
import type { BinaryNode } from '@transport/types'

export type BuildAckNodeInput =
    | {
          readonly kind: 'notification'
          readonly node: BinaryNode
          readonly typeOverride?: string
          readonly includeParticipant?: boolean
          readonly includeType?: boolean
          readonly content?: BinaryNode[]
      }
    | {
          readonly kind: 'message'
          readonly node: BinaryNode
          readonly id: string
          readonly to: string
          readonly from?: string | null
          readonly typeOverride?: string
          readonly participant?: string
          readonly recipient?: string
      }
    | {
          readonly kind: 'receipt'
          readonly node: BinaryNode
          readonly retryType?: boolean
          readonly typeOverride?: string
          readonly includeParticipant?: boolean
          readonly includeRecipient?: boolean
      }
    | {
          readonly kind: 'aggregate_message'
          readonly to: string
          readonly ids: readonly string[]
          readonly recipient?: string
          readonly participant?: string
          readonly type?: string
      }
    | {
          readonly kind: 'nack'
          readonly stanzaTag: string
          readonly id: string
          readonly to: string
          readonly type?: string
          readonly participant?: string
          readonly error: number | string
          readonly failureReason?: number
      }
    | {
          readonly kind: 'custom'
          readonly ackClass: string
          readonly to: string
          readonly id?: string
          readonly type?: string
          readonly participant?: string
          readonly recipient?: string
          readonly from?: string
          readonly error?: number | string
          readonly content?: BinaryNode[]
      }

function buildListItemsNode(ids: readonly string[]): BinaryNode | null {
    if (ids.length < 2) {
        return null
    }
    return {
        tag: WA_NODE_TAGS.LIST,
        attrs: {},
        content: ids.slice(1).map((id) => ({
            tag: 'item',
            attrs: { id }
        }))
    }
}

function normalizeNackClass(stanzaTag: string): string {
    if (stanzaTag === WA_MESSAGE_TAGS.MESSAGE) {
        return WA_MESSAGE_TYPES.ACK_CLASS_MESSAGE
    }
    if (stanzaTag === WA_MESSAGE_TAGS.RECEIPT) {
        return 'receipt'
    }
    if (stanzaTag === WA_NODE_TAGS.NOTIFICATION) {
        return WA_NODE_TAGS.NOTIFICATION
    }
    return stanzaTag
}

export function buildAckNode(input: BuildAckNodeInput): BinaryNode {
    if (input.kind === 'notification') {
        const attrs: Record<string, string> = {
            to: input.node.attrs.from ?? WA_DEFAULTS.HOST_DOMAIN,
            class: WA_NODE_TAGS.NOTIFICATION
        }
        const includeType = input.includeType ?? true
        if (includeType) {
            attrs.type = input.typeOverride ?? input.node.attrs.type ?? WA_NODE_TAGS.NOTIFICATION
        }
        if (input.node.attrs.id) {
            attrs.id = input.node.attrs.id
        }
        if (input.includeParticipant && input.node.attrs.participant) {
            attrs.participant = input.node.attrs.participant
        }
        return {
            tag: WA_MESSAGE_TAGS.ACK,
            attrs,
            content: input.content
        }
    }

    if (input.kind === 'message') {
        const attrs: Record<string, string> = {
            id: input.id,
            to: input.to,
            class: WA_MESSAGE_TYPES.ACK_CLASS_MESSAGE
        }
        const type = input.typeOverride ?? input.node.attrs.type
        if (type) {
            attrs.type = type
        }
        const participant = input.participant ?? input.node.attrs.participant
        if (participant) {
            attrs.participant = participant
        }
        if (input.recipient) {
            attrs.recipient = input.recipient
        }
        if (input.from) {
            attrs.from = input.from
        }
        return {
            tag: WA_MESSAGE_TAGS.ACK,
            attrs
        }
    }

    if (input.kind === 'aggregate_message') {
        if (input.ids.length === 0) {
            throw new Error('aggregate message ack requires at least one id')
        }
        const attrs: Record<string, string> = {
            id: input.ids[0],
            to: input.to,
            class: WA_MESSAGE_TYPES.ACK_CLASS_MESSAGE,
            type: input.type ?? 'text'
        }
        if (input.recipient) {
            attrs.recipient = input.recipient
        }
        if (input.participant) {
            attrs.participant = input.participant
        }
        const listNode = buildListItemsNode(input.ids)
        return {
            tag: WA_MESSAGE_TAGS.ACK,
            attrs,
            content: listNode ? [listNode] : undefined
        }
    }

    if (input.kind === 'nack') {
        const attrs: Record<string, string> = {
            id: input.id,
            to: input.to,
            class: normalizeNackClass(input.stanzaTag),
            error: String(input.error)
        }
        if (input.type) {
            attrs.type = input.type
        }
        if (input.participant) {
            attrs.participant = input.participant
        }
        const content: BinaryNode[] | undefined =
            input.failureReason === undefined
                ? undefined
                : [
                      {
                          tag: 'meta',
                          attrs: {
                              failure_reason: String(input.failureReason)
                          }
                      }
                  ]
        return {
            tag: WA_MESSAGE_TAGS.ACK,
            attrs,
            content
        }
    }

    if (input.kind === 'custom') {
        const attrs: Record<string, string> = {
            class: input.ackClass,
            to: input.to
        }
        if (input.id) {
            attrs.id = input.id
        }
        if (input.type) {
            attrs.type = input.type
        }
        if (input.participant) {
            attrs.participant = input.participant
        }
        if (input.recipient) {
            attrs.recipient = input.recipient
        }
        if (input.from) {
            attrs.from = input.from
        }
        if (input.error !== undefined) {
            attrs.error = String(input.error)
        }
        return {
            tag: WA_MESSAGE_TAGS.ACK,
            attrs,
            content: input.content
        }
    }

    const attrs: Record<string, string> = {
        class: 'receipt'
    }
    if (input.retryType) {
        attrs.type = input.typeOverride ?? WA_MESSAGE_TYPES.RECEIPT_TYPE_RETRY
    } else if (input.node.attrs.type) {
        attrs.type = input.node.attrs.type
    }
    if (input.node.attrs.id) {
        attrs.id = input.node.attrs.id
    }
    if (input.node.attrs.from) {
        attrs.to = input.node.attrs.from
    }
    if (input.retryType) {
        if (input.node.attrs.participant) {
            attrs.participant = input.node.attrs.participant
        }
    } else if (
        (input.includeParticipant ?? true) &&
        input.node.attrs.participant &&
        (!input.node.attrs.from || input.node.attrs.participant !== input.node.attrs.from)
    ) {
        attrs.participant = input.node.attrs.participant
    }
    if (input.includeRecipient && input.node.attrs.recipient) {
        attrs.recipient = input.node.attrs.recipient
    }
    return {
        tag: WA_MESSAGE_TAGS.ACK,
        attrs
    }
}

export type BuildReceiptNodeInput =
    | {
          readonly kind: 'delivery'
          readonly node: BinaryNode
          readonly id: string
          readonly to: string
      }
    | {
          readonly kind: 'retry_custom'
          readonly id: string
          readonly to: string
          readonly participant?: string
          readonly recipient?: string
          readonly categoryPeer?: boolean
          readonly content: BinaryNode[]
      }
    | {
          readonly kind: 'retry'
          readonly node: BinaryNode
          readonly id: string
          readonly to: string
          readonly retryCount?: number
      }
    | {
          readonly kind: 'outbound'
          readonly id: string
          readonly to: string
          readonly type?: string
          readonly participant?: string
          readonly recipient?: string
          readonly category?: string
          readonly from?: string
          readonly t?: string
          readonly peerParticipantPn?: string
          readonly listIds?: readonly string[]
          readonly content?: BinaryNode[]
      }
    | {
          readonly kind: 'server_error'
          readonly id: string
          readonly to: string
          readonly categoryPeer?: boolean
          readonly encryptCiphertext: Uint8Array
          readonly encryptIv: Uint8Array
          readonly rmrJid?: string
          readonly rmrFromMe?: boolean | string
          readonly rmrParticipant?: string
      }
    | {
          readonly kind: 'custom'
          readonly attrs: Readonly<Record<string, string>>
          readonly content?: BinaryNode[]
      }

export function buildReceiptNode(input: BuildReceiptNodeInput): BinaryNode {
    if (input.kind === 'delivery') {
        const attrs: Record<string, string> = {
            id: input.id,
            to: input.to
        }
        if (input.node.attrs.participant && isGroupOrBroadcastJid(input.to)) {
            attrs.participant = input.node.attrs.participant
        }
        if (input.node.attrs.category === 'peer') {
            attrs.type = WA_MESSAGE_TYPES.RECEIPT_TYPE_PEER
        }
        return {
            tag: WA_MESSAGE_TAGS.RECEIPT,
            attrs
        }
    }

    if (input.kind === 'outbound') {
        const attrs: Record<string, string> = {
            id: input.id,
            to: input.to
        }
        if (input.type) {
            attrs.type = input.type
        }
        if (input.participant) {
            attrs.participant = input.participant
        }
        if (input.recipient) {
            attrs.recipient = input.recipient
        }
        if (input.category) {
            attrs.category = input.category
        }
        if (input.from) {
            attrs.from = input.from
        }
        if (input.t) {
            attrs.t = input.t
        }
        if (input.peerParticipantPn) {
            attrs.peer_participant_pn = input.peerParticipantPn
        }
        const content: BinaryNode[] = input.content ? [...input.content] : []
        const listNode = input.listIds ? buildListItemsNode(input.listIds) : null
        if (listNode) {
            content.push(listNode)
        }
        return {
            tag: WA_MESSAGE_TAGS.RECEIPT,
            attrs,
            content: content.length > 0 ? content : undefined
        }
    }

    if (input.kind === 'retry_custom') {
        const attrs: Record<string, string> = {
            id: input.id,
            to: input.to,
            type: WA_MESSAGE_TYPES.RECEIPT_TYPE_RETRY
        }
        if (input.participant) {
            attrs.participant = input.participant
        }
        if (input.recipient) {
            attrs.recipient = input.recipient
        }
        if (input.categoryPeer) {
            attrs.category = 'peer'
        }
        return {
            tag: WA_MESSAGE_TAGS.RECEIPT,
            attrs,
            content: input.content
        }
    }

    if (input.kind === 'server_error') {
        const attrs: Record<string, string> = {
            id: input.id,
            to: input.to,
            type: WA_MESSAGE_TYPES.RECEIPT_TYPE_SERVER_ERROR
        }
        if (input.categoryPeer) {
            attrs.category = 'peer'
        }
        const content: BinaryNode[] = [
            {
                tag: 'encrypt',
                attrs: {},
                content: [
                    {
                        tag: 'enc_p',
                        attrs: {},
                        content: input.encryptCiphertext
                    },
                    {
                        tag: 'enc_iv',
                        attrs: {},
                        content: input.encryptIv
                    }
                ]
            }
        ]
        if (input.rmrJid || input.rmrFromMe !== undefined || input.rmrParticipant) {
            const rmrAttrs: Record<string, string> = {}
            if (input.rmrJid) {
                rmrAttrs.jid = input.rmrJid
            }
            if (input.rmrFromMe !== undefined) {
                rmrAttrs.from_me = String(input.rmrFromMe)
            }
            if (input.rmrParticipant) {
                rmrAttrs.participant = input.rmrParticipant
            }
            content.push({
                tag: 'rmr',
                attrs: rmrAttrs
            })
        }
        return {
            tag: WA_MESSAGE_TAGS.RECEIPT,
            attrs,
            content
        }
    }

    if (input.kind === 'custom') {
        return {
            tag: WA_MESSAGE_TAGS.RECEIPT,
            attrs: {
                ...input.attrs
            },
            content: input.content
        }
    }

    const attrs: Record<string, string> = {
        id: input.id,
        to: input.to,
        type: WA_MESSAGE_TYPES.RECEIPT_TYPE_RETRY
    }
    if (input.node.attrs.category === 'peer') {
        attrs.category = 'peer'
    }
    if (input.node.attrs.recipient && input.node.attrs.category !== 'peer') {
        attrs.recipient = input.node.attrs.recipient
    }
    if (input.node.attrs.participant && isGroupOrBroadcastJid(input.to)) {
        attrs.participant = input.node.attrs.participant
    }
    const retryCount = input.retryCount ?? 1
    const normalizedRetryCount = Number.isSafeInteger(retryCount) && retryCount > 0 ? retryCount : 1
    const retryAttrs: Record<string, string> = {
        count: String(normalizedRetryCount),
        id: input.id
    }
    const timestamp = input.node.attrs.t
    if (timestamp) {
        retryAttrs.t = timestamp
    }
    return {
        tag: WA_MESSAGE_TAGS.RECEIPT,
        attrs,
        content: [
            {
                tag: 'retry',
                attrs: retryAttrs
            }
        ]
    }
}

export function buildIqResultNode(iqNode: BinaryNode): BinaryNode {
    return {
        tag: WA_NODE_TAGS.IQ,
        attrs: {
            ...(iqNode.attrs.id ? { id: iqNode.attrs.id } : {}),
            to: iqNode.attrs.from ?? WA_DEFAULTS.HOST_DOMAIN,
            type: WA_IQ_TYPES.RESULT
        }
    }
}
