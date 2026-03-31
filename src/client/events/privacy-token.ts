import { WA_PRIVACY_TOKEN_TAGS } from '@protocol/privacy-token'
import { findNodeChild, getNodeChildren } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { asNumber } from '@util/coercion'

export interface ParsedPrivacyToken {
    readonly type: string
    readonly tokenBytes: Uint8Array
    readonly timestampS: number
}

export function parsePrivacyTokenNotification(node: BinaryNode): readonly ParsedPrivacyToken[] {
    const tokensNode = findNodeChild(node, WA_PRIVACY_TOKEN_TAGS.TOKENS)
    if (!tokensNode) {
        return []
    }

    const children = getNodeChildren(tokensNode)
    const result: ParsedPrivacyToken[] = []

    for (let i = 0; i < children.length; i += 1) {
        const child = children[i]
        if (child.tag !== WA_PRIVACY_TOKEN_TAGS.TOKEN) {
            continue
        }
        const type = child.attrs.type
        if (!type) {
            continue
        }
        const rawTimestamp = child.attrs.t
        if (!rawTimestamp) {
            continue
        }
        const content = child.content
        if (!(content instanceof Uint8Array)) {
            continue
        }
        result[result.length] = {
            type,
            tokenBytes: content,
            timestampS: asNumber(Number(rawTimestamp), 'privacy_token.t')
        }
    }

    return result
}
