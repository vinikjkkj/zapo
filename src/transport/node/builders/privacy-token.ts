import { WA_DEFAULTS } from '@protocol/defaults'
import { toUserJid } from '@protocol/jid'
import { WA_XMLNS } from '@protocol/nodes'
import { WA_PRIVACY_TOKEN_TAGS, WA_PRIVACY_TOKEN_TYPES } from '@protocol/privacy-token'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export interface BuildPrivacyTokenIqInput {
    readonly jid: string
    readonly timestampS: number
    readonly type?: string
}

export function buildPrivacyTokenIqNode(input: BuildPrivacyTokenIqInput): BinaryNode {
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
        {
            tag: WA_PRIVACY_TOKEN_TAGS.TOKENS,
            attrs: {},
            content: [
                {
                    tag: WA_PRIVACY_TOKEN_TAGS.TOKEN,
                    attrs: {
                        jid: toUserJid(input.jid),
                        t: String(input.timestampS),
                        type: input.type ?? WA_PRIVACY_TOKEN_TYPES.TRUSTED_CONTACT
                    }
                }
            ]
        }
    ])
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
