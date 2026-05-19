import type { WaMediaConn, WaMediaConnHost } from '@media/types'
import { WA_NODE_TAGS } from '@protocol/constants'
import { findNodeChild, getNodeChildrenByTag } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export function parseMediaConnResponse(node: BinaryNode, nowMs: number): WaMediaConn {
    assertIqResult(node, 'media_conn')

    const mediaConnNode = findNodeChild(node, WA_NODE_TAGS.MEDIA_CONN)
    if (!mediaConnNode) {
        throw new Error('media_conn response is missing media_conn node')
    }

    const auth = mediaConnNode.attrs.auth
    if (!auth) {
        throw new Error('media_conn response is missing auth')
    }
    const ttlRaw = Number.parseInt(mediaConnNode.attrs.ttl ?? '0', 10)
    if (!Number.isFinite(ttlRaw) || ttlRaw <= 0) {
        throw new Error('media_conn response has invalid ttl')
    }

    const expiresAtMs = ttlRaw >= 1_000_000_000 ? ttlRaw * 1000 : nowMs + ttlRaw * 1000
    const hosts: WaMediaConnHost[] = []
    for (const host of getNodeChildrenByTag(mediaConnNode, WA_NODE_TAGS.HOST)) {
        const hostname = host.attrs.hostname
        if (hostname) {
            hosts.push({
                hostname,
                isFallback: host.attrs.type === 'fallback'
            })
        }
    }
    if (hosts.length === 0) {
        throw new Error('media_conn response contains no hosts')
    }

    return {
        auth,
        expiresAtMs,
        hosts
    }
}
