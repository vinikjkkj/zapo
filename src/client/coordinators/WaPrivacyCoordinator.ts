import {
    parseBlocklist,
    parseDisallowedList,
    parseDisallowedListUpdate,
    parsePrivacyCategoryDhash,
    parsePrivacySettings,
    type WaBlocklistResult,
    type WaPrivacyDisallowedListResult,
    type WaPrivacySettings
} from '@client/events/privacy'
import type { Logger } from '@infra/log/types'
import { PromiseDedup } from '@infra/perf/PromiseDedup'
import { WA_DEFAULTS } from '@protocol/defaults'
import { isLidJid, isUserJid, normalizeRecipientJid } from '@protocol/jid'
import { WA_IQ_TYPES, WA_NODE_TAGS } from '@protocol/nodes'
import {
    WA_PRIVACY_ACCOUNT_SYNC_DISALLOWED_LISTS,
    WA_PRIVACY_LIST_ACTIONS,
    WA_PRIVACY_SETTING_TO_CATEGORY,
    type WaPrivacyCategory,
    type WaPrivacyDisallowedListSettingName,
    type WaPrivacySettingName,
    type WaPrivacySettingValueMap
} from '@protocol/privacy'
import type { SignalUserJidPair } from '@signal/api/SignalDeviceSyncApi'
import type { WaContactStore } from '@store/contracts/contact.store'
import {
    buildBlocklistBlockIq,
    buildBlocklistUnblockIq,
    buildGetBlocklistIq,
    buildGetPrivacyDisallowedListIq,
    buildGetPrivacySettingsIq,
    buildSetPrivacyCategoryIq,
    buildSetPrivacyDisallowedListIq,
    type WaBlocklistTarget,
    type WaPrivacyDisallowedListEntry
} from '@transport/node/builders/privacy'
import { assertIqResult, parseIqError } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

/** JIDs to add to / remove from a category's disallowed list. */
export interface WaPrivacyDisallowedListInput {
    readonly add?: readonly string[]
    readonly remove?: readonly string[]
}

/** A disallowed list the server reported as changed, tagged with its category. */
export interface WaPrivacyDisallowedListUpdate extends WaPrivacyDisallowedListResult {
    readonly setting: WaPrivacyDisallowedListSettingName
}

/** Everything an account-sync privacy refresh pulls back. */
export interface WaPrivacyAccountSyncResult {
    readonly settings: WaPrivacySettings
    /**
     * Only the lists the server reported as changed - a category sitting off
     * `contact_blacklist` answers with no list at all and is left out.
     */
    readonly disallowedLists: readonly WaPrivacyDisallowedListUpdate[]
}

/**
 * Coordinates privacy queries/mutations: per-category settings, blocklist,
 * and the per-category disallowed lists. Accessed via {@link WaClient.privacy}.
 */
export interface WaPrivacyCoordinator {
    /**
     * Fetches the current value of every privacy category. A change made on
     * another device reaches this client on its own and surfaces as a
     * `privacy` event, so polling this is only needed for the initial read.
     */
    readonly getPrivacySettings: () => Promise<WaPrivacySettings>
    /**
     * Updates a single privacy category to a new value, returning the `dhash`
     * the server echoes back - the version stamp of that category's
     * disallowed list, present only while the category sits on
     * `'contact_blacklist'` (`null` otherwise).
     *
     * The `'contact_blacklist'` value (a deny-list of specific contacts on
     * top of `'contacts'`/`'all'`) only flips the **mode** here and leaves the
     * list empty. Populate it with {@link setDisallowedList}, which carries
     * the mode and the entries in one stanza.
     */
    readonly setPrivacySetting: <S extends WaPrivacySettingName>(
        setting: S,
        value: WaPrivacySettingValueMap[S]
    ) => Promise<string | null>
    /**
     * Fetches the per-category disallowed list (the JIDs explicitly excluded
     * while the category sits on `'contact_blacklist'`). Returns an empty
     * list when the category is on any other value. `entries` carries the same
     * membership as `jids` plus each entry's handle, when the server
     * identified it that way.
     */
    readonly getDisallowedList: (
        category: WaPrivacyDisallowedListSettingName
    ) => Promise<WaPrivacyDisallowedListResult>
    /**
     * Adds/removes JIDs on a category's disallowed list, switching the
     * category to `'contact_blacklist'` in the same stanza (the server has no
     * separate deny-list endpoint). Inputs accept phone jids, LID jids, or
     * bare phone numbers and are resolved to both addressing forms, like
     * {@link blockUser}.
     *
     * The write is versioned by a `dhash` the coordinator reads right before
     * sending; if another device mutated the list in between, the server
     * answers `409` and the call refetches the stamp and retries once.
     * Returns the new `dhash`.
     */
    readonly setDisallowedList: (
        category: WaPrivacyDisallowedListSettingName,
        input: WaPrivacyDisallowedListInput
    ) => Promise<string | null>
    /**
     * Refetches everything an account-sync privacy update covers: the whole
     * category set plus the disallowed lists of
     * {@link WA_PRIVACY_ACCOUNT_SYNC_DISALLOWED_LISTS}, queried in parallel.
     * The result is both returned and emitted as the `privacy` event, so the
     * client's view stays consistent no matter who triggered the refresh.
     * Categories and lists are separate queries, so a change landing
     * mid-refresh can leave the two halves a version apart.
     *
     * Concurrent calls are deduplicated: one issued while another is still in
     * flight joins it and resolves with the same snapshot.
     *
     * This is what runs on its own when another device changes a setting -
     * the notification carrying the change is a trigger, not a payload to act
     * on. Call it directly only to force a refresh.
     */
    readonly refreshFromAccountSync: () => Promise<WaPrivacyAccountSyncResult>
    /**
     * Returns the current account-wide blocklist. Blocks/unblocks performed
     * on another device are refetched through the same dirty-bit path as
     * {@link getPrivacySettings} and re-emitted as `blocklist`. `entries`
     * carries the same membership as `jids` plus each entry's handle, when the
     * server identified it that way.
     */
    readonly getBlocklist: () => Promise<WaBlocklistResult>
    /**
     * Blocks a user (account-wide blocklist). Accepts a phone-number jid, a
     * LID jid, or a bare phone number (digits only). After this, the peer can
     * no longer
     * message/call you and cannot see your last seen/online/photo/status. The
     * block is symmetric only from the peer's read perspective - they don't
     * get an explicit "you were blocked" notification.
     *
     * The server keys blocklist entries by LID for migrated accounts, so a
     * phone-number input is resolved to its LID first (device-list cache,
     * then a usync query). Non-migrated accounts fall back to the plain
     * phone-jid form.
     *
     * A migrated entry also carries one identifier attribute, read from the
     * stored contact: the phone jid, the username handle, or the display name.
     * Entries with none of them are sent as `unknown_identifier`.
     */
    readonly blockUser: (jid: string) => Promise<void>
    /**
     * Removes a user from the blocklist. Accepts the same inputs as
     * {@link blockUser} and performs the same LID resolution - unblocking a
     * migrated entry by phone jid is rejected by the server.
     */
    readonly unblockUser: (jid: string) => Promise<void>
}

/**
 * Account-sync driving surface, kept off {@link WaPrivacyCoordinator} because
 * it is the client's to call, not the consumer's: `WaClient.privacy` narrows
 * to the public interface.
 */
export interface WaPrivacyCoordinatorRuntime extends WaPrivacyCoordinator {
    /**
     * Queues a refresh, restarting the quiet window on every call so a burst
     * of `account_sync` notifications collapses into a single refetch instead
     * of one per stanza (each costs five queries). A refresh already in
     * flight is waited out rather than joined: its queries went out before
     * the change landed, so its snapshot would not carry the new value.
     */
    readonly scheduleAccountSyncRefresh: () => void
    /**
     * Drops a queued refresh so a disconnect does not leave a refetch to fire
     * against a closed connection. A refresh already in flight still runs to
     * completion.
     */
    readonly stopAccountSyncRefresh: () => void
}

interface WaPrivacyCoordinatorOptions {
    readonly logger: Logger
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly resolveUserJidPair: (userJid: string) => Promise<SignalUserJidPair>
    /**
     * The account's own LID, when it has one. Its presence marks the account
     * as LID-migrated, which every disallowed-list stanza has to declare.
     */
    readonly getSelfLid: () => string | null
    readonly emitPrivacy: (event: WaPrivacyAccountSyncResult) => void
    /** Source of the username / display-name identifiers a migrated write carries. */
    readonly contactStore: WaContactStore
    /**
     * Server-synced `username_contact_privacy_setting_allow_uncontact_set_enable`
     * AB-prop, off by default - entries then fall back to `pn_jid`.
     */
    readonly isUsernamePrivacyListIdentifierEnabled: () => boolean
}

/**
 * Adds the identifier fields a migrated write may carry. Only the writes that
 * consume them call it - an unblock addresses by jid alone, and a
 * disallowed-list write with the AB gate closed falls back to `pn_jid`.
 */
async function withContactIdentifiers(
    options: WaPrivacyCoordinatorOptions,
    target: WaBlocklistTarget
): Promise<WaBlocklistTarget> {
    if (target.lidJid === null) return target
    try {
        const contact = await options.contactStore.getByJid(target.lidJid)
        return {
            ...target,
            username: contact?.username ?? null,
            displayName: contact?.displayName ?? null
        }
    } catch (error) {
        options.logger.debug('contact identifier lookup failed', {
            jid: target.lidJid,
            message: toError(error).message
        })
        return target
    }
}

/**
 * Resolves a blocklist input into both addressing forms via
 * `resolveUserJidPair` (device-list cache first, usync fallback for phone
 * jids). Resolution failures degrade to the single known form instead of
 * throwing - the server then decides whether that form is acceptable.
 */
async function resolveBlocklistTarget(
    options: WaPrivacyCoordinatorOptions,
    jid: string
): Promise<WaBlocklistTarget> {
    const normalized = normalizeRecipientJid(jid)
    if (!isLidJid(normalized) && !isUserJid(normalized)) {
        throw new Error(`blocklist target must be a user jid: ${jid}`)
    }
    const pair = await options.resolveUserJidPair(normalized)
    if (pair.lidJid !== null) {
        return { lidJid: pair.lidJid, pnJid: pair.pnJid }
    }
    return { lidJid: null, pnJid: pair.pnJid ?? normalized }
}

const ACCOUNT_SYNC_REFRESH_KEY = 'account-sync'

/**
 * A `409` on a disallowed-list write means the `dhash` we sent no longer
 * matches the server's: another device changed the list in between.
 */
function isStaleDhashResult(node: BinaryNode): boolean {
    if (node.tag !== WA_NODE_TAGS.IQ || node.attrs.type === WA_IQ_TYPES.RESULT) {
        return false
    }
    const error = parseIqError(node)
    return error.numericCode === 409 || error.code === '409'
}

/**
 * Resolves a disallowed-list input into `<user>` entries. Unlike the blocklist
 * the server takes both actions in one stanza, so add/remove are resolved
 * together and keep their relative order.
 */
async function resolveDisallowedListEntries(
    options: WaPrivacyCoordinatorOptions,
    input: WaPrivacyDisallowedListInput
): Promise<readonly WaPrivacyDisallowedListEntry[]> {
    const entries: WaPrivacyDisallowedListEntry[] = []
    const actions = [
        { action: WA_PRIVACY_LIST_ACTIONS.ADD, jids: input.add ?? [] },
        { action: WA_PRIVACY_LIST_ACTIONS.REMOVE, jids: input.remove ?? [] }
    ] as const
    const usernameIdentifierAllowed = options.isUsernamePrivacyListIdentifierEnabled()
    for (const { action, jids } of actions) {
        for (const jid of jids) {
            const resolved = await resolveBlocklistTarget(options, jid)
            const target = usernameIdentifierAllowed
                ? await withContactIdentifiers(options, resolved)
                : resolved
            entries.push({
                action,
                lidJid: target.lidJid,
                pnJid: target.pnJid,
                username: target.username ?? null
            })
        }
    }
    if (entries.length === 0) {
        throw new Error('setDisallowedList requires at least one add/remove entry')
    }
    return entries
}

/** Builds a {@link WaPrivacyCoordinator} backed by the given IQ query function. */
export function createPrivacyCoordinator(
    options: WaPrivacyCoordinatorOptions
): WaPrivacyCoordinatorRuntime {
    const { queryWithContext } = options
    const usesLidAddressing = () => options.getSelfLid() !== null
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let refreshStopped = false
    let activeRefresh: Promise<unknown> | null = null
    const refreshDedup = new PromiseDedup()

    const queryDisallowedList = async (category: WaPrivacyCategory): Promise<BinaryNode> => {
        const node = buildGetPrivacyDisallowedListIq(category, usesLidAddressing())
        const result = await queryWithContext('privacy.getDisallowedList', node, undefined, {
            category
        })
        assertIqResult(result, 'privacy.getDisallowedList')
        return result
    }

    const readDisallowedList = async (
        category: WaPrivacyCategory
    ): Promise<WaPrivacyDisallowedListResult> =>
        parseDisallowedList(await queryDisallowedList(category))

    const runAccountSyncRefresh = async (): Promise<WaPrivacyAccountSyncResult> => {
        const settingsNode = await queryWithContext(
            'privacy.getSettings',
            buildGetPrivacySettingsIq()
        )
        assertIqResult(settingsNode, 'privacy.getSettings')

        const listNodes = await Promise.all(
            WA_PRIVACY_ACCOUNT_SYNC_DISALLOWED_LISTS.map(async (setting) => ({
                setting,
                node: await queryDisallowedList(WA_PRIVACY_SETTING_TO_CATEGORY[setting])
            }))
        )
        const disallowedLists: WaPrivacyDisallowedListUpdate[] = []
        for (const { setting, node } of listNodes) {
            const update = parseDisallowedListUpdate(node)
            if (update) {
                disallowedLists.push({ setting, ...update })
            }
        }

        const result: WaPrivacyAccountSyncResult = {
            settings: parsePrivacySettings(settingsNode),
            disallowedLists
        }
        options.emitPrivacy(result)
        return result
    }

    /**
     * Joins a refresh already in flight instead of racing it, so concurrent
     * callers share one round of queries and one emit.
     */
    const dedupedRefresh = (): Promise<WaPrivacyAccountSyncResult> => {
        const running = refreshDedup.run(ACCOUNT_SYNC_REFRESH_KEY, runAccountSyncRefresh)
        activeRefresh = running
        return running
    }

    /**
     * Refresh for a change the server just announced. It must not join a
     * refresh already in flight: that one's queries went out before the
     * change landed, so joining it would emit a snapshot without the new
     * value and nothing would refetch. Waiting for it first guarantees a read
     * issued after the notification.
     */
    const followUpRefresh = async (): Promise<void> => {
        if (refreshStopped) {
            return
        }
        await activeRefresh?.catch(() => undefined)
        if (refreshStopped) {
            return
        }
        await dedupedRefresh()
    }

    const writeDisallowedList = async (
        category: WaPrivacyCategory,
        entries: readonly WaPrivacyDisallowedListEntry[],
        dhash: string | null
    ): Promise<BinaryNode> => {
        const node = buildSetPrivacyDisallowedListIq(category, entries, dhash, usesLidAddressing())
        return queryWithContext('privacy.setDisallowedList', node, undefined, {
            category,
            entries: entries.length
        })
    }

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
            return parsePrivacyCategoryDhash(result, category)
        },

        getDisallowedList: async (setting) =>
            readDisallowedList(WA_PRIVACY_SETTING_TO_CATEGORY[setting]),

        setDisallowedList: async (setting, input) => {
            const category: WaPrivacyCategory = WA_PRIVACY_SETTING_TO_CATEGORY[setting]
            const entries = await resolveDisallowedListEntries(options, input)
            const current = await readDisallowedList(category)
            let result = await writeDisallowedList(category, entries, current.dhash ?? null)
            if (isStaleDhashResult(result)) {
                const refreshed = await readDisallowedList(category)
                result = await writeDisallowedList(category, entries, refreshed.dhash ?? null)
            }
            assertIqResult(result, 'privacy.setDisallowedList')
            return parsePrivacyCategoryDhash(result, category)
        },

        refreshFromAccountSync: () => dedupedRefresh(),

        scheduleAccountSyncRefresh: () => {
            refreshStopped = false
            if (refreshTimer !== null) {
                clearTimeout(refreshTimer)
            }
            refreshTimer = setTimeout(() => {
                refreshTimer = null
                void followUpRefresh().catch((error: unknown) => {
                    options.logger.warn('account_sync privacy refresh failed', {
                        message: toError(error).message
                    })
                })
            }, WA_DEFAULTS.PRIVACY_ACCOUNT_SYNC_DEBOUNCE_MS)
            refreshTimer.unref?.()
        },

        stopAccountSyncRefresh: () => {
            refreshStopped = true
            if (refreshTimer !== null) {
                clearTimeout(refreshTimer)
                refreshTimer = null
            }
        },

        getBlocklist: async () => {
            const node = buildGetBlocklistIq()
            const result = await queryWithContext('privacy.getBlocklist', node)
            assertIqResult(result, 'privacy.getBlocklist')
            return parseBlocklist(result)
        },

        blockUser: async (jid) => {
            const target = await withContactIdentifiers(
                options,
                await resolveBlocklistTarget(options, jid)
            )
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
