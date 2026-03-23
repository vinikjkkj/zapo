import { WA_MESSAGE_TAGS, WA_MESSAGE_TYPES, WA_NODE_TAGS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

interface EncryptedParticipant {
    readonly jid: string
    readonly encType: 'msg' | 'pkmsg'
    readonly ciphertext: Uint8Array
}

type DirectMessageFanoutInput = {
    readonly to: string
    readonly type: string
    readonly id?: string
    readonly participants: readonly EncryptedParticipant[]
    readonly deviceIdentity?: Uint8Array
    readonly reportingNode?: BinaryNode
}

type GroupMessageFanoutInput = DirectMessageFanoutInput & {
    readonly phash?: string
    readonly addressingMode?: 'pn' | 'lid'
}

type GroupSenderKeyMessageInput = GroupMessageFanoutInput & {
    readonly groupCiphertext: Uint8Array
}

type GroupRetryMessageInput = {
    readonly to: string
    readonly type: string
    readonly id: string
    readonly requesterJid: string
    readonly addressingMode: 'pn' | 'lid'
    readonly encType: 'msg' | 'pkmsg'
    readonly ciphertext: Uint8Array
    readonly retryCount: number
    readonly deviceIdentity?: Uint8Array
}

export function buildDirectMessageFanoutNode(input: DirectMessageFanoutInput): BinaryNode {
    if (input.participants.length === 0) {
        throw new Error('direct message fanout requires at least one participant')
    }

    const attrs: Record<string, string> = {
        to: input.to,
        type: input.type
    }
    if (input.id) {
        attrs.id = input.id
    }

    const content: BinaryNode[] = [
        {
            tag: WA_NODE_TAGS.PARTICIPANTS,
            attrs: {},
            content: input.participants.map((participant) => ({
                tag: 'to',
                attrs: {
                    jid: participant.jid
                },
                content: [
                    {
                        tag: WA_MESSAGE_TAGS.ENC,
                        attrs: {
                            v: WA_MESSAGE_TYPES.ENC_VERSION,
                            type: participant.encType
                        },
                        content: participant.ciphertext
                    }
                ]
            }))
        }
    ]
    if (input.deviceIdentity) {
        content.push({
            tag: WA_NODE_TAGS.DEVICE_IDENTITY,
            attrs: {},
            content: input.deviceIdentity
        })
    }
    if (input.reportingNode) {
        content.push(input.reportingNode)
    }

    return {
        tag: WA_MESSAGE_TAGS.MESSAGE,
        attrs,
        content
    }
}

export function buildGroupSenderKeyMessageNode(input: GroupSenderKeyMessageInput): BinaryNode {
    const attrs: Record<string, string> = {
        to: input.to,
        type: input.type
    }
    if (input.id) {
        attrs.id = input.id
    }
    if (input.phash) {
        attrs.phash = input.phash
    }
    if (input.addressingMode) {
        attrs.addressing_mode = input.addressingMode
    }

    const content: BinaryNode[] = []
    if (input.participants.length > 0) {
        content.push({
            tag: WA_NODE_TAGS.PARTICIPANTS,
            attrs: {},
            content: input.participants.map((participant) => ({
                tag: 'to',
                attrs: {
                    jid: participant.jid
                },
                content: [
                    {
                        tag: WA_MESSAGE_TAGS.ENC,
                        attrs: {
                            v: WA_MESSAGE_TYPES.ENC_VERSION,
                            type: participant.encType
                        },
                        content: participant.ciphertext
                    }
                ]
            }))
        })
    }
    content.push({
        tag: WA_MESSAGE_TAGS.ENC,
        attrs: {
            v: WA_MESSAGE_TYPES.ENC_VERSION,
            type: 'skmsg'
        },
        content: input.groupCiphertext
    })
    if (input.deviceIdentity) {
        content.push({
            tag: WA_NODE_TAGS.DEVICE_IDENTITY,
            attrs: {},
            content: input.deviceIdentity
        })
    }
    if (input.reportingNode) {
        content.push(input.reportingNode)
    }

    return {
        tag: WA_MESSAGE_TAGS.MESSAGE,
        attrs,
        content
    }
}

export function buildGroupDirectMessageNode(input: GroupMessageFanoutInput): BinaryNode {
    if (input.participants.length === 0) {
        throw new Error('group direct message requires at least one participant')
    }

    const attrs: Record<string, string> = {
        to: input.to,
        type: input.type
    }
    if (input.id) {
        attrs.id = input.id
    }
    if (input.phash) {
        attrs.phash = input.phash
    }
    if (input.addressingMode) {
        attrs.addressing_mode = input.addressingMode
    }

    const content: BinaryNode[] = [
        {
            tag: WA_NODE_TAGS.PARTICIPANTS,
            attrs: {},
            content: input.participants.map((participant) => ({
                tag: 'to',
                attrs: {
                    jid: participant.jid
                },
                content: [
                    {
                        tag: WA_MESSAGE_TAGS.ENC,
                        attrs: {
                            v: WA_MESSAGE_TYPES.ENC_VERSION,
                            type: participant.encType
                        },
                        content: participant.ciphertext
                    }
                ]
            }))
        }
    ]
    if (input.deviceIdentity) {
        content.push({
            tag: WA_NODE_TAGS.DEVICE_IDENTITY,
            attrs: {},
            content: input.deviceIdentity
        })
    }
    if (input.reportingNode) {
        content.push(input.reportingNode)
    }

    return {
        tag: WA_MESSAGE_TAGS.MESSAGE,
        attrs,
        content
    }
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

export function buildInboundRetryReceiptNode(
    messageNode: BinaryNode,
    id: string,
    to: string,
    meJid?: string | null,
    retryCount = 1
): BinaryNode {
    const attrs: Record<string, string> = {
        id,
        to,
        type: 'retry'
    }
    if (messageNode.attrs.participant) {
        attrs.participant = messageNode.attrs.participant
    }
    if (meJid) {
        attrs.from = meJid
    }
    const normalizedRetryCount = Number.isSafeInteger(retryCount) && retryCount > 0 ? retryCount : 1
    const retryAttrs: Record<string, string> = {
        count: String(normalizedRetryCount),
        id
    }
    const timestamp = messageNode.attrs.t
    if (timestamp) {
        retryAttrs.t = timestamp
        attrs.t = timestamp
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

export function buildGroupRetryMessageNode(input: GroupRetryMessageInput): BinaryNode {
    const encAttrs: Record<string, string> = {
        v: WA_MESSAGE_TYPES.ENC_VERSION,
        type: input.encType
    }
    if (input.retryCount > 0) {
        encAttrs.count = String(Math.trunc(input.retryCount))
    }
    const content: BinaryNode[] = [
        {
            tag: WA_MESSAGE_TAGS.ENC,
            attrs: encAttrs,
            content: input.ciphertext
        }
    ]
    if (input.deviceIdentity) {
        content.push({
            tag: WA_NODE_TAGS.DEVICE_IDENTITY,
            attrs: {},
            content: input.deviceIdentity
        })
    }

    return {
        tag: WA_MESSAGE_TAGS.MESSAGE,
        attrs: {
            to: input.to,
            type: input.type,
            id: input.id,
            participant: input.requesterJid,
            addressing_mode: input.addressingMode
        },
        content
    }
}
