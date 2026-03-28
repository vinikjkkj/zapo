import type { WaThreadStore, WaStoredThreadRecord } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { safeLimit, scanKeys, toStringOrNull } from './helpers'
import type { WaRedisStorageOptions } from './types'

function hashToRecord(data: Record<string, string>): WaStoredThreadRecord {
    return {
        jid: data.jid,
        name: toStringOrNull(data.name) ?? undefined,
        unreadCount:
            toStringOrNull(data.unread_count) !== null ? Number(data.unread_count) : undefined,
        archived: toStringOrNull(data.archived) !== null ? data.archived === '1' : undefined,
        pinned: toStringOrNull(data.pinned) !== null ? Number(data.pinned) : undefined,
        muteEndMs: toStringOrNull(data.mute_end_ms) !== null ? Number(data.mute_end_ms) : undefined,
        markedAsUnread:
            toStringOrNull(data.marked_as_unread) !== null
                ? data.marked_as_unread === '1'
                : undefined,
        ephemeralExpiration:
            toStringOrNull(data.ephemeral_expiration) !== null
                ? Number(data.ephemeral_expiration)
                : undefined
    }
}

function recordToHash(record: WaStoredThreadRecord): Record<string, string> {
    const fields: Record<string, string> = {
        jid: record.jid
    }

    if (record.name !== undefined) {
        fields.name = record.name
    }
    if (record.unreadCount !== undefined) {
        fields.unread_count = String(record.unreadCount)
    }
    if (record.archived !== undefined) {
        fields.archived = record.archived ? '1' : '0'
    }
    if (record.pinned !== undefined) {
        fields.pinned = String(record.pinned)
    }
    if (record.muteEndMs !== undefined) {
        fields.mute_end_ms = String(record.muteEndMs)
    }
    if (record.markedAsUnread !== undefined) {
        fields.marked_as_unread = record.markedAsUnread ? '1' : '0'
    }
    if (record.ephemeralExpiration !== undefined) {
        fields.ephemeral_expiration = String(record.ephemeralExpiration)
    }

    return fields
}

export class WaThreadRedisStore extends BaseRedisStore implements WaThreadStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    private threadKey(jid: string): string {
        return this.k('thread', this.sessionId, jid)
    }

    public async upsert(record: WaStoredThreadRecord): Promise<void> {
        const key = this.threadKey(record.jid)
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

    public async upsertBatch(records: readonly WaStoredThreadRecord[]): Promise<void> {
        if (records.length === 0) return

        for (const record of records) {
            await this.upsert(record)
        }
    }

    public async getByJid(jid: string): Promise<WaStoredThreadRecord | null> {
        const data = await this.redis.hgetall(this.threadKey(jid))
        if (!data || Object.keys(data).length === 0) return null
        return hashToRecord(data)
    }

    public async list(limit?: number): Promise<readonly WaStoredThreadRecord[]> {
        const resolved = safeLimit(limit, 100)
        const keys = await scanKeys(this.redis, this.k('thread', this.sessionId, '*'))

        const records: WaStoredThreadRecord[] = []
        for (const key of keys) {
            if (records.length >= resolved) break
            const data = await this.redis.hgetall(key)
            if (data && Object.keys(data).length > 0) {
                records.push(hashToRecord(data))
            }
        }
        return records
    }

    public async deleteByJid(jid: string): Promise<number> {
        return this.redis.del(this.threadKey(jid))
    }

    public async clear(): Promise<void> {
        const keys = await scanKeys(this.redis, this.k('thread', this.sessionId, '*'))
        if (keys.length === 0) return

        const pipeline = this.redis.pipeline()
        for (const key of keys) {
            pipeline.del(key)
        }
        await pipeline.exec()
    }
}
