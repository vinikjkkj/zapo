import { WA_BUSINESS_AGENT } from '@protocol/business-agent'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS } from '@protocol/constants'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

/** Builds the native silent-nonce or nonce-exchange IQ. The code is private. */
export function buildBusinessAgentAuthenticationIq(owner: string, code?: string): BinaryNode {
    return buildIqNode(
        WA_IQ_TYPES.GET,
        WA_DEFAULTS.HOST_DOMAIN,
        WA_BUSINESS_AGENT.AUTH_XMLNS,
        code === undefined
            ? undefined
            : [
                  {
                      tag: 'parameters',
                      attrs: {},
                      content: [{ tag: 'code', attrs: {}, content: code }]
                  }
              ],
        {
            from: owner,
            smax_id:
                code === undefined
                    ? WA_BUSINESS_AGENT.REQUEST_NONCE
                    : WA_BUSINESS_AGENT.EXCHANGE_NONCE
        }
    )
}

/** Identifies private SMB authentication nodes before debug observers see them. */
export function isBusinessAuthenticationNode(node: BinaryNode): boolean {
    if (
        node.tag === WA_NODE_TAGS.IQ &&
        node.attrs.xmlns === WA_BUSINESS_AGENT.AUTH_XMLNS &&
        node.attrs.smax_id === WA_BUSINESS_AGENT.EXCHANGE_NONCE
    )
        return true
    if (!Array.isArray(node.content)) return false
    return node.content.some(
        (child) =>
            child.tag === WA_BUSINESS_AGENT.NONCE_TAG ||
            child.tag === 'access_token' ||
            child.tag === 'session_cookies'
    )
}
