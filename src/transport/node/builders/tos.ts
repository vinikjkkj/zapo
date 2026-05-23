import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_IQ_TYPES, WA_XMLNS } from '@protocol/nodes'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

function noticeNodes(noticeIds: readonly string[]): BinaryNode[] {
    return noticeIds.map((id) => ({
        tag: 'notice',
        attrs: { id }
    }))
}

export function buildTosQueryIq(noticeIds: readonly string[]): BinaryNode {
    if (noticeIds.length === 0) {
        throw new Error('tos query requires at least one notice id')
    }
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.TOS, [
        {
            tag: 'request',
            attrs: {},
            content: noticeNodes(noticeIds)
        }
    ])
}

export function buildTosUpdateIq(noticeIds: readonly string[]): BinaryNode {
    if (noticeIds.length === 0) {
        throw new Error('tos update requires at least one notice id')
    }
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.TOS, [
        {
            tag: 'request',
            attrs: { type: 'session_update' },
            content: noticeNodes(noticeIds)
        }
    ])
}

export interface WaTosNoticeState {
    readonly id: string
    readonly accepted: boolean
}

export interface WaTosQueryResult {
    readonly refreshSeconds: number
    readonly notices: readonly WaTosNoticeState[]
}

export function parseTosQueryResponse(node: BinaryNode): WaTosQueryResult {
    const tosNode = Array.isArray(node.content)
        ? node.content.find((child) => child.tag === 'tos')
        : undefined
    if (!tosNode) {
        throw new Error('tos response missing <tos> node')
    }
    const refreshSeconds = parseOptionalInt(tosNode.attrs.refresh) ?? 0
    const notices: WaTosNoticeState[] = []
    if (Array.isArray(tosNode.content)) {
        for (const child of tosNode.content) {
            if (child.tag !== 'notice') continue
            const id = child.attrs.id
            if (!id) continue
            notices.push({
                id,
                accepted: child.attrs.state !== 'false'
            })
        }
    }
    return { refreshSeconds, notices }
}
