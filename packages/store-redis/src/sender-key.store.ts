import type { SenderKeyDistributionRecord, SenderKeyRecord, SignalAddress } from 'zapo-js/signal'
import { encodeSenderKeyRecord, decodeSenderKeyRecord, toSignalAddressParts } from 'zapo-js/signal'
import type { WaSenderKeyStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { scanKeys, toRedisBuffer } from './helpers'
import type { WaRedisStorageOptions } from './types'

export class WaSenderKeyRedisStore extends BaseRedisStore implements WaSenderKeyStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    public async upsertSenderKey(record: SenderKeyRecord): Promise<void> {
        const sender = toSignalAddressParts(record.sender)
        const key = this.k(
            'sk',
            this.sessionId,
            record.groupId,
            sender.user,
            sender.server,
            String(sender.device)
        )
        const encoded = encodeSenderKeyRecord(record)
        await this.redis.set(key, toRedisBuffer(encoded))

        const groupIdxKey = this.k('sk:grp', this.sessionId, record.groupId)
        await this.redis.sadd(groupIdxKey, `${sender.user}:${sender.server}:${sender.device}`)
    }

    public async upsertSenderKeyDistribution(record: SenderKeyDistributionRecord): Promise<void> {
        const sender = toSignalAddressParts(record.sender)
        const key = this.k(
            'skd',
            this.sessionId,
            record.groupId,
            sender.user,
            sender.server,
            String(sender.device)
        )
        await this.redis.hset(key, {
            key_id: String(record.keyId),
            timestamp_ms: String(record.timestampMs)
        })

        const groupIdxKey = this.k('sk:grp', this.sessionId, record.groupId)
        await this.redis.sadd(groupIdxKey, `${sender.user}:${sender.server}:${sender.device}`)
    }

    public async upsertSenderKeyDistributions(
        records: readonly SenderKeyDistributionRecord[]
    ): Promise<void> {
        if (records.length === 0) return
        const pipeline = this.redis.pipeline()
        for (const record of records) {
            const sender = toSignalAddressParts(record.sender)
            const key = this.k(
                'skd',
                this.sessionId,
                record.groupId,
                sender.user,
                sender.server,
                String(sender.device)
            )
            pipeline.hset(key, {
                key_id: String(record.keyId),
                timestamp_ms: String(record.timestampMs)
            })
            const groupIdxKey = this.k('sk:grp', this.sessionId, record.groupId)
            pipeline.sadd(groupIdxKey, `${sender.user}:${sender.server}:${sender.device}`)
        }
        await pipeline.exec()
    }

    public async getGroupSenderKeyList(groupId: string): Promise<{
        readonly skList: readonly SenderKeyRecord[]
        readonly skDistribList: readonly SenderKeyDistributionRecord[]
    }> {
        const groupIdxKey = this.k('sk:grp', this.sessionId, groupId)
        const members = await this.redis.smembers(groupIdxKey)
        if (members.length === 0) {
            return { skList: [], skDistribList: [] }
        }

        const skPipeline = this.redis.pipeline()
        const skdPipeline = this.redis.pipeline()
        const parsedMembers: { user: string; server: string; device: number }[] = []

        for (const member of members) {
            const parts = member.split(':')
            const user = parts[0]
            const server = parts[1]
            const device = Number(parts[2])
            parsedMembers.push({ user, server, device })
            skPipeline.getBuffer(
                this.k('sk', this.sessionId, groupId, user, server, String(device))
            )
            skdPipeline.hgetall(
                this.k('skd', this.sessionId, groupId, user, server, String(device))
            )
        }

        const [skResults, skdResults] = await Promise.all([skPipeline.exec(), skdPipeline.exec()])

        const skList: SenderKeyRecord[] = []
        const skDistribList: SenderKeyDistributionRecord[] = []

        if (skResults) {
            for (let i = 0; i < skResults.length; i += 1) {
                const [err, data] = skResults[i]
                if (err || !data) continue
                const m = parsedMembers[i]
                skList.push(
                    decodeSenderKeyRecord(new Uint8Array(data as Uint8Array), groupId, {
                        user: m.user,
                        server: m.server,
                        device: m.device
                    })
                )
            }
        }

        if (skdResults) {
            for (let i = 0; i < skdResults.length; i += 1) {
                const [err, data] = skdResults[i]
                if (err || !data || typeof data !== 'object') continue
                const record = data as Record<string, string>
                if (Object.keys(record).length === 0) continue
                const m = parsedMembers[i]
                skDistribList.push({
                    groupId,
                    sender: { user: m.user, server: m.server, device: m.device },
                    keyId: Number(record.key_id),
                    timestampMs: Number(record.timestamp_ms)
                })
            }
        }

        return { skList, skDistribList }
    }

    public async getDeviceSenderKey(
        groupId: string,
        sender: SignalAddress
    ): Promise<SenderKeyRecord | null> {
        const target = toSignalAddressParts(sender)
        const key = this.k(
            'sk',
            this.sessionId,
            groupId,
            target.user,
            target.server,
            String(target.device)
        )
        const data = await this.redis.getBuffer(key)
        if (!data) return null
        return decodeSenderKeyRecord(new Uint8Array(data), groupId, {
            user: target.user,
            server: target.server,
            device: target.device
        })
    }

    public async getDeviceSenderKeyDistributions(
        groupId: string,
        senders: readonly SignalAddress[]
    ): Promise<readonly (SenderKeyDistributionRecord | null)[]> {
        if (senders.length === 0) return []
        const targets = senders.map((s) => toSignalAddressParts(s))
        const pipeline = this.redis.pipeline()
        for (const t of targets) {
            pipeline.hgetall(
                this.k('skd', this.sessionId, groupId, t.user, t.server, String(t.device))
            )
        }
        const results = await pipeline.exec()
        if (!results) return senders.map(() => null)

        return targets.map((t, index) => {
            const [err, data] = results[index]
            if (err || !data || typeof data !== 'object') return null
            const record = data as Record<string, string>
            if (Object.keys(record).length === 0) return null
            return {
                groupId,
                sender: { user: t.user, server: t.server, device: t.device },
                keyId: Number(record.key_id),
                timestampMs: Number(record.timestamp_ms)
            }
        })
    }

    public async deleteDeviceSenderKey(target: SignalAddress, groupId?: string): Promise<number> {
        const sender = toSignalAddressParts(target)
        const memberKey = `${sender.user}:${sender.server}:${sender.device}`

        if (groupId !== undefined) {
            const skKey = this.k(
                'sk',
                this.sessionId,
                groupId,
                sender.user,
                sender.server,
                String(sender.device)
            )
            const skdKey = this.k(
                'skd',
                this.sessionId,
                groupId,
                sender.user,
                sender.server,
                String(sender.device)
            )
            const groupIdxKey = this.k('sk:grp', this.sessionId, groupId)
            const pipeline = this.redis.pipeline()
            pipeline.del(skKey)
            pipeline.del(skdKey)
            pipeline.srem(groupIdxKey, memberKey)
            const results = await pipeline.exec()
            if (!results) return 0
            let total = 0
            for (const [err, val] of results.slice(0, 2)) {
                if (!err) total += Number(val)
            }
            return total
        }

        const pattern = this.k('sk:grp', this.sessionId, '*')
        const groupIdxKeys = await scanKeys(this.redis, pattern)
        const grpPrefix = this.k('sk:grp', this.sessionId, '')
        let total = 0
        for (const idxKey of groupIdxKeys) {
            const isMember = await this.redis.sismember(idxKey, memberKey)
            if (!isMember) continue
            const grpId = idxKey.substring(grpPrefix.length)
            const skKey = this.k(
                'sk',
                this.sessionId,
                grpId,
                sender.user,
                sender.server,
                String(sender.device)
            )
            const skdKey = this.k(
                'skd',
                this.sessionId,
                grpId,
                sender.user,
                sender.server,
                String(sender.device)
            )
            const pipeline = this.redis.pipeline()
            pipeline.del(skKey)
            pipeline.del(skdKey)
            pipeline.srem(idxKey, memberKey)
            const results = await pipeline.exec()
            if (results) {
                for (const [err, val] of results.slice(0, 2)) {
                    if (!err) total += Number(val)
                }
            }
        }
        return total
    }

    public async markForgetSenderKey(
        groupId: string,
        participants: readonly SignalAddress[]
    ): Promise<number> {
        if (participants.length === 0) return 0
        const groupIdxKey = this.k('sk:grp', this.sessionId, groupId)
        let total = 0
        const pipeline = this.redis.pipeline()
        for (const participant of participants) {
            const sender = toSignalAddressParts(participant)
            const skKey = this.k(
                'sk',
                this.sessionId,
                groupId,
                sender.user,
                sender.server,
                String(sender.device)
            )
            const skdKey = this.k(
                'skd',
                this.sessionId,
                groupId,
                sender.user,
                sender.server,
                String(sender.device)
            )
            const memberKey = `${sender.user}:${sender.server}:${sender.device}`
            pipeline.del(skKey)
            pipeline.del(skdKey)
            pipeline.srem(groupIdxKey, memberKey)
        }
        const results = await pipeline.exec()
        if (results) {
            for (let i = 0; i < results.length; i += 1) {
                const step = i % 3
                if (step < 2) {
                    const [err, val] = results[i]
                    if (!err) total += Number(val)
                }
            }
        }
        return total
    }

    public async clear(): Promise<void> {
        const patterns = [
            this.k('sk', this.sessionId, '*'),
            this.k('skd', this.sessionId, '*'),
            this.k('sk:grp', this.sessionId, '*')
        ]
        const scannedKeys = await Promise.all(patterns.map((p) => scanKeys(this.redis, p)))
        const allKeys = scannedKeys.flat()
        if (allKeys.length > 0) {
            await this.redis.del(...allKeys)
        }
    }
}
