import {
    WA_DEFAULTS,
    WA_IQ_TYPES,
    WA_NODE_TAGS,
    WA_USYNC_CONTEXTS,
    WA_USYNC_DEFAULTS,
    WA_USYNC_MODES,
    WA_XMLNS
} from '@protocol/constants'
import { findNodeChild, getNodeChildrenByTag } from '@transport/node/helpers'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

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

export function iterateUsyncUsers(result: BinaryNode): readonly BinaryNode[] | null {
    const usyncNode = findNodeChild(result, WA_NODE_TAGS.USYNC)
    if (!usyncNode) return null
    const listNode = findNodeChild(usyncNode, WA_NODE_TAGS.LIST)
    if (!listNode) return null
    return getNodeChildrenByTag(listNode, WA_NODE_TAGS.USER)
}

export interface WaUsyncProtocolError {
    readonly code: number | null
    readonly text: string | null
    readonly backoffSeconds: number | null
}

export interface WaUsyncResultEnvelope {
    readonly errors: Readonly<Record<string, WaUsyncProtocolError>>
    readonly refresh: Readonly<Record<string, number>>
}

const EMPTY_USYNC_RESULT_ENVELOPE: WaUsyncResultEnvelope = Object.freeze({
    errors: Object.freeze({}),
    refresh: Object.freeze({})
})

/**
 * Walks a `usync` IQ result and extracts per-protocol error envelopes plus
 * `refresh` hints. Returns an empty envelope when the result has no `usync`
 * payload.
 */
export function parseUsyncResultEnvelope(result: BinaryNode): WaUsyncResultEnvelope {
    const usyncNode = findNodeChild(result, WA_NODE_TAGS.USYNC)
    if (!usyncNode) return EMPTY_USYNC_RESULT_ENVELOPE
    const resultNode = findNodeChild(usyncNode, 'result')
    if (!resultNode) return EMPTY_USYNC_RESULT_ENVELOPE
    if (!Array.isArray(resultNode.content)) return EMPTY_USYNC_RESULT_ENVELOPE

    const errors: Record<string, WaUsyncProtocolError> = {}
    const refresh: Record<string, number> = {}

    for (let i = 0; i < resultNode.content.length; i += 1) {
        const protoNode = resultNode.content[i]
        const errorNode = findNodeChild(protoNode, WA_NODE_TAGS.ERROR)
        if (errorNode) {
            errors[protoNode.tag] = {
                code: parseOptionalInt(errorNode.attrs.code) ?? null,
                text: errorNode.attrs.text ?? null,
                backoffSeconds: parseOptionalInt(errorNode.attrs.backoff) ?? null
            }
            continue
        }
        const refreshSeconds = parseOptionalInt(protoNode.attrs.refresh)
        if (refreshSeconds !== undefined) {
            refresh[protoNode.tag] = refreshSeconds
        }
    }

    return { errors, refresh }
}

export function buildUsyncIq(input: BuildUsyncIqInput): BinaryNode {
    if (input.queryProtocolNodes.length === 0) {
        throw new Error('usync query must include at least one protocol node')
    }
    const users = new Array<BinaryNode>(input.users.length)
    for (let index = 0; index < input.users.length; index += 1) {
        users[index] = buildUsyncUserNode(input.users[index])
    }

    return buildIqNode(
        WA_IQ_TYPES.GET,
        input.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN,
        WA_XMLNS.USYNC,
        [
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
                        content: input.queryProtocolNodes
                    },
                    {
                        tag: WA_NODE_TAGS.LIST,
                        attrs: {},
                        content: users
                    }
                ]
            }
        ]
    )
}
