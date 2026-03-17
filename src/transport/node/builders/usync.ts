import {
    WA_DEFAULTS,
    WA_NODE_TAGS,
    WA_USYNC_CONTEXTS,
    WA_USYNC_DEFAULTS,
    WA_USYNC_MODES,
    WA_XMLNS
} from '@protocol/constants'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export type WaUsyncMode = (typeof WA_USYNC_MODES)[keyof typeof WA_USYNC_MODES]
export type WaUsyncContext = (typeof WA_USYNC_CONTEXTS)[keyof typeof WA_USYNC_CONTEXTS]

export interface BuildUsyncUserNodeInput {
    readonly jid: string
    readonly attrs?: Readonly<Record<string, string>>
    readonly content?: BinaryNode['content']
}

export interface BuildUsyncIqInput {
    readonly sid: string
    readonly queryProtocolNodes: readonly BinaryNode[]
    readonly users: readonly BuildUsyncUserNodeInput[]
    readonly mode?: WaUsyncMode
    readonly context?: WaUsyncContext
    readonly index?: string
    readonly last?: string
    readonly hostDomain?: string
}

export function buildUsyncUserNode(input: BuildUsyncUserNodeInput): BinaryNode {
    return {
        tag: WA_NODE_TAGS.USER,
        attrs: {
            ...input.attrs,
            jid: input.jid
        },
        ...(input.content !== undefined ? { content: input.content } : {})
    }
}

export function buildUsyncIq(input: BuildUsyncIqInput): BinaryNode {
    if (input.queryProtocolNodes.length === 0) {
        throw new Error('usync query must include at least one protocol node')
    }

    return buildIqNode('get', input.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.USYNC, [
        {
            tag: WA_NODE_TAGS.USYNC,
            attrs: {
                sid: input.sid,
                index: input.index ?? WA_USYNC_DEFAULTS.INDEX,
                last: input.last ?? WA_USYNC_DEFAULTS.LAST,
                mode: input.mode ?? WA_USYNC_MODES.QUERY,
                context: input.context ?? WA_USYNC_CONTEXTS.INTERACTIVE
            },
            content: [
                {
                    tag: WA_NODE_TAGS.QUERY,
                    attrs: {},
                    content: [...input.queryProtocolNodes]
                },
                {
                    tag: WA_NODE_TAGS.LIST,
                    attrs: {},
                    content: input.users.map((user) => buildUsyncUserNode(user))
                }
            ]
        }
    ])
}
