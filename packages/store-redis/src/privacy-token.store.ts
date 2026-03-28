import type { WaPrivacyTokenStore, WaStoredPrivacyTokenRecord } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { scanKeys, toBytesOrNull, toRedisBuffer, toStringOrNull } from './helpers'
import type { WaRedisStorageOptions } from './types'

const BINARY_FIELDS = ['tc_token', 'nct_salt'] as const

export class WaPrivacyTokenRedisStore extends BaseRedisStore implements WaPrivacyTokenStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    private tokenKey(jid: string): string {
        return this.k('privtoken', this.sessionId, jid)
    }

    public async upsert(record: WaStoredPrivacyTokenRecord): Promise<void> {
        const key = this.tokenKey(record.jid)

        const existing = await this.redis.hgetall(key)
        const newFields = recordToHash(record)

        const pipeline = this.redis.pipeline()

        if (existing && Object.keys(existing).length > 0) {
            const merged: Record<string, string> = { ...existing }
            for (const [field, value] of Object.entries(newFields)) {
                merged[field] = value
            }
            pipeline.hset(key, merged)
        } else {
            pipeline.hset(key, newFields)
        }

        if (record.tcToken !== undefined) {
            pipeline.set(`${key}:tc_token`, toRedisBuffer(record.tcToken))
        }
        if (record.nctSalt !== undefined) {
            pipeline.set(`${key}:nct_salt`, toRedisBuffer(record.nctSalt))
        }

        await pipeline.exec()
    }

    public async upsertBatch(records: readonly WaStoredPrivacyTokenRecord[]): Promise<void> {
        if (records.length === 0) return

        for (const record of records) {
            await this.upsert(record)
        }
    }

    public async getByJid(jid: string): Promise<WaStoredPrivacyTokenRecord | null> {
        const key = this.tokenKey(jid)

        const pipeline = this.redis.pipeline()
        pipeline.hgetall(key)
        for (const field of BINARY_FIELDS) {
            pipeline.getBuffer(`${key}:${field}`)
        }
        const results = await pipeline.exec()
        if (!results) return null

        const data = results[0][1] as Record<string, string>
        if (!data || Object.keys(data).length === 0) return null

        return hashToRecord(data, toBytesOrNull(results[1][1]), toBytesOrNull(results[2][1]))
    }

    public async deleteByJid(jid: string): Promise<number> {
        const key = this.tokenKey(jid)
        const pipeline = this.redis.pipeline()
        pipeline.del(key)
        for (const field of BINARY_FIELDS) {
            pipeline.del(`${key}:${field}`)
        }
        const results = await pipeline.exec()
        if (!results) return 0
        return (results[0][1] as number) > 0 ? 1 : 0
    }

    public async clear(): Promise<void> {
        const keys = await scanKeys(this.redis, this.k('privtoken', this.sessionId, '*'))
        if (keys.length === 0) return

        const pipeline = this.redis.pipeline()
        for (const key of keys) {
            pipeline.del(key)
        }
        await pipeline.exec()
    }
}

function recordToHash(record: WaStoredPrivacyTokenRecord): Record<string, string> {
    const fields: Record<string, string> = {
        jid: record.jid,
        updated_at_ms: String(record.updatedAtMs)
    }

    if (record.tcTokenTimestamp !== undefined) {
        fields.tc_token_timestamp = String(record.tcTokenTimestamp)
    }
    if (record.tcTokenSenderTimestamp !== undefined) {
        fields.tc_token_sender_timestamp = String(record.tcTokenSenderTimestamp)
    }

    return fields
}

function hashToRecord(
    data: Record<string, string>,
    tcToken: Uint8Array | null,
    nctSalt: Uint8Array | null
): WaStoredPrivacyTokenRecord {
    return {
        jid: data.jid,
        tcToken: tcToken ?? undefined,
        tcTokenTimestamp:
            toStringOrNull(data.tc_token_timestamp) !== null
                ? Number(data.tc_token_timestamp)
                : undefined,
        tcTokenSenderTimestamp:
            toStringOrNull(data.tc_token_sender_timestamp) !== null
                ? Number(data.tc_token_sender_timestamp)
                : undefined,
        nctSalt: nctSalt ?? undefined,
        updatedAtMs: Number(data.updated_at_ms)
    }
}
