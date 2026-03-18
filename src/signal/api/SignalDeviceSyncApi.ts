import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS, WA_NODE_TAGS, WA_USYNC_CONTEXTS } from '@protocol/constants'
import { parseSignalAddressFromJid, splitJid } from '@protocol/jid'
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

    public constructor(options: SignalDeviceSyncApiOptions) {
        this.logger = options.logger
        this.query = options.query
        this.deviceListStore = options.deviceListStore
        this.defaultTimeoutMs =
            options.defaultTimeoutMs ?? WA_DEFAULTS.SIGNAL_FETCH_KEY_BUNDLES_TIMEOUT_MS
        this.hostDomain = options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN
        this.generateSid = options.generateSid ?? createUsyncSidGenerator()
    }

    public async syncDeviceList(
        userJids: readonly string[],
        timeoutMs = this.defaultTimeoutMs
    ): Promise<readonly { readonly jid: string; readonly deviceJids: readonly string[] }[]> {
        const normalizedUsers = this.normalizeUsers(userJids)
        if (normalizedUsers.length === 0) {
            return []
        }

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
            return normalizedUsers.map((jid) => ({
                jid,
                deviceJids: cachedByUser.get(jid) ?? []
            }))
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
            await this.deviceListStore.upsertUserDevicesBatch(
                parsed.map((entry) => ({
                    userJid: entry.jid,
                    deviceJids: entry.deviceJids,
                    updatedAtMs
                }))
            )
        }
        const parsedByUser = new Map<string, readonly string[]>(
            parsed.map((entry) => [entry.jid, entry.deviceJids])
        )
        const merged = normalizedUsers.map((jid) => ({
            jid,
            deviceJids: parsedByUser.get(jid) ?? cachedByUser.get(jid) ?? []
        }))
        this.logger.debug('signal device sync success', {
            users: merged.length,
            devices: merged.reduce((total, entry) => total + entry.deviceJids.length, 0)
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
        const parsedByPhoneJid = new Map<string, SignalLidSyncResult>(
            parsed.map((entry) => [
                entry.phoneJid ?? entry.jid,
                {
                    phoneJid: entry.phoneJid ?? entry.jid,
                    lidJid: entry.lidJid,
                    exists: entry.exists
                }
            ])
        )
        const result = normalizedPhoneJids.map(
            (phoneJid) =>
                parsedByPhoneJid.get(phoneJid) ?? {
                    phoneJid,
                    lidJid: null,
                    exists: false
                }
        )
        this.logger.debug('signal lid sync success', {
            users: result.length,
            found: result.reduce((total, entry) => total + (entry.exists ? 1 : 0), 0)
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
        const usersToQuery: string[] = []
        for (let index = 0; index < normalizedUsers.length; index += 1) {
            const userJid = normalizedUsers[index]
            const record = records[index]
            if (!record) {
                usersToQuery.push(userJid)
                continue
            }
            cachedByUser.set(userJid, record.deviceJids)
        }
        return usersToQuery
    }

    private makeDeviceSyncRequest(userJids: readonly string[], sid: string): BinaryNode {
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
            users: userJids.map((jid) => ({
                jid
            }))
        })
    }

    private makeLidSyncRequest(userJids: readonly string[], sid: string): BinaryNode {
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
            users: userJids.map((jid) => ({
                jid,
                content: [
                    {
                        tag: WA_NODE_TAGS.CONTACT,
                        attrs: {},
                        content: splitJid(jid).user
                    }
                ]
            }))
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
        return userNodes.flatMap((userNode) => {
            const userJid = userNode.attrs.jid
            if (!userJid) {
                return []
            }
            const normalizedUserJid = this.normalizeUserJid(userJid)
            if (!requestedSet.has(normalizedUserJid)) {
                return []
            }
            return [
                {
                    jid: normalizedUserJid,
                    deviceJids: this.parseUserDeviceJids(userNode, normalizedUserJid)
                }
            ]
        })
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
        return userNodes.flatMap((userNode) => {
            const userJid = userNode.attrs.jid
            if (!userJid) {
                return []
            }

            const normalizedUserJid = this.normalizeUserJid(userJid)
            const normalizedPhoneJid = userNode.attrs.pn_jid
                ? this.normalizeUserJid(userNode.attrs.pn_jid)
                : null
            const wasRequested =
                requestedSet.has(normalizedUserJid) ||
                (normalizedPhoneJid !== null && requestedSet.has(normalizedPhoneJid))
            if (!wasRequested) {
                return []
            }

            const lidNode = findNodeChild(userNode, WA_NODE_TAGS.LID)
            const contactNode = findNodeChild(userNode, WA_NODE_TAGS.CONTACT)
            if (!lidNode) {
                return [
                    {
                        jid: normalizedUserJid,
                        lidJid: null,
                        phoneJid: normalizedPhoneJid,
                        exists: this.parseLidSyncContactExists(
                            contactNode,
                            normalizedUserJid,
                            false
                        )
                    }
                ]
            }
            const errorNode = findNodeChild(lidNode, WA_NODE_TAGS.ERROR)
            if (errorNode) {
                this.logger.warn('signal lid sync user error', {
                    jid: normalizedUserJid,
                    code: errorNode.attrs.code,
                    text: errorNode.attrs.text
                })
                return [
                    {
                        jid: normalizedUserJid,
                        lidJid: null,
                        phoneJid: normalizedPhoneJid,
                        exists: this.parseLidSyncContactExists(
                            contactNode,
                            normalizedUserJid,
                            false
                        )
                    }
                ]
            }
            const lidJid = lidNode.attrs.val ? this.normalizeUserJid(lidNode.attrs.val) : null
            return [
                {
                    jid: normalizedUserJid,
                    lidJid,
                    phoneJid: normalizedPhoneJid,
                    exists: this.parseLidSyncContactExists(
                        contactNode,
                        normalizedUserJid,
                        lidJid !== null
                    )
                }
            ]
        })
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

    private parseUserDeviceJids(userNode: BinaryNode, userJid: string): readonly string[] {
        const devicesNode = findNodeChild(userNode, WA_NODE_TAGS.DEVICES)
        if (!devicesNode) {
            return []
        }
        const errorNode = findNodeChild(devicesNode, WA_NODE_TAGS.ERROR)
        if (errorNode) {
            this.logger.warn('signal device sync user error', {
                jid: userJid,
                code: errorNode.attrs.code,
                text: errorNode.attrs.text
            })
            return []
        }

        const deviceListNode = findNodeChild(devicesNode, 'device-list')
        if (!deviceListNode) {
            return []
        }

        return [
            ...new Set(
                getNodeChildrenByTag(deviceListNode, 'device')
                    .map((deviceNode) => {
                        const parsedId = deviceNode.attrs.id
                            ? Number.parseInt(deviceNode.attrs.id, 10)
                            : Number.NaN
                        return Number.isSafeInteger(parsedId) && parsedId >= 0
                            ? this.toDeviceJid(userJid, parsedId)
                            : null
                    })
                    .filter((jid): jid is string => jid !== null)
            )
        ]
    }

    private normalizeUsers(userJids: readonly string[]): readonly string[] {
        return [...new Set(userJids.map((jid) => this.normalizeUserJid(jid)))]
    }

    private normalizeUserJid(jid: string): string {
        const { user } = parseSignalAddressFromJid(jid)
        const { server } = splitJid(jid)
        return `${user}@${server}`
    }

    private toDeviceJid(userJid: string, deviceId: number): string {
        const parsed = splitJid(userJid)
        if (deviceId === 0) {
            return `${parsed.user}@${parsed.server}`
        }
        return `${parsed.user}:${deviceId}@${parsed.server}`
    }
}
