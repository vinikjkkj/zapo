import type { WaButtonAddonKind } from '@message/encode/content'
import { WA_MESSAGE_TAGS, WA_MESSAGE_TYPES, WA_NODE_TAGS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

interface EncryptedParticipant {
    readonly jid: string
    readonly encType?: 'msg' | 'pkmsg'
    readonly ciphertext?: Uint8Array
}

type DirectMessageFanoutInput = {
    readonly to: string
    readonly type: string
    readonly id?: string
    readonly edit?: string
    readonly participants: readonly EncryptedParticipant[]
    readonly deviceIdentity?: Uint8Array
    readonly customNodes?: readonly BinaryNode[]
    readonly mediatype?: string
    readonly decryptFail?: string
    // 1:1 only: PN counterpart stamped as `peer_recipient_pn` when `to` is a LID.
    readonly peerRecipientPn?: string
    readonly additionalAttributes?: Readonly<Record<string, string>>
}

type GroupMessageFanoutInput = DirectMessageFanoutInput & {
    readonly phash?: string
    readonly addressingMode?: 'pn' | 'lid'
    // `<bot>` sidecar for group bot mentions; direct 1:1 routes the bot
    // device through `<participants>` instead.
    readonly botParticipants?: readonly EncryptedParticipant[]
}

type GroupSenderKeyMessageInput = GroupMessageFanoutInput & {
    readonly groupCiphertext: Uint8Array
}

type GroupRetryMessageInput = {
    readonly to: string
    readonly type: string
    readonly id: string
    readonly requesterJid: string
    // omit `addressing_mode` for status@broadcast retries.
    readonly addressingMode?: 'pn' | 'lid'
    readonly encType: 'msg' | 'pkmsg'
    readonly ciphertext: Uint8Array
    readonly retryCount: number
    readonly deviceIdentity?: Uint8Array
    readonly mediatype?: string
    readonly decryptFail?: string
    readonly metaNode?: BinaryNode
}

function buildEncAttrs(
    encType: string,
    mediatype?: string,
    retryCount?: number,
    decryptFail?: string
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
    if (decryptFail) {
        attrs['decrypt-fail'] = decryptFail
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
    readonly peerRecipientPn?: string
    readonly additionalAttributes?: Readonly<Record<string, string>>
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
    if (input.peerRecipientPn) {
        attrs.peer_recipient_pn = input.peerRecipientPn
    }
    if (input.additionalAttributes) {
        Object.assign(attrs, input.additionalAttributes)
    }
    return attrs
}

function buildEncryptedToNode(
    p: EncryptedParticipant,
    mediatype?: string,
    decryptFail?: string
): BinaryNode {
    // Status broadcast viewers without an encrypted payload get a bare `<to jid>`.
    if (!p.encType && !p.ciphertext) {
        return { tag: 'to', attrs: { jid: p.jid } }
    }
    if (!p.encType || !p.ciphertext) {
        throw new Error(`invalid encrypted participant payload for ${p.jid}`)
    }
    return {
        tag: 'to',
        attrs: { jid: p.jid },
        content: [
            {
                tag: WA_MESSAGE_TAGS.ENC,
                attrs: buildEncAttrs(p.encType, mediatype, undefined, decryptFail),
                content: p.ciphertext
            }
        ]
    }
}

function pushOptionalNodes(
    content: BinaryNode[],
    input: {
        readonly deviceIdentity?: Uint8Array
        readonly customNodes?: readonly BinaryNode[]
        readonly botParticipants?: readonly EncryptedParticipant[]
        readonly mediatype?: string
    }
): void {
    if (input.deviceIdentity) {
        content.push({
            tag: WA_NODE_TAGS.DEVICE_IDENTITY,
            attrs: {},
            content: input.deviceIdentity
        })
    }
    if (input.customNodes) {
        for (const node of input.customNodes) {
            content.push(node)
        }
    }
    if (input.botParticipants && input.botParticipants.length > 0) {
        content.push({
            tag: WA_NODE_TAGS.BOT,
            attrs: {},
            content: input.botParticipants.map((p) => buildEncryptedToNode(p, input.mediatype))
        })
    }
}

export function buildButtonAddonNode(kind: WaButtonAddonKind): BinaryNode {
    const inner: BinaryNode =
        kind === 'list'
            ? {
                  tag: WA_NODE_TAGS.LIST,
                  attrs: { type: 'product_list', v: '2' },
                  content: undefined
              }
            : {
                  tag: WA_NODE_TAGS.INTERACTIVE,
                  attrs: { type: WA_NODE_TAGS.NATIVE_FLOW, v: '1' },
                  content: [
                      {
                          tag: WA_NODE_TAGS.NATIVE_FLOW,
                          attrs: { v: '9', name: 'mixed' },
                          content: undefined
                      }
                  ]
              }
    return {
        tag: WA_NODE_TAGS.BIZ,
        attrs: {},
        content: [inner]
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
            content: input.participants.map((p) =>
                buildEncryptedToNode(p, input.mediatype, input.decryptFail)
            )
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
            content: input.participants.map((p) =>
                buildEncryptedToNode(p, input.mediatype, input.decryptFail)
            )
        })
    }
    content.push({
        tag: WA_MESSAGE_TAGS.ENC,
        attrs: buildEncAttrs('skmsg', input.mediatype, undefined, input.decryptFail),
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
    const content: BinaryNode[] = []
    if (input.metaNode) {
        content.push(input.metaNode)
    }
    content.push({
        tag: WA_MESSAGE_TAGS.ENC,
        attrs: buildEncAttrs(input.encType, input.mediatype, input.retryCount, input.decryptFail),
        content: input.ciphertext
    })
    if (input.deviceIdentity) {
        content.push({
            tag: WA_NODE_TAGS.DEVICE_IDENTITY,
            attrs: {},
            content: input.deviceIdentity
        })
    }

    const attrs: Record<string, string> = {
        to: input.to,
        type: input.type,
        id: input.id,
        participant: input.requesterJid
    }
    if (input.addressingMode) {
        attrs.addressing_mode = input.addressingMode
    }
    return {
        tag: WA_MESSAGE_TAGS.MESSAGE,
        attrs,
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
