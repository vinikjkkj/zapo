import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_ADDRESSING_MODES } from '@protocol/message'
import { WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/nodes'
import {
    WA_PRIVACY_DHASH_NONE,
    WA_PRIVACY_TAGS,
    WA_PRIVACY_VALUES,
    type WaPrivacyCategory,
    type WaPrivacyListAction,
    type WaPrivacyValue
} from '@protocol/privacy'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

/**
 * `<privacy>` attrs for a disallowed-list stanza. LID-migrated accounts must
 * carry `addressing_mode="lid"`; the server answers `400: bad-request`
 * without it, whatever the category's current value is.
 */
function buildPrivacyEnvelopeAttrs(lidAddressing: boolean): Record<string, string> {
    return lidAddressing ? { addressing_mode: WA_ADDRESSING_MODES.LID } : {}
}

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

/**
 * Builds the disallowed-list `get` IQ. Pass `lidAddressing` for LID-migrated
 * accounts - see {@link buildPrivacyEnvelopeAttrs}.
 */
export function buildGetPrivacyDisallowedListIq(
    category: WaPrivacyCategory,
    lidAddressing: boolean
): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
        {
            tag: WA_NODE_TAGS.PRIVACY,
            attrs: buildPrivacyEnvelopeAttrs(lidAddressing),
            content: [
                {
                    tag: WA_PRIVACY_TAGS.LIST,
                    attrs: { name: category, value: WA_PRIVACY_VALUES.CONTACT_BLACKLIST }
                }
            ]
        }
    ])
}

/**
 * One `<user>` entry of a disallowed-list mutation, already resolved into both
 * addressing forms. Under LID addressing the server keys the entry by
 * `lidJid` and takes `pnJid` as the identifier hint; otherwise the phone jid
 * addresses it alone.
 */
export interface WaPrivacyDisallowedListEntry {
    readonly action: WaPrivacyListAction
    readonly lidJid: string | null
    readonly pnJid: string | null
}

/**
 * Builds the disallowed-list `set` IQ. The category value and the list
 * entries travel in the same stanza - the deny-list is not a separate
 * endpoint - and `dhash` is the version stamp the server handed out on the
 * last write/read (`'none'` when the client holds none). A stale stamp is
 * rejected with `409`, which the caller resolves by refetching the list and
 * retrying.
 */
export function buildSetPrivacyDisallowedListIq(
    category: WaPrivacyCategory,
    entries: readonly WaPrivacyDisallowedListEntry[],
    dhash: string | null,
    lidAddressing: boolean
): BinaryNode {
    const users = new Array<BinaryNode>(entries.length)
    for (let i = 0; i < entries.length; i += 1) {
        users[i] = {
            tag: WA_PRIVACY_TAGS.USER,
            attrs: buildDisallowedListUserAttrs(entries[i], lidAddressing)
        }
    }
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
        {
            tag: WA_NODE_TAGS.PRIVACY,
            attrs: buildPrivacyEnvelopeAttrs(lidAddressing),
            content: [
                {
                    tag: WA_PRIVACY_TAGS.CATEGORY,
                    attrs: {
                        name: category,
                        value: WA_PRIVACY_VALUES.CONTACT_BLACKLIST,
                        dhash: dhash ?? WA_PRIVACY_DHASH_NONE
                    },
                    content: users
                }
            ]
        }
    ])
}

function buildDisallowedListUserAttrs(
    entry: WaPrivacyDisallowedListEntry,
    lidAddressing: boolean
): Record<string, string> {
    if (lidAddressing && entry.lidJid !== null) {
        return entry.pnJid !== null
            ? { action: entry.action, jid: entry.lidJid, pn_jid: entry.pnJid }
            : { action: entry.action, jid: entry.lidJid }
    }
    const jid = entry.pnJid ?? entry.lidJid
    if (jid === null) {
        throw new Error('privacy disallowed-list entry has no addressable jid')
    }
    return { action: entry.action, jid }
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
