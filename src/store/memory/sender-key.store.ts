import { signalAddressKey } from '@protocol/jid'
import type { SenderKeyDistributionRecord, SenderKeyRecord, SignalAddress } from '@signal/types'
import type { WaSenderKeyStore as WaSenderKeyStoreContract } from '@store/contracts/sender-key.store'
import { resolvePositive } from '@util/coercion'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_SENDER_KEY_STORE_LIMITS = Object.freeze({
    senderKeys: 8_192,
    senderDistributions: 8_192
})

export interface WaSenderKeyMemoryStoreOptions {
    readonly maxSenderKeys?: number
    readonly maxSenderDistributions?: number
}

export class SenderKeyMemoryStore implements WaSenderKeyStoreContract {
    protected readonly senderKeys: Map<string, SenderKeyRecord>
    protected readonly senderDistributions: Map<string, SenderKeyDistributionRecord>
    private readonly maxSenderKeys: number
    private readonly maxSenderDistributions: number

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
    }

    public async upsertSenderKey(record: SenderKeyRecord): Promise<void> {
        const key = this.makeKey(record.groupId, record.sender)
        setBoundedMapEntry(this.senderKeys, key, record, this.maxSenderKeys, this.onSenderKeyEvict)
        this.onEntryAccess(this.senderKeys, key)
    }

    public async upsertSenderKeyDistribution(record: SenderKeyDistributionRecord): Promise<void> {
        const key = this.makeKey(record.groupId, record.sender)
        setBoundedMapEntry(
            this.senderDistributions,
            key,
            record,
            this.maxSenderDistributions,
            this.onDistributionEvict
        )
        this.onEntryAccess(this.senderDistributions, key)
    }

    public async upsertSenderKeyDistributions(
        records: readonly SenderKeyDistributionRecord[]
    ): Promise<void> {
        for (const record of records) {
            const key = this.makeKey(record.groupId, record.sender)
            setBoundedMapEntry(
                this.senderDistributions,
                key,
                record,
                this.maxSenderDistributions,
                this.onDistributionEvict
            )
            this.onEntryAccess(this.senderDistributions, key)
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
        this.onEntryAccess(this.senderKeys, key)
        return record
    }

    public async getDeviceSenderKeyDistributions(
        groupId: string,
        senders: readonly SignalAddress[]
    ): Promise<readonly (SenderKeyDistributionRecord | null)[]> {
        const records = new Array<SenderKeyDistributionRecord | null>(senders.length)
        for (let index = 0; index < senders.length; index += 1) {
            const key = this.makeKey(groupId, senders[index])
            const record = this.senderDistributions.get(key)
            if (record === undefined) {
                records[index] = null
            } else {
                this.onEntryAccess(this.senderDistributions, key)
                records[index] = record
            }
        }
        return records
    }

    public async deleteDeviceSenderKey(target: SignalAddress, groupId?: string): Promise<number> {
        let deleted = 0
        deleted += this.deleteMatching(this.senderKeys, target, groupId)
        deleted += this.deleteMatching(this.senderDistributions, target, groupId)
        return deleted
    }

    public async markForgetSenderKey(
        groupId: string,
        participants: readonly SignalAddress[]
    ): Promise<number> {
        let deleted = 0
        for (let index = 0; index < participants.length; index += 1) {
            const participant = participants[index]
            deleted += this.deleteMatching(this.senderKeys, participant, groupId)
            deleted += this.deleteMatching(this.senderDistributions, participant, groupId)
        }
        return deleted
    }

    public async clear(): Promise<void> {
        this.senderKeys.clear()
        this.senderDistributions.clear()
        this.onEntriesClear()
    }

    /**
     * Runs with the map and key of every point-read hit and write (the group
     * scan does not count). No-op unless a subclass tracks access.
     */
    protected onEntryAccess(entries: Map<string, unknown>, key: string): void {}

    /** Runs with the map and key of every deleted or cap-evicted entry. */
    protected onEntryRemove(entries: Map<string, unknown>, key: string): void {}

    protected onEntriesClear(): void {}

    private readonly onSenderKeyEvict = (key: string): void =>
        this.onEntryRemove(this.senderKeys, key)

    private readonly onDistributionEvict = (key: string): void =>
        this.onEntryRemove(this.senderDistributions, key)

    private deleteMatching<T extends { groupId: string; sender: SignalAddress }>(
        map: Map<string, T>,
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
                this.onEntryRemove(map, key)
                deleted += 1
            }
        }
        return deleted
    }

    private makeKey(groupId: string, sender: SignalAddress): string {
        return `${groupId}|${signalAddressKey(sender)}`
    }
}
