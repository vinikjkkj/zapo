import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_NODE_TAGS, WA_XMLNS } from '@protocol/nodes'
import { WA_PRIVACY_TAGS, type WaPrivacyCategory, type WaPrivacyValue } from '@protocol/privacy'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export function buildGetPrivacySettingsIq(): BinaryNode {
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
        { tag: WA_NODE_TAGS.PRIVACY, attrs: {} }
    ])
}

export function buildSetPrivacyCategoryIq(
    category: WaPrivacyCategory,
    value: WaPrivacyValue
): BinaryNode {
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
        {
            tag: WA_NODE_TAGS.PRIVACY,
            attrs: {},
            content: [
                {
                    tag: WA_PRIVACY_TAGS.CATEGORY,
                    attrs: { name: category, value }
                }
            ]
        }
    ])
}

export function buildGetPrivacyDisallowedListIq(category: WaPrivacyCategory): BinaryNode {
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
        {
            tag: WA_NODE_TAGS.PRIVACY,
            attrs: {},
            content: [
                {
                    tag: WA_PRIVACY_TAGS.LIST,
                    attrs: { name: category, value: 'contact_blacklist' }
                }
            ]
        }
    ])
}

export function buildGetBlocklistIq(): BinaryNode {
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BLOCKLIST)
}

export function buildBlocklistChangeIq(jid: string, action: 'block' | 'unblock'): BinaryNode {
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BLOCKLIST, [
        {
            tag: 'item',
            attrs: { jid, action }
        }
    ])
}
