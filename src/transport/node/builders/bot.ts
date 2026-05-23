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

export function buildGetBotProfileUsyncQueryNode(): BinaryNode {
    return {
        tag: WA_NODE_TAGS.BOT,
        attrs: {},
        content: [
            {
                tag: 'profile',
                attrs: { v: '1' }
            }
        ]
    }
}

export function buildBotProfileUsyncUserNodeContent(personaId?: string): readonly BinaryNode[] {
    return [
        {
            tag: WA_NODE_TAGS.BOT,
            attrs: {},
            content: [
                {
                    tag: 'profile',
                    attrs: personaId ? { persona_id: personaId } : {}
                }
            ]
        }
    ]
}
