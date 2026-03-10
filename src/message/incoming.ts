import type { Logger } from '../infra/log/types'
import { WA_MESSAGE_TAGS, WA_MESSAGE_TYPES } from '../protocol/constants'
import type { BinaryNode } from '../transport/types'

interface WaIncomingMessageAckHandlerOptions {
    readonly logger: Logger
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly getMeJid?: () => string | null | undefined
}

export function buildInboundMessageAckNode(
    messageNode: BinaryNode,
    id: string,
    to: string,
    meJid: string | null | undefined
): BinaryNode {
    const attrs: Record<string, string> = {
        id,
        to,
        class: WA_MESSAGE_TYPES.ACK_CLASS_MESSAGE
    }
    if (messageNode.attrs.type) {
        attrs.type = messageNode.attrs.type
    }
    if (messageNode.attrs.participant) {
        attrs.participant = messageNode.attrs.participant
    }
    if (meJid) {
        attrs.from = meJid
    }
    return {
        tag: WA_MESSAGE_TAGS.ACK,
        attrs
    }
}

export function buildInboundDeliveryReceiptNode(
    messageNode: BinaryNode,
    id: string,
    to: string
): BinaryNode {
    const attrs: Record<string, string> = {
        id,
        to
    }
    if (messageNode.attrs.participant) {
        attrs.participant = messageNode.attrs.participant
    }
    if (messageNode.attrs.category === 'peer') {
        attrs.type = WA_MESSAGE_TYPES.RECEIPT_TYPE_PEER
    }
    return {
        tag: WA_MESSAGE_TAGS.RECEIPT,
        attrs
    }
}

export async function handleIncomingMessageAck(
    node: BinaryNode,
    options: WaIncomingMessageAckHandlerOptions
): Promise<boolean> {
    if (node.tag !== WA_MESSAGE_TAGS.MESSAGE) {
        return false
    }

    const id = node.attrs.id
    const from = node.attrs.from
    if (!id || !from) {
        options.logger.warn('incoming message missing required attrs for ack/receipt', {
            hasId: Boolean(id),
            hasFrom: Boolean(from),
            type: node.attrs.type
        })
        return false
    }

    if (node.attrs.type === WA_MESSAGE_TYPES.MEDIA_NOTIFY) {
        const ackNode = buildInboundMessageAckNode(node, id, from, options.getMeJid?.())
        options.logger.debug('sending inbound message ack', {
            id,
            to: from,
            type: ackNode.attrs.type,
            participant: ackNode.attrs.participant
        })
        await options.sendNode(ackNode)
        return true
    }

    const receiptNode = buildInboundDeliveryReceiptNode(node, id, from)
    options.logger.debug('sending inbound message receipt', {
        id,
        to: from,
        type: receiptNode.attrs.type,
        participant: receiptNode.attrs.participant
    })
    await options.sendNode(receiptNode)
    return true
}
