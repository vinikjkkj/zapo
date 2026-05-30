import { isUserJid } from 'zapo-js'
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

    private phoneLookupKey(pn: string): string {
        return this.k('contact_pn', this.sessionId, pn)
    }

    public async upsert(record: WaStoredContactRecord): Promise<void> {
        const key = this.contactKey(record.jid)
        const existing = await this.redis.hgetall(key)
        const newFields = recordToHash(record)

        let mergedRecord: WaStoredContactRecord
        const previousPhone =
            existing && Object.keys(existing).length > 0
                ? (toStringOrNull(existing.phone_number) ?? undefined)
                : undefined
        if (existing && Object.keys(existing).length > 0) {
            const merged: Record<string, string> = { ...existing }
            for (const [field, value] of Object.entries(newFields)) {
                merged[field] = value
            }
            await this.redis.hset(key, merged)
            mergedRecord = hashToRecord(merged)
        } else {
            await this.redis.hset(key, newFields)
            mergedRecord = hashToRecord(newFields)
        }

        if (previousPhone && previousPhone !== mergedRecord.phoneNumber) {
            const staleKey = this.phoneLookupKey(previousPhone)
            const owner = await this.redis.get(staleKey)
            if (owner === mergedRecord.jid) {
                await this.redis.del(staleKey)
            }
        }
        if (mergedRecord.phoneNumber) {
            await this.redis.set(this.phoneLookupKey(mergedRecord.phoneNumber), mergedRecord.jid)
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
        if (data && Object.keys(data).length > 0) {
            return hashToRecord(data)
        }
        if (isUserJid(jid)) {
            return this.getByPhoneNumber(jid)
        }
        return null
    }

    public async getByPhoneNumber(pn: string): Promise<WaStoredContactRecord | null> {
        const targetJid = await this.redis.get(this.phoneLookupKey(pn))
        if (!targetJid) return null
        const data = await this.redis.hgetall(this.contactKey(targetJid))
        if (!data || Object.keys(data).length === 0) return null
        return hashToRecord(data)
    }

    public async deleteByJid(jid: string): Promise<number> {
        const existing = await this.redis.hgetall(this.contactKey(jid))
        const deleted = await this.redis.del(this.contactKey(jid))
        if (existing && existing.phone_number) {
            const lookupKey = this.phoneLookupKey(existing.phone_number)
            const owner = await this.redis.get(lookupKey)
            if (owner === jid) {
                await this.redis.del(lookupKey)
            }
        }
        return deleted
    }

    public async clear(): Promise<void> {
        const contactKeys = await scanKeys(this.redis, this.k('contact', this.sessionId, '*'))
        const phoneKeys = await scanKeys(this.redis, this.k('contact_pn', this.sessionId, '*'))
        const all = [...contactKeys, ...phoneKeys]
        if (all.length === 0) return

        const pipeline = this.redis.pipeline()
        for (const key of all) {
            pipeline.del(key)
        }
        await pipeline.exec()
    }
}
