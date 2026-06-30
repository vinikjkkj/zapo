import {
    decodeSenderKeyRecord,
    encodeSenderKeyRecord,
    type SenderKeyDistributionRecord,
    type SenderKeyRecord,
    type SignalAddress,
    toSignalAddressParts
} from 'zapo-js/signal'
import type { WaSenderKeyStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { deleteKeysChunked, scanKeys, toRedisBuffer } from './helpers'
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
        await this.refreshTtl([key, groupIdxKey])
    }

    public async upsertSenderKeyDistribution(record: SenderKeyDistributionRecord): Promise<void> {
        const sender = toSignalAddressParts(record.sender)
        const hashKey = this.k('skd', this.sessionId, record.groupId)
        const field = `${sender.user}:${sender.server}:${sender.device}`
        await this.redis.hset(hashKey, field, `${record.keyId}:${record.timestampMs}`)
        await this.refreshTtl([hashKey])
    }

    public async upsertSenderKeyDistributions(
        records: readonly SenderKeyDistributionRecord[]
    ): Promise<void> {
        if (records.length === 0) return
        // Group by (sessionId, groupId) so each group commits a single
        // multi-field HSET instead of one HSET per record.
        const byGroupKey = new Map<string, string[]>()
        for (const record of records) {
            const sender = toSignalAddressParts(record.sender)
            const hashKey = this.k('skd', this.sessionId, record.groupId)
            const args = byGroupKey.get(hashKey) ?? []
            args.push(
                `${sender.user}:${sender.server}:${sender.device}`,
                `${record.keyId}:${record.timestampMs}`
            )
            byGroupKey.set(hashKey, args)
        }
        if (byGroupKey.size === 1) {
            const [hashKey, args] = byGroupKey.entries().next().value as [string, string[]]
            await this.redis.hset(hashKey, ...args)
            await this.refreshTtl([hashKey])
            return
        }
        const pipeline = this.redis.pipeline()
        for (const [hashKey, args] of byGroupKey) {
            pipeline.hset(hashKey, ...args)
        }
        this.touch(pipeline, [...byGroupKey.keys()])
        await pipeline.exec()
    }

    public async getGroupSenderKeyList(groupId: string): Promise<{
        readonly skList: readonly SenderKeyRecord[]
        readonly skDistribList: readonly SenderKeyDistributionRecord[]
    }> {
        const groupIdxKey = this.k('sk:grp', this.sessionId, groupId)
        const skdHashKey = this.k('skd', this.sessionId, groupId)
        const [members, skdAll] = await Promise.all([
            this.redis.smembers(groupIdxKey),
            this.redis.hgetall(skdHashKey)
        ])

        const skKeys: string[] = []
        const skList: SenderKeyRecord[] = []
        if (members.length > 0) {
            const skPipeline = this.redis.pipeline()
            const parsedMembers: { user: string; server: string; device: number }[] = []
            for (const member of members) {
                const parts = member.split(':')
                const user = parts[0]
                const server = parts[1]
                const device = Number(parts[2])
                parsedMembers.push({ user, server, device })
                const skKey = this.k('sk', this.sessionId, groupId, user, server, String(device))
                skKeys.push(skKey)
                skPipeline.getBuffer(skKey)
            }
            const skResults = await skPipeline.exec()
            if (skResults) {
                for (let i = 0; i < skResults.length; i += 1) {
                    const [err, data] = skResults[i]
                    if (err || !data) continue
                    const m = parsedMembers[i]
                    skList.push(
                        decodeSenderKeyRecord(new Uint8Array(data as Uint8Array), groupId, m)
                    )
                }
            }
        }

        const skDistribList: SenderKeyDistributionRecord[] = []
        for (const [field, value] of Object.entries(skdAll)) {
            const colonIdx = value.indexOf(':')
            if (colonIdx === -1) continue
            const parts = field.split(':')
            skDistribList.push({
                groupId,
                sender: { user: parts[0], server: parts[1], device: Number(parts[2]) },
                keyId: Number(value.slice(0, colonIdx)),
                timestampMs: Number(value.slice(colonIdx + 1))
            })
        }

        await this.refreshTtl([groupIdxKey, skdHashKey, ...skKeys])
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
        await this.refreshTtl([key])
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
        // Single HGETALL on the group hash returns every member's
        // distribution in one round-trip; previous layout issued one
        // HGETALL per member which dominated the redis call profile.
        const hashKey = this.k('skd', this.sessionId, groupId)
        const all = await this.redis.hgetall(hashKey)
        if (Object.keys(all).length > 0) {
            await this.refreshTtl([hashKey])
        }
        const out = new Array<SenderKeyDistributionRecord | null>(senders.length)
        for (let i = 0; i < senders.length; i += 1) {
            const t = toSignalAddressParts(senders[i])
            const field = `${t.user}:${t.server}:${t.device}`
            const value = all[field]
            if (!value) {
                out[i] = null
                continue
            }
            const colonIdx = value.indexOf(':')
            if (colonIdx === -1) {
                out[i] = null
                continue
            }
            out[i] = {
                groupId,
                sender: { user: t.user, server: t.server, device: t.device },
                keyId: Number(value.slice(0, colonIdx)),
                timestampMs: Number(value.slice(colonIdx + 1))
            }
        }
        return out
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
            const skdHashKey = this.k('skd', this.sessionId, groupId)
            const groupIdxKey = this.k('sk:grp', this.sessionId, groupId)
            const pipeline = this.redis.pipeline()
            pipeline.del(skKey)
            pipeline.hdel(skdHashKey, memberKey)
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
            const skdHashKey = this.k('skd', this.sessionId, grpId)
            const pipeline = this.redis.pipeline()
            pipeline.del(skKey)
            pipeline.hdel(skdHashKey, memberKey)
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
        const skdHashKey = this.k('skd', this.sessionId, groupId)
        const memberKeys: string[] = []
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
            memberKeys.push(`${sender.user}:${sender.server}:${sender.device}`)
            pipeline.del(skKey)
        }
        // Bulk HDEL + SREM with the full member list — one redis command each
        // instead of one per participant.
        pipeline.hdel(skdHashKey, ...memberKeys)
        pipeline.srem(groupIdxKey, ...memberKeys)
        const results = await pipeline.exec()
        let total = 0
        if (results) {
            // First `participants.length` results are the DELs on sk keys.
            for (let i = 0; i < participants.length; i += 1) {
                const [err, val] = results[i]
                if (!err) total += Number(val)
            }
            // Then the HDEL result (number of fields removed).
            const [hdelErr, hdelVal] = results[participants.length]
            if (!hdelErr) total += Number(hdelVal)
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
            await deleteKeysChunked(this.redis, allKeys)
        }
    }
}
