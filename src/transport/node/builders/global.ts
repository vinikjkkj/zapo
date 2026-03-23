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
      }
    | {
          readonly kind: 'message'
          readonly node: BinaryNode
          readonly id: string
          readonly to: string
          readonly from?: string | null
      }
    | {
          readonly kind: 'receipt'
          readonly node: BinaryNode
          readonly retryType?: boolean
          readonly includeParticipant?: boolean
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
            attrs
        }
    }

    if (input.kind === 'message') {
        const attrs: Record<string, string> = {
            id: input.id,
            to: input.to,
            class: WA_MESSAGE_TYPES.ACK_CLASS_MESSAGE
        }
        if (input.node.attrs.type) {
            attrs.type = input.node.attrs.type
        }
        if (input.node.attrs.participant) {
            attrs.participant = input.node.attrs.participant
        }
        if (input.from) {
            attrs.from = input.from
        }
        return {
            tag: WA_MESSAGE_TAGS.ACK,
            attrs
        }
    }

    const attrs: Record<string, string> = {
        class: 'receipt'
    }
    if (input.retryType) {
        attrs.type = 'retry'
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

    if (input.kind === 'retry_custom') {
        const attrs: Record<string, string> = {
            id: input.id,
            to: input.to,
            type: 'retry'
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

    const attrs: Record<string, string> = {
        id: input.id,
        to: input.to,
        type: 'retry'
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
