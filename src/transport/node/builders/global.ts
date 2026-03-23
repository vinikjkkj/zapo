import { WA_DEFAULTS, WA_IQ_TYPES, WA_MESSAGE_TAGS, WA_NODE_TAGS } from '@protocol'
import type { BinaryNode } from '@transport/types'

export function buildNotificationAckNode(
    node: BinaryNode,
    typeOverride?: string,
    includeParticipant = false,
    includeType = true
): BinaryNode {
    const attrs: Record<string, string> = {
        to: node.attrs.from ?? WA_DEFAULTS.HOST_DOMAIN,
        class: WA_NODE_TAGS.NOTIFICATION
    }
    if (includeType) {
        attrs.type = typeOverride ?? node.attrs.type ?? WA_NODE_TAGS.NOTIFICATION
    }
    if (node.attrs.id) {
        attrs.id = node.attrs.id
    }
    if (includeParticipant && node.attrs.participant) {
        attrs.participant = node.attrs.participant
    }
    return {
        tag: WA_NODE_TAGS.ACK,
        attrs
    }
}

export function buildRetryReceiptAckNode(receiptNode: BinaryNode): BinaryNode {
    const attrs: Record<string, string> = {
        class: 'receipt',
        type: 'retry'
    }
    if (receiptNode.attrs.id) {
        attrs.id = receiptNode.attrs.id
    }
    if (receiptNode.attrs.from) {
        attrs.to = receiptNode.attrs.from
    }
    if (receiptNode.attrs.participant) {
        attrs.participant = receiptNode.attrs.participant
    }
    return {
        tag: WA_MESSAGE_TAGS.ACK,
        attrs
    }
}

export function buildReceiptAckNode(receiptNode: BinaryNode): BinaryNode {
    const attrs: Record<string, string> = {
        class: 'receipt'
    }
    if (receiptNode.attrs.id) {
        attrs.id = receiptNode.attrs.id
    }
    if (receiptNode.attrs.from) {
        attrs.to = receiptNode.attrs.from
    }
    if (receiptNode.attrs.type) {
        attrs.type = receiptNode.attrs.type
    }
    if (
        receiptNode.attrs.participant &&
        (!receiptNode.attrs.from || receiptNode.attrs.participant !== receiptNode.attrs.from)
    ) {
        attrs.participant = receiptNode.attrs.participant
    }
    return {
        tag: WA_MESSAGE_TAGS.ACK,
        attrs
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
