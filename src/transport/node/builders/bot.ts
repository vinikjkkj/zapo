import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/nodes'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

const BOT_LIST_VERSION = '2'

export function buildBotListIq(version: string = BOT_LIST_VERSION): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BOT, [
        {
            tag: WA_NODE_TAGS.BOT,
            attrs: { v: version }
        }
    ])
}
