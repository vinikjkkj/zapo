import { WA_NODE_TAGS } from '@protocol/nodes'
import { getFirstNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'

export interface IdentityChangeNotification {
    readonly fromJid: string
    readonly stanzaId: string
    readonly displayName: string | undefined
    readonly lid: string | undefined
    readonly offline: string | undefined
}

export function parseIdentityChangeNotification(
    node: BinaryNode
): IdentityChangeNotification | null {
    const child = getFirstNodeChild(node)
    if (!child || child.tag !== WA_NODE_TAGS.IDENTITY) {
        return null
    }
    const fromJid = node.attrs.from
    const stanzaId = node.attrs.id
    if (!fromJid || !stanzaId) {
        return null
    }
    return {
        fromJid,
        stanzaId,
        displayName: node.attrs.display_name,
        lid: node.attrs.lid,
        offline: node.attrs.offline
    }
}
