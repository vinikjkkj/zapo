import type {
    WaPrivacyCategory,
    WaPrivacyDisallowedListSettingName,
    WaPrivacySettingName,
    WaPrivacySettingValueMap,
    WaPrivacyValue
} from '@protocol/privacy'
import {
    WA_PRIVACY_CATEGORY_TO_SETTING,
    WA_PRIVACY_SETTING_TO_CATEGORY,
    WA_PRIVACY_TAGS,
    WA_PRIVACY_VALUES
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

export interface WaPrivacyCoordinator {
    readonly getPrivacySettings: () => Promise<WaPrivacySettings>
    readonly setPrivacySetting: <S extends WaPrivacySettingName>(
        setting: S,
        value: WaPrivacySettingValueMap[S]
    ) => Promise<void>
    readonly getDisallowedList: (
        category: WaPrivacyDisallowedListSettingName
    ) => Promise<WaPrivacyDisallowedListResult>
    readonly getBlocklist: () => Promise<WaBlocklistResult>
    readonly blockUser: (jid: string) => Promise<void>
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

function isValidPrivacyValue(value: string): value is WaPrivacyValue {
    return (
        value !== WA_PRIVACY_VALUES.ERROR &&
        Object.values(WA_PRIVACY_VALUES).includes(value as WaPrivacyValue)
    )
}

function parsePrivacySettings(result: BinaryNode): WaPrivacySettings {
    const privacyNode = findNodeChild(result, 'privacy')
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
    const privacyNode = findNodeChild(result, 'privacy')
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
    const listNode = findNodeChild(result, 'list')
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
