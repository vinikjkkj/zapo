import {
    WA_CALL_CHILD_TAGS,
    WA_CALL_NODE_ATTRS,
    WA_CALL_PAYLOAD_TAGS,
    type WaCallPayloadTag
} from '@protocol/call'
import {
    findNodeChild,
    getFirstNodeChild,
    getNodeChildren,
    hasNodeChild
} from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

export type WaCallType = WaCallPayloadTag | 'unknown'

const KNOWN_CALL_PAYLOAD_TAGS: ReadonlySet<string> = new Set(Object.values(WA_CALL_PAYLOAD_TAGS))

export interface WaCallGroupParticipant {
    readonly jid: string
    readonly userPnJid?: string
    readonly username?: string
    readonly guestName?: string
}

export interface ParsedCall {
    readonly type: WaCallType
    readonly payloadTag?: string
    readonly callId?: string
    readonly callCreatorJid?: string
    readonly senderLidJid?: string
    readonly callerPnJid?: string
    readonly groupJid?: string
    readonly isVideo: boolean
    readonly callerUsername?: string
    readonly callerCountryCode?: string
    readonly callerPushName?: string
    readonly peerPlatform?: string
    readonly peerAppVersion?: string
    readonly timestampSeconds?: number
    readonly endTimestampSeconds?: number
    readonly silenceReason?: string
    readonly groupInfo?: readonly WaCallGroupParticipant[]
}

function parseGroupInfo(node: BinaryNode): readonly WaCallGroupParticipant[] | undefined {
    const children = getNodeChildren(node)
    if (children.length === 0) {
        return undefined
    }
    const out: WaCallGroupParticipant[] = []
    for (let i = 0; i < children.length; i += 1) {
        const child = children[i]
        const jid = child.attrs.jid
        if (!jid) continue
        out.push({
            jid,
            userPnJid: child.attrs[WA_CALL_NODE_ATTRS.USER_PN],
            username: child.attrs[WA_CALL_NODE_ATTRS.USERNAME],
            guestName: child.attrs[WA_CALL_NODE_ATTRS.GUEST_NAME]
        })
    }
    return out.length > 0 ? out : undefined
}

export function parseCallNode(node: BinaryNode): ParsedCall {
    const payload = getFirstNodeChild(node)
    if (!payload) {
        return { type: 'unknown', isVideo: false }
    }
    const payloadTag = payload.tag
    const type: WaCallType = KNOWN_CALL_PAYLOAD_TAGS.has(payloadTag)
        ? (payloadTag as WaCallPayloadTag)
        : 'unknown'

    const groupInfoNode = findNodeChild(payload, WA_CALL_CHILD_TAGS.GROUP_INFO)
    const silenceNode = findNodeChild(payload, WA_CALL_CHILD_TAGS.SILENCE)

    return {
        type,
        payloadTag,
        callId: payload.attrs[WA_CALL_NODE_ATTRS.CALL_ID],
        callCreatorJid: payload.attrs[WA_CALL_NODE_ATTRS.CALL_CREATOR],
        senderLidJid: node.attrs[WA_CALL_NODE_ATTRS.SENDER_LID],
        callerPnJid: payload.attrs[WA_CALL_NODE_ATTRS.CALLER_PN],
        groupJid: payload.attrs[WA_CALL_NODE_ATTRS.GROUP_JID],
        isVideo: hasNodeChild(payload, WA_CALL_CHILD_TAGS.VIDEO),
        callerUsername: payload.attrs[WA_CALL_NODE_ATTRS.USERNAME],
        callerCountryCode: payload.attrs[WA_CALL_NODE_ATTRS.CALLER_COUNTRY_CODE],
        callerPushName: payload.attrs[WA_CALL_NODE_ATTRS.NOTIFY],
        peerPlatform: node.attrs[WA_CALL_NODE_ATTRS.PLATFORM],
        peerAppVersion: node.attrs[WA_CALL_NODE_ATTRS.VERSION],
        timestampSeconds: parseOptionalInt(node.attrs.t),
        endTimestampSeconds: parseOptionalInt(node.attrs.e),
        silenceReason: silenceNode?.attrs[WA_CALL_NODE_ATTRS.REASON],
        groupInfo: groupInfoNode ? parseGroupInfo(groupInfoNode) : undefined
    }
}
