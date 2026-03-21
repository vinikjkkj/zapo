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
    private readonly senderKeys: Map<string, SenderKeyRecord>
    private readonly senderDistributions: Map<string, SenderKeyDistributionRecord>
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
        setBoundedMapEntry(
            this.senderKeys,
            this.makeKey(record.groupId, record.sender),
            record,
            this.maxSenderKeys
        )
    }

    public async upsertSenderKeyDistribution(record: SenderKeyDistributionRecord): Promise<void> {
        setBoundedMapEntry(
            this.senderDistributions,
            this.makeKey(record.groupId, record.sender),
            record,
            this.maxSenderDistributions
        )
    }

    public async upsertSenderKeyDistributions(
        records: readonly SenderKeyDistributionRecord[]
    ): Promise<void> {
        for (const record of records) {
            setBoundedMapEntry(
                this.senderDistributions,
                this.makeKey(record.groupId, record.sender),
                record,
                this.maxSenderDistributions
            )
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
        const record = this.senderKeys.get(this.makeKey(groupId, sender))
        return record ?? null
    }

    public async getDeviceSenderKeyDistribution(
        groupId: string,
        sender: SignalAddress
    ): Promise<SenderKeyDistributionRecord | null> {
        const record = this.senderDistributions.get(this.makeKey(groupId, sender))
        return record ?? null
    }

    public async getDeviceSenderKeyDistributions(
        groupId: string,
        senders: readonly SignalAddress[]
    ): Promise<readonly (SenderKeyDistributionRecord | null)[]> {
        return senders.map(
            (sender) => this.senderDistributions.get(this.makeKey(groupId, sender)) ?? null
        )
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
        for (const participant of participants) {
            deleted += await this.deleteDeviceSenderKey(participant, groupId)
        }
        return deleted
    }

    public async clear(): Promise<void> {
        this.senderKeys.clear()
        this.senderDistributions.clear()
    }

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
                deleted += 1
            }
        }
        return deleted
    }

    private makeKey(groupId: string, sender: SignalAddress): string {
        return `${groupId}|${signalAddressKey(sender)}`
    }
}
