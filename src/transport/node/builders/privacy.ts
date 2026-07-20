import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/nodes'
import { WA_PRIVACY_TAGS, type WaPrivacyCategory, type WaPrivacyValue } from '@protocol/privacy'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export function buildGetPrivacySettingsIq(): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
        { tag: WA_NODE_TAGS.PRIVACY, attrs: {} }
    ])
}

export function buildSetPrivacyCategoryIq(
    category: WaPrivacyCategory,
    value: WaPrivacyValue
): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
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
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
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
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BLOCKLIST)
}

/**
 * Blocklist target in both addressing forms. At least one side is always
 * present: LID-migrated accounts carry `lidJid` (plus `pnJid` when known),
 * non-migrated accounts carry only `pnJid`.
 */
export type WaBlocklistTarget =
    | { readonly lidJid: string; readonly pnJid: string | null }
    | { readonly lidJid: null; readonly pnJid: string }

/**
 * Builds the blocklist `set` IQ for a block action. LID-migrated targets are
 * addressed by the LID jid plus an identifier attribute: `pn_jid` when the
 * phone jid is known, else `unknown_identifier="true"`. Non-migrated targets
 * are addressed by the phone jid alone. The server rejects a block that
 * addresses a migrated account by phone jid or omits the identifier
 * (`400: bad-request`).
 */
export function buildBlocklistBlockIq(target: WaBlocklistTarget): BinaryNode {
    let attrs: Record<string, string>
    if (target.lidJid !== null) {
        attrs =
            target.pnJid !== null
                ? { action: 'block', jid: target.lidJid, pn_jid: target.pnJid }
                : { action: 'block', jid: target.lidJid, unknown_identifier: 'true' }
    } else {
        attrs = { action: 'block', jid: target.pnJid }
    }
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BLOCKLIST, [
        {
            tag: 'item',
            attrs
        }
    ])
}

/**
 * Builds the blocklist `set` IQ for an unblock action. The server keys
 * migrated entries by LID, so `jid` must be the LID jid when one exists.
 */
export function buildBlocklistUnblockIq(jid: string): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BLOCKLIST, [
        {
            tag: 'item',
            attrs: { jid, action: 'unblock' }
        }
    ])
}
