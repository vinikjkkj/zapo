import type { Logger } from '@infra/log/types'
import { PromiseDedup } from '@infra/perf/PromiseDedup'
import { WA_DEFAULTS, WA_NODE_TAGS, WA_USYNC_CONTEXTS } from '@protocol/constants'
import { buildDeviceJid, isHostedDeviceId, splitJid, toUserJid } from '@protocol/jid'
import type { WaDeviceListStore } from '@store/contracts/device-list.store'
import { buildUsyncIq } from '@transport/node/builders/usync'
import { findNodeChild, getNodeChildrenByTag } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import { createUsyncSidGenerator, type WaUsyncSidGenerator } from '@transport/node/usync'
import type { BinaryNode } from '@transport/types'

interface SignalDeviceSyncApiOptions {
    readonly logger: Logger
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    readonly deviceListStore?: WaDeviceListStore
    readonly defaultTimeoutMs?: number
    readonly hostDomain?: string
    readonly generateSid?: WaUsyncSidGenerator
}

export interface SignalLidSyncResult {
    readonly phoneJid: string
    readonly lidJid: string | null
    readonly exists: boolean
}

export class SignalDeviceSyncApi {
    private readonly logger: SignalDeviceSyncApiOptions['logger']
    private readonly query: SignalDeviceSyncApiOptions['query']
    private readonly deviceListStore?: WaDeviceListStore
    private readonly defaultTimeoutMs: number
    private readonly hostDomain: string
    private readonly generateSid: WaUsyncSidGenerator
    private readonly syncDedup = new PromiseDedup()

    public constructor(options: SignalDeviceSyncApiOptions) {
        this.logger = options.logger
        this.query = options.query
        this.deviceListStore = options.deviceListStore
        this.defaultTimeoutMs =
            options.defaultTimeoutMs ?? WA_DEFAULTS.SIGNAL_FETCH_KEY_BUNDLES_TIMEOUT_MS
        this.hostDomain = options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN
        this.generateSid = options.generateSid ?? createUsyncSidGenerator()
    }

    public syncDeviceList(
        userJids: readonly string[],
        timeoutMs = this.defaultTimeoutMs
    ): Promise<readonly { readonly jid: string; readonly deviceJids: readonly string[] }[]> {
        const normalizedUsers = this.normalizeUsers(userJids)
        if (normalizedUsers.length === 0) {
            return Promise.resolve([])
        }

        const dedupKey = normalizedUsers.join(',')
        return this.syncDedup.run(dedupKey, () =>
            this.syncDeviceListInternal(normalizedUsers, timeoutMs)
        )
    }

    private async syncDeviceListInternal(
        normalizedUsers: readonly string[],
        timeoutMs: number
    ): Promise<readonly { readonly jid: string; readonly deviceJids: readonly string[] }[]> {
        const nowMs = Date.now()
        const cachedByUser = new Map<string, readonly string[]>()
        const usersToQuery = this.deviceListStore
            ? await this.collectUsersToQuery(
                  normalizedUsers,
                  nowMs,
                  cachedByUser,
                  this.deviceListStore
              )
            : normalizedUsers

        if (usersToQuery.length === 0) {
            const fromCache = new Array<{
                readonly jid: string
                readonly deviceJids: readonly string[]
            }>(normalizedUsers.length)
            for (let index = 0; index < normalizedUsers.length; index += 1) {
                const jid = normalizedUsers[index]
                fromCache[index] = {
                    jid,
                    deviceJids: cachedByUser.get(jid) ?? []
                }
            }
            return fromCache
        }

        const sid = await this.generateSid()
        const request = this.makeDeviceSyncRequest(usersToQuery, sid)
        this.logger.debug('signal device sync request', {
            users: usersToQuery.length,
            timeoutMs
        })
        const response = await this.query(request, timeoutMs)
        const parsed = this.parseDeviceSyncResponse(response, usersToQuery)
        if (this.deviceListStore) {
            const updatedAtMs = Date.now()
            const batch = new Array<{
                readonly userJid: string
                readonly deviceJids: readonly string[]
                readonly updatedAtMs: number
            }>(parsed.length)
            for (let index = 0; index < parsed.length; index += 1) {
                const entry = parsed[index]
                batch[index] = {
                    userJid: entry.jid,
                    deviceJids: entry.deviceJids,
                    updatedAtMs
                }
            }
            await this.deviceListStore.upsertUserDevicesBatch(batch)
        }
        const parsedByUser = new Map<string, readonly string[]>()
        for (let index = 0; index < parsed.length; index += 1) {
            const entry = parsed[index]
            parsedByUser.set(entry.jid, entry.deviceJids)
        }
        const merged = new Array<{
            readonly jid: string
            readonly deviceJids: readonly string[]
        }>(normalizedUsers.length)
        let totalDevices = 0
        for (let index = 0; index < normalizedUsers.length; index += 1) {
            const jid = normalizedUsers[index]
            const deviceJids = parsedByUser.get(jid) ?? cachedByUser.get(jid) ?? []
            totalDevices += deviceJids.length
            merged[index] = {
                jid,
                deviceJids
            }
        }
        this.logger.debug('signal device sync success', {
            users: merged.length,
            devices: totalDevices
        })
        return merged
    }

    public async queryLidsByPhoneJids(
        phoneJids: readonly string[],
        timeoutMs = this.defaultTimeoutMs
    ): Promise<readonly SignalLidSyncResult[]> {
        const normalizedPhoneJids = this.normalizeUsers(phoneJids)
        if (normalizedPhoneJids.length === 0) {
            return []
        }
        const sid = await this.generateSid()
        const request = this.makeLidSyncRequest(normalizedPhoneJids, sid)
        this.logger.debug('signal lid sync request', {
            users: normalizedPhoneJids.length,
            timeoutMs
        })
        const response = await this.query(request, timeoutMs)
        const parsed = this.parseLidSyncResponse(response, normalizedPhoneJids)
        const parsedByPhoneJid = new Map<string, SignalLidSyncResult>()
        for (let index = 0; index < parsed.length; index += 1) {
            const entry = parsed[index]
            const phoneJid = entry.phoneJid ?? entry.jid
            parsedByPhoneJid.set(phoneJid, {
                phoneJid,
                lidJid: entry.lidJid,
                exists: entry.exists
            })
        }
        const result = new Array<SignalLidSyncResult>(normalizedPhoneJids.length)
        let found = 0
        for (let index = 0; index < normalizedPhoneJids.length; index += 1) {
            const phoneJid = normalizedPhoneJids[index]
            const resolved = parsedByPhoneJid.get(phoneJid) ?? {
                phoneJid,
                lidJid: null,
                exists: false
            }
            if (resolved.exists) {
                found += 1
            }
            result[index] = resolved
        }
        this.logger.debug('signal lid sync success', {
            users: result.length,
            found
        })
        return result
    }

    private async collectUsersToQuery(
        normalizedUsers: readonly string[],
        nowMs: number,
        cachedByUser: Map<string, readonly string[]>,
        store: WaDeviceListStore
    ): Promise<readonly string[]> {
        const records = await store.getUserDevicesBatch(normalizedUsers, nowMs)
        const usersToQuery = new Array<string>(normalizedUsers.length)
        let usersToQueryCount = 0
        for (let index = 0; index < normalizedUsers.length; index += 1) {
            const userJid = normalizedUsers[index]
            const record = records[index]
            if (!record) {
                usersToQuery[usersToQueryCount] = userJid
                usersToQueryCount += 1
                continue
            }
            cachedByUser.set(userJid, record.deviceJids)
        }
        usersToQuery.length = usersToQueryCount
        return usersToQuery
    }

    private makeDeviceSyncRequest(userJids: readonly string[], sid: string): BinaryNode {
        const users = new Array<{ readonly jid: string }>(userJids.length)
        for (let index = 0; index < userJids.length; index += 1) {
            users[index] = {
                jid: userJids[index]
            }
        }
        return buildUsyncIq({
            sid,
            hostDomain: this.hostDomain,
            context: WA_USYNC_CONTEXTS.INTERACTIVE,
            queryProtocolNodes: [
                {
                    tag: WA_NODE_TAGS.DEVICES,
                    attrs: {
                        version: '2'
                    }
                }
            ],
            users
        })
    }

    private makeLidSyncRequest(userJids: readonly string[], sid: string): BinaryNode {
        const users = new Array<{
            readonly jid: string
            readonly content: readonly {
                readonly tag: string
                readonly attrs: Readonly<Record<string, string>>
                readonly content: string
            }[]
        }>(userJids.length)
        for (let index = 0; index < userJids.length; index += 1) {
            const jid = userJids[index]
            users[index] = {
                jid,
                content: [
                    {
                        tag: WA_NODE_TAGS.CONTACT,
                        attrs: {},
                        content: splitJid(jid).user
                    }
                ]
            }
        }
        return buildUsyncIq({
            sid,
            hostDomain: this.hostDomain,
            context: WA_USYNC_CONTEXTS.INTERACTIVE,
            queryProtocolNodes: [
                {
                    tag: WA_NODE_TAGS.CONTACT,
                    attrs: {}
                },
                {
                    tag: WA_NODE_TAGS.LID,
                    attrs: {}
                }
            ],
            users
        })
    }

    private parseDeviceSyncResponse(
        node: BinaryNode,
        requestedUsers: readonly string[]
    ): readonly { readonly jid: string; readonly deviceJids: readonly string[] }[] {
        assertIqResult(node, 'signal device sync')
        const usyncNode = findNodeChild(node, WA_NODE_TAGS.USYNC)
        if (!usyncNode) {
            throw new Error('signal device sync response missing usync node')
        }
        const listNode = findNodeChild(usyncNode, WA_NODE_TAGS.LIST)
        if (!listNode) {
            throw new Error('signal device sync response missing list node')
        }

        const requestedSet = new Set(requestedUsers)
        const userNodes = getNodeChildrenByTag(listNode, WA_NODE_TAGS.USER)
        const parsed = new Array<{
            readonly jid: string
            readonly deviceJids: readonly string[]
        }>(userNodes.length)
        let parsedCount = 0
        for (let index = 0; index < userNodes.length; index += 1) {
            const userNode = userNodes[index]
            const userJid = userNode.attrs.jid
            if (!userJid) {
                continue
            }
            const normalizedUserJid = this.normalizeUserJid(userJid)
            if (!requestedSet.has(normalizedUserJid)) {
                continue
            }
            parsed[parsedCount] = {
                jid: normalizedUserJid,
                deviceJids: this.parseUserDeviceJids(userNode, userJid, normalizedUserJid)
            }
            parsedCount += 1
        }
        parsed.length = parsedCount
        return parsed
    }

    private parseLidSyncResponse(
        node: BinaryNode,
        requestedUsers: readonly string[]
    ): readonly {
        readonly jid: string
        readonly lidJid: string | null
        readonly phoneJid: string | null
        readonly exists: boolean
    }[] {
        assertIqResult(node, 'signal lid sync')
        const usyncNode = findNodeChild(node, WA_NODE_TAGS.USYNC)
        if (!usyncNode) {
            throw new Error('signal lid sync response missing usync node')
        }
        const listNode = findNodeChild(usyncNode, WA_NODE_TAGS.LIST)
        if (!listNode) {
            throw new Error('signal lid sync response missing list node')
        }

        const requestedSet = new Set(requestedUsers)
        const userNodes = getNodeChildrenByTag(listNode, WA_NODE_TAGS.USER)
        const parsed = new Array<{
            readonly jid: string
            readonly lidJid: string | null
            readonly phoneJid: string | null
            readonly exists: boolean
        }>(userNodes.length)
        let parsedCount = 0
        for (let index = 0; index < userNodes.length; index += 1) {
            const userNode = userNodes[index]
            const userJid = userNode.attrs.jid
            if (!userJid) {
                continue
            }

            const normalizedUserJid = this.normalizeUserJid(userJid)
            const normalizedPhoneJid = userNode.attrs.pn_jid
                ? this.normalizeUserJid(userNode.attrs.pn_jid)
                : null
            const wasRequested =
                requestedSet.has(normalizedUserJid) ||
                (normalizedPhoneJid !== null && requestedSet.has(normalizedPhoneJid))
            if (!wasRequested) {
                continue
            }

            const lidNode = findNodeChild(userNode, WA_NODE_TAGS.LID)
            const contactNode = findNodeChild(userNode, WA_NODE_TAGS.CONTACT)
            if (!lidNode) {
                parsed[parsedCount] = this.buildLidSyncResult(
                    normalizedUserJid,
                    normalizedPhoneJid,
                    contactNode,
                    null
                )
                parsedCount += 1
                continue
            }
            const errorNode = findNodeChild(lidNode, WA_NODE_TAGS.ERROR)
            if (errorNode) {
                this.logger.warn('signal lid sync user error', {
                    jid: normalizedUserJid,
                    code: errorNode.attrs.code,
                    text: errorNode.attrs.text
                })
                parsed[parsedCount] = this.buildLidSyncResult(
                    normalizedUserJid,
                    normalizedPhoneJid,
                    contactNode,
                    null
                )
                parsedCount += 1
                continue
            }
            const lidJid = lidNode.attrs.val ? this.normalizeUserJid(lidNode.attrs.val) : null
            parsed[parsedCount] = this.buildLidSyncResult(
                normalizedUserJid,
                normalizedPhoneJid,
                contactNode,
                lidJid
            )
            parsedCount += 1
        }
        parsed.length = parsedCount
        return parsed
    }

    private buildLidSyncResult(
        jid: string,
        phoneJid: string | null,
        contactNode: BinaryNode | undefined,
        lidJid: string | null
    ): {
        readonly jid: string
        readonly lidJid: string | null
        readonly phoneJid: string | null
        readonly exists: boolean
    } {
        return {
            jid,
            lidJid,
            phoneJid,
            exists: this.parseLidSyncContactExists(contactNode, jid, lidJid !== null)
        }
    }

    private parseLidSyncContactExists(
        contactNode: BinaryNode | undefined,
        userJid: string,
        defaultExists: boolean
    ): boolean {
        if (!contactNode) {
            return defaultExists
        }
        const errorNode = findNodeChild(contactNode, WA_NODE_TAGS.ERROR)
        if (errorNode) {
            this.logger.warn('signal lid sync contact error', {
                jid: userJid,
                code: errorNode.attrs.code,
                text: errorNode.attrs.text
            })
            return false
        }
        return contactNode.attrs.type === 'in'
    }

    private parseUserDeviceJids(
        userNode: BinaryNode,
        rawUserJid: string,
        normalizedUserJid: string
    ): readonly string[] {
        const devicesNode = findNodeChild(userNode, WA_NODE_TAGS.DEVICES)
        if (!devicesNode) {
            return []
        }
        const errorNode = findNodeChild(devicesNode, WA_NODE_TAGS.ERROR)
        if (errorNode) {
            this.logger.warn('signal device sync user error', {
                jid: normalizedUserJid,
                code: errorNode.attrs.code,
                text: errorNode.attrs.text
            })
            return []
        }

        const deviceListNode = findNodeChild(devicesNode, 'device-list')
        if (!deviceListNode) {
            return []
        }

        const parsedNormalizedUser = splitJid(normalizedUserJid)
        const rawAtIndex = rawUserJid.indexOf('@')
        const rawServer =
            rawAtIndex >= 1 ? rawUserJid.slice(rawAtIndex + 1) : parsedNormalizedUser.server
        const dedup = new Set<string>()
        for (const deviceNode of getNodeChildrenByTag(deviceListNode, 'device')) {
            const parsedId = deviceNode.attrs.id
                ? Number.parseInt(deviceNode.attrs.id, 10)
                : Number.NaN
            if (!Number.isSafeInteger(parsedId) || parsedId < 0) {
                continue
            }
            const isHostedDevice =
                isHostedDeviceId(parsedId) || deviceNode.attrs.is_hosted === 'true'
            dedup.add(
                buildDeviceJid(parsedNormalizedUser.user, parsedNormalizedUser.server, parsedId, {
                    rawServer,
                    isHosted: isHostedDevice
                })
            )
        }
        return Array.from(dedup)
    }

    private normalizeUsers(userJids: readonly string[]): readonly string[] {
        const normalized = new Array<string>(userJids.length)
        let normalizedCount = 0
        const dedup = new Set<string>()
        for (let index = 0; index < userJids.length; index += 1) {
            const normalizedJid = this.normalizeUserJid(userJids[index])
            if (dedup.has(normalizedJid)) {
                continue
            }
            dedup.add(normalizedJid)
            normalized[normalizedCount] = normalizedJid
            normalizedCount += 1
        }
        normalized.length = normalizedCount
        return normalized
    }

    private normalizeUserJid(jid: string): string {
        return toUserJid(jid, {
            canonicalizeSignalServer: true,
            hostDomain: this.hostDomain
        })
    }
}
