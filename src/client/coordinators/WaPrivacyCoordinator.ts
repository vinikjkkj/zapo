import type { Logger } from '@infra/log/types'
import { isLidJid, isUserJid, normalizeRecipientJid } from '@protocol/jid'
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
import type { SignalLidSyncResult } from '@signal/api/SignalDeviceSyncApi'
import type { WaDeviceListStore } from '@store/contracts/device-list.store'
import {
    buildBlocklistBlockIq,
    buildBlocklistUnblockIq,
    buildGetBlocklistIq,
    buildGetPrivacyDisallowedListIq,
    buildGetPrivacySettingsIq,
    buildSetPrivacyCategoryIq,
    type WaBlocklistTarget
} from '@transport/node/builders/privacy'
import { findNodeChild, getNodeChildren, getNodeChildrenByTag } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

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
     * Blocks a user (account-wide blocklist). Accepts a phone-number jid, a
     * LID jid, or a bare phone number. After this, the peer can no longer
     * message/call you and cannot see your last seen/online/photo/status. The
     * block is symmetric only from the peer's read perspective - they don't
     * get an explicit "you were blocked" notification.
     *
     * The server keys blocklist entries by LID for migrated accounts, so a
     * phone-number input is resolved to its LID first (device-list cache,
     * then a usync query). Non-migrated accounts fall back to the plain
     * phone-jid form.
     */
    readonly blockUser: (jid: string) => Promise<void>
    /**
     * Removes a user from the blocklist. Accepts the same inputs as
     * {@link blockUser} and performs the same LID resolution - unblocking a
     * migrated entry by phone jid is rejected by the server.
     */
    readonly unblockUser: (jid: string) => Promise<void>
}

interface WaPrivacyCoordinatorOptions {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly deviceListStore: Pick<WaDeviceListStore, 'findByAnyUserJid'>
    readonly queryLidsByPhoneJids: (
        phoneJids: readonly string[]
    ) => Promise<readonly SignalLidSyncResult[]>
    readonly logger: Logger
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

    return settings
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

/**
 * Resolves a blocklist input into both addressing forms. Phone-jid inputs get
 * their LID resolved cache-first (device-list store) with a one-shot usync
 * fallback; LID inputs get their phone jid from the cache when known.
 * Resolution failures degrade to the single known form instead of throwing -
 * the server then decides whether that form is acceptable.
 */
async function resolveBlocklistTarget(
    options: WaPrivacyCoordinatorOptions,
    jid: string
): Promise<WaBlocklistTarget> {
    const normalized = normalizeRecipientJid(jid)

    if (isLidJid(normalized)) {
        let pnJid: string | null = null
        try {
            const snapshot = await options.deviceListStore.findByAnyUserJid(normalized)
            if (snapshot?.userJid && isUserJid(snapshot.userJid)) {
                pnJid = snapshot.userJid
            } else if (snapshot?.altUserJid && isUserJid(snapshot.altUserJid)) {
                pnJid = snapshot.altUserJid
            }
        } catch (error) {
            options.logger.debug('pn lookup failed for blocklist target', {
                lidJid: normalized,
                message: toError(error).message
            })
        }
        return { lidJid: normalized, pnJid }
    }

    if (!isUserJid(normalized)) {
        throw new Error(`blocklist target must be a user jid: ${jid}`)
    }

    let lidJid: string | null = null
    try {
        const snapshot = await options.deviceListStore.findByAnyUserJid(normalized)
        if (snapshot) {
            if (isLidJid(snapshot.userJid)) {
                lidJid = snapshot.userJid
            } else if (snapshot.altUserJid && isLidJid(snapshot.altUserJid)) {
                lidJid = snapshot.altUserJid
            }
        }
    } catch (error) {
        options.logger.debug('lid cache lookup failed for blocklist target', {
            pnJid: normalized,
            message: toError(error).message
        })
    }
    if (!lidJid) {
        try {
            const results = await options.queryLidsByPhoneJids([normalized])
            const match = results.find((entry) => entry.queriedJid === normalized)
            if (match?.lidJid) {
                lidJid = match.lidJid
            }
        } catch (error) {
            options.logger.debug('lid resolution failed for blocklist target', {
                pnJid: normalized,
                message: toError(error).message
            })
        }
    }
    return lidJid !== null ? { lidJid, pnJid: normalized } : { lidJid: null, pnJid: normalized }
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
            const target = await resolveBlocklistTarget(options, jid)
            const node = buildBlocklistBlockIq(target)
            const result = await queryWithContext('privacy.blockUser', node, undefined, {
                jid: target.lidJid ?? target.pnJid
            })
            assertIqResult(result, 'privacy.blockUser')
        },

        unblockUser: async (jid) => {
            const target = await resolveBlocklistTarget(options, jid)
            const unblockJid = target.lidJid ?? target.pnJid
            const node = buildBlocklistUnblockIq(unblockJid)
            const result = await queryWithContext('privacy.unblockUser', node, undefined, {
                jid: unblockJid
            })
            assertIqResult(result, 'privacy.unblockUser')
        }
    }
}
