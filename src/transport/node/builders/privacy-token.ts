import { WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/nodes'
import { WA_PRIVACY_TOKEN_TAGS, WA_PRIVACY_TOKEN_TYPES } from '@protocol/privacy-token'
import type { BinaryNode } from '@transport/types'

export interface BuildPrivacyTokenIqInput {
    readonly jid: string
    readonly timestampS: number
    readonly type?: string
}

export function buildPrivacyTokenIqNode(input: BuildPrivacyTokenIqInput): BinaryNode {
    return {
        tag: WA_NODE_TAGS.IQ,
        attrs: {
            type: WA_IQ_TYPES.SET,
            xmlns: WA_XMLNS.PRIVACY
        },
        content: [
            {
                tag: WA_PRIVACY_TOKEN_TAGS.TOKENS,
                attrs: {},
                content: [
                    {
                        tag: WA_PRIVACY_TOKEN_TAGS.TOKEN,
                        attrs: {
                            jid: input.jid,
                            t: String(input.timestampS),
                            type: input.type ?? WA_PRIVACY_TOKEN_TYPES.TRUSTED_CONTACT
                        }
                    }
                ]
            }
        ]
    }
}

export function buildTcTokenMessageNode(token: Uint8Array): BinaryNode {
    return {
        tag: WA_PRIVACY_TOKEN_TAGS.TC_TOKEN,
        attrs: {},
        content: token
    }
}

export function buildCsTokenMessageNode(hash: Uint8Array): BinaryNode {
    return {
        tag: WA_PRIVACY_TOKEN_TAGS.CS_TOKEN,
        attrs: {},
        content: hash
    }
}
