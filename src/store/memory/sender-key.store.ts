import { signalAddressKey } from '@protocol/jid'
import type { SenderKeyDistributionRecord, SenderKeyRecord, SignalAddress } from '@signal/types'
import type { WaSenderKeyStore as WaSenderKeyStoreContract } from '@store/contracts/sender-key.store'
import { resolveOptionalPositive, resolvePositive } from '@util/coercion'
import {
    createIdleExpiryIndex,
    createPeriodicCleanup,
    type IdleExpiryIndex,
    type PeriodicCleanupHandle,
    setBoundedMapEntry
} from '@util/collections'

const DEFAULT_SENDER_KEY_STORE_LIMITS = Object.freeze({
    senderKeys: 8_192,
    senderDistributions: 8_192
})

export interface WaSenderKeyMemoryStoreOptions {
    readonly maxSenderKeys?: number
    readonly maxSenderDistributions?: number
    /**
     * Evicts a sender key or distribution record once it has been neither
     * read nor written for this many milliseconds; a periodic sweep reclaims
     * it. Point reads and writes refresh a record; the `getGroupSenderKeyList`
     * scan does not. Unset keeps records until the `max*` caps evict them.
     *
     * Meant for a cache in front of a persistent backend (the `cacheLayer`
     * L1), where an evicted entry is simply re-read. On a store that is the
     * source of truth, expiry forgets group sender keys and who already
     * received ours.
     */
    readonly ttlMs?: number
}

export class SenderKeyMemoryStore implements WaSenderKeyStoreContract {
    private readonly senderKeys: Map<string, SenderKeyRecord>
    private readonly senderDistributions: Map<string, SenderKeyDistributionRecord>
    private readonly maxSenderKeys: number
    private readonly maxSenderDistributions: number
    private readonly idleSenderKeys: IdleExpiryIndex<string> | null
    private readonly idleDistributions: IdleExpiryIndex<string> | null
    private readonly cleanup: PeriodicCleanupHandle | null

    public constructor(options: WaSenderKeyMemoryStoreOptions = {}) {
        this.senderKeys = new Map()
        this.senderDistributions = new Map()
        this.maxSenderKeys = resolvePositive(
            options.maxSenderKeys,
            DEFAULT_SENDER_KEY_STORE_LIMITS.senderKeys,
            'WaSenderKeyMemoryStoreOptions.maxSenderKeys'
        )
        this.maxSenderDistributions = resolvePositive(
            options.maxSenderDistributions,
            DEFAULT_SENDER_KEY_STORE_LIMITS.senderDistributions,
            'WaSenderKeyMemoryStoreOptions.maxSenderDistributions'
        )
        const ttlMs = resolveOptionalPositive(options.ttlMs, 'WaSenderKeyMemoryStoreOptions.ttlMs')
        this.idleSenderKeys = ttlMs === undefined ? null : createIdleExpiryIndex(ttlMs)
        this.idleDistributions = ttlMs === undefined ? null : createIdleExpiryIndex(ttlMs)
        this.cleanup =
            ttlMs === undefined
                ? null
                : createPeriodicCleanup(ttlMs, () => {
                      void this.cleanupExpired(Date.now())
                  })
    }

    public async upsertSenderKey(record: SenderKeyRecord): Promise<void> {
        const key = this.makeKey(record.groupId, record.sender)
        setBoundedMapEntry(
            this.senderKeys,
            key,
            record,
            this.maxSenderKeys,
            this.idleSenderKeys?.delete
        )
        this.idleSenderKeys?.touch(key, Date.now())
    }

    public async upsertSenderKeyDistribution(record: SenderKeyDistributionRecord): Promise<void> {
        const key = this.makeKey(record.groupId, record.sender)
        setBoundedMapEntry(
            this.senderDistributions,
            key,
            record,
            this.maxSenderDistributions,
            this.idleDistributions?.delete
        )
        this.idleDistributions?.touch(key, Date.now())
    }

    public async upsertSenderKeyDistributions(
        records: readonly SenderKeyDistributionRecord[]
    ): Promise<void> {
        const idle = this.idleDistributions
        const nowMs = idle === null ? 0 : Date.now()
        for (const record of records) {
            const key = this.makeKey(record.groupId, record.sender)
            setBoundedMapEntry(
                this.senderDistributions,
                key,
                record,
                this.maxSenderDistributions,
                idle?.delete
            )
            idle?.touch(key, nowMs)
        }
    }

    public async getGroupSenderKeyList(groupId: string): Promise<{
        readonly skList: readonly SenderKeyRecord[]
        readonly skDistribList: readonly SenderKeyDistributionRecord[]
    }> {
        const skList: SenderKeyRecord[] = []
        const skDistribList: SenderKeyDistributionRecord[] = []

        for (const record of this.senderKeys.values()) {
            if (record.groupId === groupId) {
                skList.push(record)
            }
        }

        for (const record of this.senderDistributions.values()) {
            if (record.groupId === groupId) {
                skDistribList.push(record)
            }
        }

        return {
            skList,
            skDistribList
        }
    }

    public async getDeviceSenderKey(
        groupId: string,
        sender: SignalAddress
    ): Promise<SenderKeyRecord | null> {
        const key = this.makeKey(groupId, sender)
        const record = this.senderKeys.get(key)
        if (record === undefined) return null
        this.idleSenderKeys?.touch(key, Date.now())
        return record
    }

    public async getDeviceSenderKeyDistributions(
        groupId: string,
        senders: readonly SignalAddress[]
    ): Promise<readonly (SenderKeyDistributionRecord | null)[]> {
        const idle = this.idleDistributions
        const nowMs = idle === null ? 0 : Date.now()
        const records = new Array<SenderKeyDistributionRecord | null>(senders.length)
        for (let index = 0; index < senders.length; index += 1) {
            const key = this.makeKey(groupId, senders[index])
            const record = this.senderDistributions.get(key)
            if (record !== undefined) idle?.touch(key, nowMs)
            records[index] = record ?? null
        }
        return records
    }

    public async deleteDeviceSenderKey(target: SignalAddress, groupId?: string): Promise<number> {
        let deleted = 0
        deleted += this.deleteMatching(this.senderKeys, this.idleSenderKeys, target, groupId)
        deleted += this.deleteMatching(
            this.senderDistributions,
            this.idleDistributions,
            target,
            groupId
        )
        return deleted
    }

    public async markForgetSenderKey(
        groupId: string,
        participants: readonly SignalAddress[]
    ): Promise<number> {
        let deleted = 0
        for (let index = 0; index < participants.length; index += 1) {
            const participant = participants[index]
            deleted += this.deleteMatching(
                this.senderKeys,
                this.idleSenderKeys,
                participant,
                groupId
            )
            deleted += this.deleteMatching(
                this.senderDistributions,
                this.idleDistributions,
                participant,
                groupId
            )
        }
        return deleted
    }

    public async clear(): Promise<void> {
        this.senderKeys.clear()
        this.senderDistributions.clear()
        this.idleSenderKeys?.clear()
        this.idleDistributions?.clear()
    }

    /**
     * Evicts the sender keys and distribution records idle for at least
     * `ttlMs` as of `nowMs` and returns how many were evicted. Runs on a
     * timer when `ttlMs` is set; a no-op otherwise.
     */
    public async cleanupExpired(nowMs: number): Promise<number> {
        let expired = 0
        if (this.idleSenderKeys !== null) {
            expired += this.idleSenderKeys.sweep(nowMs, (key) => {
                this.senderKeys.delete(key)
            })
        }
        if (this.idleDistributions !== null) {
            expired += this.idleDistributions.sweep(nowMs, (key) => {
                this.senderDistributions.delete(key)
            })
        }
        return expired
    }

    public async destroy(): Promise<void> {
        this.cleanup?.destroy()
        await this.clear()
    }

    private deleteMatching<T extends { groupId: string; sender: SignalAddress }>(
        map: Map<string, T>,
        idle: IdleExpiryIndex<string> | null,
        target: SignalAddress,
        groupId?: string
    ): number {
        let deleted = 0
        const targetAddressKey = signalAddressKey(target)
        for (const [key, record] of map.entries()) {
            const sameGroup = groupId ? record.groupId === groupId : true
            const sameAddress = signalAddressKey(record.sender) === targetAddressKey
            if (sameGroup && sameAddress) {
                map.delete(key)
                idle?.delete(key)
                deleted += 1
            }
        }
        return deleted
    }

    private makeKey(groupId: string, sender: SignalAddress): string {
        return `${groupId}|${signalAddressKey(sender)}`
    }
}
