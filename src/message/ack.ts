import {
    WA_MESSAGE_ACK_ATTRS,
    WA_MESSAGE_TAGS,
    WA_MESSAGE_TYPES,
    WA_RETRYABLE_ACK_CODES
} from '../protocol/constants'
import type { BinaryNode } from '../transport/types'

export function isAckOrReceiptNode(node: BinaryNode): boolean {
    return node.tag === WA_MESSAGE_TAGS.ACK || node.tag === WA_MESSAGE_TAGS.RECEIPT
}

export function isNegativeAckNode(node: BinaryNode): boolean {
    if (node.tag === WA_MESSAGE_TAGS.ERROR) {
        return true
    }
    if (node.tag !== WA_MESSAGE_TAGS.ACK) {
        return false
    }
    const ackType = node.attrs[WA_MESSAGE_ACK_ATTRS.TYPE]
    const ackClass = node.attrs[WA_MESSAGE_ACK_ATTRS.CLASS]
    return (
        ackType === WA_MESSAGE_TYPES.ACK_TYPE_ERROR ||
        ackClass === WA_MESSAGE_TYPES.ACK_CLASS_ERROR
    )
}

export function isRetryableNegativeAck(node: BinaryNode): boolean {
    const code = node.attrs[WA_MESSAGE_ACK_ATTRS.CODE]
    if (
        code &&
        WA_RETRYABLE_ACK_CODES.includes(code as (typeof WA_RETRYABLE_ACK_CODES)[number])
    ) {
        return true
    }
    const ackType = node.attrs[WA_MESSAGE_ACK_ATTRS.TYPE]
    if (ackType && (ackType === 'wait' || ackType === 'retry' || ackType === 'timeout')) {
        return true
    }
    return false
}

export function describeAckNode(node: BinaryNode): string {
    const parts = [`tag=${node.tag}`]
    const id = node.attrs.id
    const type = node.attrs[WA_MESSAGE_ACK_ATTRS.TYPE]
    const ackClass = node.attrs[WA_MESSAGE_ACK_ATTRS.CLASS]
    const code = node.attrs[WA_MESSAGE_ACK_ATTRS.CODE]
    if (id) {
        parts.push(`id=${id}`)
    }
    if (type) {
        parts.push(`type=${type}`)
    }
    if (ackClass) {
        parts.push(`class=${ackClass}`)
    }
    if (code) {
        parts.push(`code=${code}`)
    }
    return parts.join(' ')
}
