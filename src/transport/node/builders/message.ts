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
    readonly edit?: string
    readonly participants: readonly EncryptedParticipant[]
    readonly deviceIdentity?: Uint8Array
    readonly reportingNode?: BinaryNode
    readonly privacyTokenNode?: BinaryNode
    readonly metaNode?: BinaryNode
    readonly mediatype?: string
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
    readonly mediatype?: string
}

function buildEncAttrs(
    encType: string,
    mediatype?: string,
    retryCount?: number
): Record<string, string> {
    const attrs: Record<string, string> = {
        v: WA_MESSAGE_TYPES.ENC_VERSION,
        type: encType
    }
    if (mediatype) {
        attrs.mediatype = mediatype
    }
    if (retryCount !== undefined && retryCount > 0) {
        attrs.count = String(Math.trunc(retryCount))
    }
    return attrs
}

function buildMessageAttrs(input: {
    readonly to: string
    readonly type: string
    readonly id?: string
    readonly edit?: string
    readonly phash?: string
    readonly addressingMode?: string
}): Record<string, string> {
    const attrs: Record<string, string> = {
        to: input.to,
        type: input.type
    }
    if (input.id) {
        attrs.id = input.id
    }
    if (input.edit) {
        attrs.edit = input.edit
    }
    if (input.phash) {
        attrs.phash = input.phash
    }
    if (input.addressingMode) {
        attrs.addressing_mode = input.addressingMode
    }
    return attrs
}

function pushOptionalNodes(
    content: BinaryNode[],
    input: {
        readonly deviceIdentity?: Uint8Array
        readonly reportingNode?: BinaryNode
        readonly privacyTokenNode?: BinaryNode
        readonly metaNode?: BinaryNode
    }
): void {
    if (input.deviceIdentity) {
        content.push({
            tag: WA_NODE_TAGS.DEVICE_IDENTITY,
            attrs: {},
            content: input.deviceIdentity
        })
    }
    if (input.metaNode) {
        content.push(input.metaNode)
    }
    if (input.reportingNode) {
        content.push(input.reportingNode)
    }
    if (input.privacyTokenNode) {
        content.push(input.privacyTokenNode)
    }
}

export function buildDirectMessageFanoutNode(input: GroupMessageFanoutInput): BinaryNode {
    if (input.participants.length === 0) {
        throw new Error('direct message fanout requires at least one participant')
    }

    const attrs = buildMessageAttrs(input)
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
                        attrs: buildEncAttrs(participant.encType, input.mediatype),
                        content: participant.ciphertext
                    }
                ]
            }))
        }
    ]
    pushOptionalNodes(content, input)

    return {
        tag: WA_MESSAGE_TAGS.MESSAGE,
        attrs,
        content
    }
}

export function buildGroupSenderKeyMessageNode(input: GroupSenderKeyMessageInput): BinaryNode {
    const attrs = buildMessageAttrs(input)
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
                        attrs: buildEncAttrs(participant.encType, input.mediatype),
                        content: participant.ciphertext
                    }
                ]
            }))
        })
    }
    content.push({
        tag: WA_MESSAGE_TAGS.ENC,
        attrs: buildEncAttrs('skmsg', input.mediatype),
        content: input.groupCiphertext
    })
    pushOptionalNodes(content, input)

    return {
        tag: WA_MESSAGE_TAGS.MESSAGE,
        attrs,
        content
    }
}

export function buildGroupRetryMessageNode(input: GroupRetryMessageInput): BinaryNode {
    const content: BinaryNode[] = [
        {
            tag: WA_MESSAGE_TAGS.ENC,
            attrs: buildEncAttrs(input.encType, input.mediatype, input.retryCount),
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

export function buildMetaNode(attrs: Record<string, string>): BinaryNode {
    return {
        tag: 'meta',
        attrs,
        content: undefined
    }
}
