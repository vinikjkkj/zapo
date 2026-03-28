import type { WaContactStore, WaStoredContactRecord } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { scanKeys, toStringOrNull } from './helpers'
import type { WaRedisStorageOptions } from './types'

function hashToRecord(data: Record<string, string>): WaStoredContactRecord {
    return {
        jid: data.jid,
        displayName: toStringOrNull(data.display_name) ?? undefined,
        pushName: toStringOrNull(data.push_name) ?? undefined,
        lid: toStringOrNull(data.lid) ?? undefined,
        phoneNumber: toStringOrNull(data.phone_number) ?? undefined,
        lastUpdatedMs: Number(data.last_updated_ms)
    }
}

function recordToHash(record: WaStoredContactRecord): Record<string, string> {
    const fields: Record<string, string> = {
        jid: record.jid,
        last_updated_ms: String(record.lastUpdatedMs)
    }

    if (record.displayName !== undefined) {
        fields.display_name = record.displayName
    }
    if (record.pushName !== undefined) {
        fields.push_name = record.pushName
    }
    if (record.lid !== undefined) {
        fields.lid = record.lid
    }
    if (record.phoneNumber !== undefined) {
        fields.phone_number = record.phoneNumber
    }

    return fields
}

export class WaContactRedisStore extends BaseRedisStore implements WaContactStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    private contactKey(jid: string): string {
        return this.k('contact', this.sessionId, jid)
    }

    public async upsert(record: WaStoredContactRecord): Promise<void> {
        const key = this.contactKey(record.jid)
        const existing = await this.redis.hgetall(key)
        const newFields = recordToHash(record)

        if (existing && Object.keys(existing).length > 0) {
            const merged: Record<string, string> = { ...existing }
            for (const [field, value] of Object.entries(newFields)) {
                merged[field] = value
            }
            await this.redis.hset(key, merged)
        } else {
            await this.redis.hset(key, newFields)
        }
    }

    public async upsertBatch(records: readonly WaStoredContactRecord[]): Promise<void> {
        if (records.length === 0) return

        for (const record of records) {
            await this.upsert(record)
        }
    }

    public async getByJid(jid: string): Promise<WaStoredContactRecord | null> {
        const data = await this.redis.hgetall(this.contactKey(jid))
        if (!data || Object.keys(data).length === 0) return null
        return hashToRecord(data)
    }

    public async deleteByJid(jid: string): Promise<number> {
        return this.redis.del(this.contactKey(jid))
    }

    public async clear(): Promise<void> {
        const keys = await scanKeys(this.redis, this.k('contact', this.sessionId, '*'))
        if (keys.length === 0) return

        const pipeline = this.redis.pipeline()
        for (const key of keys) {
            pipeline.del(key)
        }
        await pipeline.exec()
    }
}
