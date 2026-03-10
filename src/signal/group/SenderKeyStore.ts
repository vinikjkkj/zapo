import { WA_DEFAULTS } from '../../protocol/constants'
import type {
    SenderKeyDistributionRecord,
    SenderKeyRecord,
    SignalAddress
} from '../../signal/types'

export class SenderKeyStore {
    private readonly senderKeys: Map<string, SenderKeyRecord>
    private readonly senderDistributions: Map<string, SenderKeyDistributionRecord>

    public constructor() {
        this.senderKeys = new Map()
        this.senderDistributions = new Map()
    }

    public async upsertSenderKey(record: SenderKeyRecord): Promise<void> {
        this.senderKeys.set(this.makeKey(record.groupId, record.sender), record)
    }

    public async upsertSenderKeyDistribution(record: SenderKeyDistributionRecord): Promise<void> {
        this.senderDistributions.set(this.makeKey(record.groupId, record.sender), record)
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

    private deleteMatching<T extends { groupId: string; sender: SignalAddress }>(
        map: Map<string, T>,
        target: SignalAddress,
        groupId?: string
    ): number {
        let deleted = 0
        for (const [key, record] of map.entries()) {
            const sameGroup = groupId ? record.groupId === groupId : true
            const sameUser = record.sender.user === target.user
            const sameServer =
                (record.sender.server ?? WA_DEFAULTS.HOST_DOMAIN) ===
                (target.server ?? WA_DEFAULTS.HOST_DOMAIN)
            const sameDevice = record.sender.device === target.device
            if (sameGroup && sameUser && sameServer && sameDevice) {
                map.delete(key)
                deleted += 1
            }
        }
        return deleted
    }

    private makeKey(groupId: string, sender: SignalAddress): string {
        const server = sender.server ?? WA_DEFAULTS.HOST_DOMAIN
        return `${groupId}|${sender.user}|${server}|${sender.device}`
    }
}
