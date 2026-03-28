import type { Binary } from 'mongodb'
import type { SenderKeyDistributionRecord, SenderKeyRecord, SignalAddress } from 'zapo-js/signal'
import { encodeSenderKeyRecord, decodeSenderKeyRecord, toSignalAddressParts } from 'zapo-js/signal'
import type { WaSenderKeyStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinary, toBinary } from './helpers'
import type { WaMongoStorageOptions } from './types'

interface SenderKeyDoc {
    _id: {
        session_id: string
        group_id: string
        sender_user: string
        sender_server: string
        sender_device: number
    }
    record: Binary
}

interface DistributionDoc {
    _id: {
        session_id: string
        group_id: string
        sender_user: string
        sender_server: string
        sender_device: number
    }
    key_id: number
    timestamp_ms: number
}

export class WaSenderKeyMongoStore extends BaseMongoStore implements WaSenderKeyStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
    }

    public async upsertSenderKey(record: SenderKeyRecord): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<SenderKeyDoc>('sender_keys')
        const sender = toSignalAddressParts(record.sender)
        await col.updateOne(
            {
                _id: {
                    session_id: this.sessionId,
                    group_id: record.groupId,
                    sender_user: sender.user,
                    sender_server: sender.server,
                    sender_device: sender.device
                }
            },
            { $set: { record: toBinary(encodeSenderKeyRecord(record)) } },
            { upsert: true }
        )
    }

    public async upsertSenderKeyDistribution(record: SenderKeyDistributionRecord): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<DistributionDoc>('sender_key_distribution')
        const sender = toSignalAddressParts(record.sender)
        await col.updateOne(
            {
                _id: {
                    session_id: this.sessionId,
                    group_id: record.groupId,
                    sender_user: sender.user,
                    sender_server: sender.server,
                    sender_device: sender.device
                }
            },
            {
                $set: {
                    key_id: record.keyId,
                    timestamp_ms: record.timestampMs
                }
            },
            { upsert: true }
        )
    }

    public async upsertSenderKeyDistributions(
        records: readonly SenderKeyDistributionRecord[]
    ): Promise<void> {
        if (records.length === 0) return
        await this.ensureIndexes()
        const col = this.col<DistributionDoc>('sender_key_distribution')
        const ops = records.map((record) => {
            const sender = toSignalAddressParts(record.sender)
            return {
                updateOne: {
                    filter: {
                        _id: {
                            session_id: this.sessionId,
                            group_id: record.groupId,
                            sender_user: sender.user,
                            sender_server: sender.server,
                            sender_device: sender.device
                        }
                    },
                    update: {
                        $set: {
                            key_id: record.keyId,
                            timestamp_ms: record.timestampMs
                        }
                    },
                    upsert: true
                }
            }
        })
        await col.bulkWrite(ops)
    }

    public async getGroupSenderKeyList(groupId: string): Promise<{
        readonly skList: readonly SenderKeyRecord[]
        readonly skDistribList: readonly SenderKeyDistributionRecord[]
    }> {
        await this.ensureIndexes()
        const skCol = this.col<SenderKeyDoc>('sender_keys')
        const distCol = this.col<DistributionDoc>('sender_key_distribution')

        const [senderDocs, distDocs] = await Promise.all([
            skCol
                .find({
                    '_id.session_id': this.sessionId,
                    '_id.group_id': groupId
                })
                .toArray(),
            distCol
                .find({
                    '_id.session_id': this.sessionId,
                    '_id.group_id': groupId
                })
                .toArray()
        ])

        const skList: SenderKeyRecord[] = senderDocs.map((doc) =>
            decodeSenderKeyRecord(fromBinary(doc.record), doc._id.group_id, {
                user: doc._id.sender_user,
                server: doc._id.sender_server,
                device: doc._id.sender_device
            })
        )

        const skDistribList: SenderKeyDistributionRecord[] = distDocs.map((doc) => ({
            groupId: doc._id.group_id,
            sender: {
                user: doc._id.sender_user,
                server: doc._id.sender_server,
                device: doc._id.sender_device
            },
            keyId: doc.key_id,
            timestampMs: doc.timestamp_ms
        }))

        return { skList, skDistribList }
    }

    public async getDeviceSenderKey(
        groupId: string,
        sender: SignalAddress
    ): Promise<SenderKeyRecord | null> {
        await this.ensureIndexes()
        const col = this.col<SenderKeyDoc>('sender_keys')
        const target = toSignalAddressParts(sender)
        const doc = await col.findOne({
            _id: {
                session_id: this.sessionId,
                group_id: groupId,
                sender_user: target.user,
                sender_server: target.server,
                sender_device: target.device
            }
        })
        if (!doc) return null
        return decodeSenderKeyRecord(fromBinary(doc.record), doc._id.group_id, {
            user: doc._id.sender_user,
            server: doc._id.sender_server,
            device: doc._id.sender_device
        })
    }

    public async getDeviceSenderKeyDistributions(
        groupId: string,
        senders: readonly SignalAddress[]
    ): Promise<readonly (SenderKeyDistributionRecord | null)[]> {
        if (senders.length === 0) return []
        await this.ensureIndexes()
        const col = this.col<DistributionDoc>('sender_key_distribution')
        const targets = senders.map((s) => toSignalAddressParts(s))
        const orFilters = targets.map((t) => ({
            '_id.session_id': this.sessionId,
            '_id.group_id': groupId,
            '_id.sender_user': t.user,
            '_id.sender_server': t.server,
            '_id.sender_device': t.device
        }))
        const docs = await col.find({ $or: orFilters }).toArray()
        const byKey = new Map<string, SenderKeyDistributionRecord>()
        for (const doc of docs) {
            const key = this.senderKey(
                doc._id.sender_user,
                doc._id.sender_server,
                doc._id.sender_device
            )
            byKey.set(key, {
                groupId: doc._id.group_id,
                sender: {
                    user: doc._id.sender_user,
                    server: doc._id.sender_server,
                    device: doc._id.sender_device
                },
                keyId: doc.key_id,
                timestampMs: doc.timestamp_ms
            })
        }
        return targets.map((t) => byKey.get(this.senderKey(t.user, t.server, t.device)) ?? null)
    }

    public async deleteDeviceSenderKey(target: SignalAddress, groupId?: string): Promise<number> {
        await this.ensureIndexes()
        const sender = toSignalAddressParts(target)
        const baseFilter: Record<string, unknown> = {
            '_id.session_id': this.sessionId,
            '_id.sender_user': sender.user,
            '_id.sender_server': sender.server,
            '_id.sender_device': sender.device
        }
        if (groupId !== undefined) {
            baseFilter['_id.group_id'] = groupId
        }
        const skCol = this.col<SenderKeyDoc>('sender_keys')
        const distCol = this.col<DistributionDoc>('sender_key_distribution')
        const [skResult, distResult] = await Promise.all([
            skCol.deleteMany(baseFilter),
            distCol.deleteMany(baseFilter)
        ])
        return skResult.deletedCount + distResult.deletedCount
    }

    public async markForgetSenderKey(
        groupId: string,
        participants: readonly SignalAddress[]
    ): Promise<number> {
        if (participants.length === 0) return 0
        await this.ensureIndexes()
        const targets = participants.map((p) => toSignalAddressParts(p))
        const orFilters = targets.map((t) => ({
            '_id.session_id': this.sessionId,
            '_id.group_id': groupId,
            '_id.sender_user': t.user,
            '_id.sender_server': t.server,
            '_id.sender_device': t.device
        }))
        const skCol = this.col<SenderKeyDoc>('sender_keys')
        const distCol = this.col<DistributionDoc>('sender_key_distribution')
        const [skResult, distResult] = await Promise.all([
            skCol.deleteMany({ $or: orFilters }),
            distCol.deleteMany({ $or: orFilters })
        ])
        return skResult.deletedCount + distResult.deletedCount
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        const skCol = this.col<SenderKeyDoc>('sender_keys')
        const distCol = this.col<DistributionDoc>('sender_key_distribution')
        await Promise.all([
            skCol.deleteMany({ '_id.session_id': this.sessionId }),
            distCol.deleteMany({ '_id.session_id': this.sessionId })
        ])
    }

    private senderKey(user: string, server: string, device: number): string {
        return `${user}|${server}|${device}`
    }
}
