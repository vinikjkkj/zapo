import { WA_NODE_TAGS } from '@protocol/nodes'
import {
    WA_PRIVACY_CATEGORY_TO_SETTING,
    WA_PRIVACY_SETTING_TO_CATEGORY,
    WA_PRIVACY_TAGS,
    WA_PRIVACY_VALUES,
    type WaPrivacyCategory,
    type WaPrivacyDisallowedListSettingName,
    type WaPrivacySettingName,
    type WaPrivacySettingValueMap,
    type WaPrivacyValue
} from '@protocol/privacy'
import {
    buildBlocklistChangeIq,
    buildGetBlocklistIq,
    buildGetPrivacyDisallowedListIq,
    buildGetPrivacySettingsIq,
    buildSetPrivacyCategoryIq
} from '@transport/node/builders/privacy'
import { findNodeChild, getNodeChildren, getNodeChildrenByTag } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export type WaPrivacySettings = {
    readonly [K in WaPrivacySettingName]?: WaPrivacySettingValueMap[K]
}

export interface WaPrivacyDisallowedListResult {
    readonly jids: readonly string[]
    readonly dhash?: string
}

export interface WaBlocklistResult {
    readonly jids: readonly string[]
    readonly dhash?: string
}

/**
 * Coordinates privacy queries/mutations: per-category settings, blocklist,
 * and the per-category disallowed lists. Accessed via {@link WaClient.privacy}.
 */
export interface WaPrivacyCoordinator {
    /** Fetches the current value of every privacy category. */
    readonly getPrivacySettings: () => Promise<WaPrivacySettings>
    /**
     * Updates a single privacy category to a new {@link WaPrivacyValue}.
     *
     * The `'contact_blacklist'` value (a deny-list of specific contacts on
     * top of `'contacts'`/`'all'`) only flips the **mode** here - you must
     * separately populate the per-category disallowed list with
     * {@link getDisallowedList} + the corresponding app-state mutation, or
     * the deny-list stays empty.
     */
    readonly setPrivacySetting: <S extends WaPrivacySettingName>(
        setting: S,
        value: WaPrivacySettingValueMap[S]
    ) => Promise<void>
    /**
     * Fetches the per-category disallowed list (the JIDs explicitly excluded
     * from `contact_blacklist`/`contact_whitelist` style settings).
     */
    readonly getDisallowedList: (
        category: WaPrivacyDisallowedListSettingName
    ) => Promise<WaPrivacyDisallowedListResult>
    /** Returns the current account-wide blocklist. */
    readonly getBlocklist: () => Promise<WaBlocklistResult>
    /**
     * Blocks `jid` (account-wide blocklist). After this, the peer can no
     * longer message/call you and cannot see your last seen/online/photo/
     * status. The block is symmetric only from the peer's read perspective -
     * they don't get an explicit "you were blocked" notification.
     */
    readonly blockUser: (jid: string) => Promise<void>
    /** Removes `jid` from the blocklist. */
    readonly unblockUser: (jid: string) => Promise<void>
}

interface WaPrivacyCoordinatorOptions {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
}

const IGNORED_SERVER_CATEGORIES = new Set([
    'pix',
    'linked_profiles',
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

function parsePrivacySettings(result: BinaryNode): WaPrivacySettings {
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

    return settings as WaPrivacySettings
}

function parseDisallowedList(result: BinaryNode): WaPrivacyDisallowedListResult {
    const privacyNode = findNodeChild(result, WA_NODE_TAGS.PRIVACY)
    if (!privacyNode) {
        return { jids: [] }
    }

    const listNode = findNodeChild(privacyNode, WA_PRIVACY_TAGS.LIST)
    if (!listNode) {
        return { jids: [] }
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

function parseBlocklist(result: BinaryNode): WaBlocklistResult {
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

/** Builds a {@link WaPrivacyCoordinator} backed by the given IQ query function. */
export function createPrivacyCoordinator(
    options: WaPrivacyCoordinatorOptions
): WaPrivacyCoordinator {
    const { queryWithContext } = options

    return {
        getPrivacySettings: async () => {
            const node = buildGetPrivacySettingsIq()
            const result = await queryWithContext('privacy.getSettings', node)
            assertIqResult(result, 'privacy.getSettings')
            return parsePrivacySettings(result)
        },

        setPrivacySetting: async (setting, value) => {
            const category: WaPrivacyCategory = WA_PRIVACY_SETTING_TO_CATEGORY[setting]
            const node = buildSetPrivacyCategoryIq(category, value)
            const result = await queryWithContext('privacy.setSetting', node, undefined, {
                category,
                value
            })
            assertIqResult(result, 'privacy.setSetting')
        },

        getDisallowedList: async (setting) => {
            const category: WaPrivacyCategory = WA_PRIVACY_SETTING_TO_CATEGORY[setting]
            const node = buildGetPrivacyDisallowedListIq(category)
            const result = await queryWithContext('privacy.getDisallowedList', node, undefined, {
                category
            })
            assertIqResult(result, 'privacy.getDisallowedList')
            return parseDisallowedList(result)
        },

        getBlocklist: async () => {
            const node = buildGetBlocklistIq()
            const result = await queryWithContext('privacy.getBlocklist', node)
            assertIqResult(result, 'privacy.getBlocklist')
            return parseBlocklist(result)
        },

        blockUser: async (jid) => {
            const node = buildBlocklistChangeIq(jid, 'block')
            const result = await queryWithContext('privacy.blockUser', node, undefined, { jid })
            assertIqResult(result, 'privacy.blockUser')
        },

        unblockUser: async (jid) => {
            const node = buildBlocklistChangeIq(jid, 'unblock')
            const result = await queryWithContext('privacy.unblockUser', node, undefined, { jid })
            assertIqResult(result, 'privacy.unblockUser')
        }
    }
}
