import { WA_NODE_TAGS } from '@protocol/nodes'
import {
    WA_PRIVACY_CATEGORY_TO_SETTING,
    WA_PRIVACY_TAGS,
    WA_PRIVACY_VALUES,
    type WaPrivacyCategory,
    type WaPrivacySettingName,
    type WaPrivacySettingValueMap,
    type WaPrivacyValue
} from '@protocol/privacy'
import { findNodeChild, getNodeChildren, getNodeChildrenByTag } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'

/**
 * Snapshot of every privacy category the server reports. Categories the
 * library does not model (or that came back as `error`) are absent instead
 * of being surfaced with a placeholder value.
 */
export type WaPrivacySettings = {
    readonly [K in WaPrivacySettingName]?: WaPrivacySettingValueMap[K]
}

/** Per-category deny-list (the JIDs excluded from a `contact_blacklist` setting). */
export interface WaPrivacyDisallowedListResult {
    readonly jids: readonly string[]
    readonly dhash?: string
}

/** Account-wide blocklist. The server always sends the full list, never a delta. */
export interface WaBlocklistResult {
    readonly jids: readonly string[]
    readonly dhash?: string
}

/**
 * Server categories the library intentionally drops: they are either
 * region/product specific or not part of the modeled privacy surface.
 */
const IGNORED_SERVER_CATEGORIES = new Set([
    'stickers',
    'dependentaccountmessages',
    'cover_photo',
    'dependent_account_calling',
    'groupcreation'
])

const VALID_PRIVACY_VALUES: ReadonlySet<string> = new Set(Object.values(WA_PRIVACY_VALUES))

function isValidPrivacyValue(value: string): value is WaPrivacyValue {
    return value !== WA_PRIVACY_VALUES.ERROR && VALID_PRIVACY_VALUES.has(value)
}

/** Parses the `<privacy>` payload of a privacy `get` IQ result. */
export function parsePrivacySettings(result: BinaryNode): WaPrivacySettings {
    const privacyNode = findNodeChild(result, WA_NODE_TAGS.PRIVACY)
    if (!privacyNode) {
        return {}
    }

    const settings: Record<string, WaPrivacyValue> = {}
    const categories = getNodeChildrenByTag(privacyNode, WA_PRIVACY_TAGS.CATEGORY)

    for (let i = 0; i < categories.length; i += 1) {
        const node = categories[i]
        const name = node.attrs.name as string | undefined
        const value = node.attrs.value as string | undefined

        if (!name || !value) {
            continue
        }
        if (IGNORED_SERVER_CATEGORIES.has(name)) {
            continue
        }
        if (!isValidPrivacyValue(value)) {
            continue
        }

        const settingName = (WA_PRIVACY_CATEGORY_TO_SETTING as Record<string, string | undefined>)[
            name
        ]
        if (settingName) {
            settings[settingName] = value
        }
    }

    return settings
}

/**
 * Reads the `dhash` the server echoes back on a privacy `set` result. It is a
 * millisecond timestamp acting as the version stamp of that category's
 * disallowed list, and is only present while the category sits on
 * `contact_blacklist`.
 */
export function parsePrivacyCategoryDhash(
    result: BinaryNode,
    category: WaPrivacyCategory
): string | null {
    const privacyNode = findNodeChild(result, WA_NODE_TAGS.PRIVACY)
    if (!privacyNode) {
        return null
    }
    const categories = getNodeChildrenByTag(privacyNode, WA_PRIVACY_TAGS.CATEGORY)
    for (let i = 0; i < categories.length; i += 1) {
        const node = categories[i]
        if (node.attrs.name !== category) {
            continue
        }
        return node.attrs.dhash ?? null
    }
    return null
}

/**
 * Parses the `<privacy><list>` payload of a disallowed-list `get` IQ result,
 * returning `null` when the reply carries no `<list>` at all. The server omits
 * it to mean "nothing to update" - either the category is not on
 * `contact_blacklist`, or the `dhash` the client sent still matches - which is
 * different from an empty list, so a caller reacting to changes can skip it.
 */
export function parseDisallowedListUpdate(
    result: BinaryNode
): WaPrivacyDisallowedListResult | null {
    const privacyNode = findNodeChild(result, WA_NODE_TAGS.PRIVACY)
    if (!privacyNode) {
        return null
    }

    const listNode = findNodeChild(privacyNode, WA_PRIVACY_TAGS.LIST)
    if (!listNode) {
        return null
    }

    const dhash = listNode.attrs.dhash as string | undefined
    const userNodes = getNodeChildrenByTag(listNode, WA_PRIVACY_TAGS.USER)
    const jids = new Array<string>(userNodes.length)
    let jidsCount = 0

    for (let i = 0; i < userNodes.length; i += 1) {
        const jid = userNodes[i].attrs.jid as string | undefined
        if (jid) {
            jids[jidsCount] = jid
            jidsCount += 1
        }
    }
    jids.length = jidsCount

    return { jids, dhash }
}

/**
 * Same read as {@link parseDisallowedListUpdate}, flattening the "nothing to
 * update" reply into an empty list for callers that just want the current
 * membership.
 */
export function parseDisallowedList(result: BinaryNode): WaPrivacyDisallowedListResult {
    return parseDisallowedListUpdate(result) ?? { jids: [] }
}

/** Parses the `<list>` payload of a blocklist `get` IQ result. */
export function parseBlocklist(result: BinaryNode): WaBlocklistResult {
    const listNode = findNodeChild(result, WA_NODE_TAGS.LIST)
    if (!listNode) {
        return { jids: [] }
    }

    const dhash = listNode.attrs.dhash as string | undefined
    const itemNodes = getNodeChildren(listNode)
    const jids = new Array<string>(itemNodes.length)
    let jidsCount = 0

    for (let i = 0; i < itemNodes.length; i += 1) {
        const jid = itemNodes[i].attrs.jid as string | undefined
        if (jid) {
            jids[jidsCount] = jid
            jidsCount += 1
        }
    }
    jids.length = jidsCount

    return { jids, dhash }
}
