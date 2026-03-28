import type { WaMessageStore, WaStoredMessageRecord } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { safeLimit, scanKeys, toBytesOrNull, toRedisBuffer, toStringOrNull } from './helpers'
import type { WaRedisStorageOptions } from './types'

const BINARY_FIELDS = ['plaintext', 'message_bytes'] as const

export class WaMessageRedisStore extends BaseRedisStore implements WaMessageStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    private msgKey(messageId: string): string {
        return this.k('msg', this.sessionId, messageId)
    }

    private idxKey(threadJid: string): string {
        return this.k('msg:idx', this.sessionId, threadJid)
    }

    public async upsert(record: WaStoredMessageRecord): Promise<void> {
        const key = this.msgKey(record.id)
        const idxKey = this.idxKey(record.threadJid)
        const score = record.timestampMs ?? 0

        // Check if thread changed to remove stale index entry
        const existing = await this.redis.hget(key, 'thread_jid')

        const pipeline = this.redis.pipeline()
        if (existing && existing !== record.threadJid) {
            pipeline.zrem(this.idxKey(existing), record.id)
        }
        pipeline.hset(key, recordToHash(record))
        pipeline.zadd(idxKey, String(score), record.id)

        if (record.plaintext !== undefined) {
            pipeline.set(`${key}:plaintext`, toRedisBuffer(record.plaintext))
        }
        if (record.messageBytes !== undefined) {
            pipeline.set(`${key}:message_bytes`, toRedisBuffer(record.messageBytes))
        }

        await pipeline.exec()
    }

    public async upsertBatch(records: readonly WaStoredMessageRecord[]): Promise<void> {
        if (records.length === 0) return

        // Read existing thread_jid for each record to detect changes
        const readPipeline = this.redis.pipeline()
        for (const record of records) {
            readPipeline.hget(this.msgKey(record.id), 'thread_jid')
        }
        const existingResults = await readPipeline.exec()

        const pipeline = this.redis.pipeline()
        for (let i = 0; i < records.length; i += 1) {
            const record = records[i]
            const key = this.msgKey(record.id)
            const idxKey = this.idxKey(record.threadJid)
            const score = record.timestampMs ?? 0

            // Remove stale thread index entry if thread changed
            if (existingResults) {
                const [err, oldThreadJid] = existingResults[i]
                if (!err && oldThreadJid && oldThreadJid !== record.threadJid) {
                    pipeline.zrem(this.idxKey(oldThreadJid as string), record.id)
                }
            }

            pipeline.hset(key, recordToHash(record))
            pipeline.zadd(idxKey, String(score), record.id)

            if (record.plaintext !== undefined) {
                pipeline.set(`${key}:plaintext`, toRedisBuffer(record.plaintext))
            }
            if (record.messageBytes !== undefined) {
                pipeline.set(`${key}:message_bytes`, toRedisBuffer(record.messageBytes))
            }
        }
        await pipeline.exec()
    }

    public async getById(id: string): Promise<WaStoredMessageRecord | null> {
        const key = this.msgKey(id)

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

    public async listByThread(
        threadJid: string,
        limit?: number,
        beforeTimestampMs?: number
    ): Promise<readonly WaStoredMessageRecord[]> {
        const resolved = safeLimit(limit, 50)
        const idxKey = this.idxKey(threadJid)

        let messageIds: string[]
        if (beforeTimestampMs !== undefined) {
            messageIds = await this.redis.zrevrangebyscore(
                idxKey,
                String(beforeTimestampMs - 1),
                '-inf',
                'LIMIT',
                0,
                resolved
            )
        } else {
            messageIds = await this.redis.zrevrangebyscore(
                idxKey,
                '+inf',
                '-inf',
                'LIMIT',
                0,
                resolved
            )
        }

        if (messageIds.length === 0) return []

        const pipeline = this.redis.pipeline()
        for (const msgId of messageIds) {
            const key = this.msgKey(msgId)
            pipeline.hgetall(key)
            for (const field of BINARY_FIELDS) {
                pipeline.getBuffer(`${key}:${field}`)
            }
        }
        const results = await pipeline.exec()

        const stride = 1 + BINARY_FIELDS.length
        const records: WaStoredMessageRecord[] = []
        if (results) {
            for (let i = 0; i < results.length; i += stride) {
                const [err, data] = results[i]
                if (err) continue
                const hash = data as Record<string, string>
                if (hash && Object.keys(hash).length > 0) {
                    records.push(
                        hashToRecord(
                            hash,
                            toBytesOrNull(results[i + 1][1]),
                            toBytesOrNull(results[i + 2][1])
                        )
                    )
                }
            }
        }
        return records
    }

    public async deleteById(id: string): Promise<number> {
        const key = this.msgKey(id)
        const data = await this.redis.hgetall(key)
        if (!data || Object.keys(data).length === 0) return 0

        const threadJid = data.thread_jid
        const pipeline = this.redis.pipeline()
        pipeline.del(key)
        for (const field of BINARY_FIELDS) {
            pipeline.del(`${key}:${field}`)
        }
        pipeline.zrem(this.idxKey(threadJid), id)
        await pipeline.exec()
        return 1
    }

    public async clear(): Promise<void> {
        const msgKeys = await scanKeys(this.redis, this.k('msg', this.sessionId, '*'))
        const idxKeys = await scanKeys(this.redis, this.k('msg:idx', this.sessionId, '*'))
        const allKeys = [...msgKeys, ...idxKeys]
        if (allKeys.length === 0) return

        const pipeline = this.redis.pipeline()
        for (const key of allKeys) {
            pipeline.del(key)
        }
        await pipeline.exec()
    }
}

function recordToHash(record: WaStoredMessageRecord): Record<string, string> {
    const fields: Record<string, string> = {
        id: record.id,
        thread_jid: record.threadJid,
        from_me: record.fromMe ? '1' : '0'
    }

    if (record.senderJid !== undefined) {
        fields.sender_jid = record.senderJid
    }
    if (record.participantJid !== undefined) {
        fields.participant_jid = record.participantJid
    }
    if (record.timestampMs !== undefined) {
        fields.timestamp_ms = String(record.timestampMs)
    }
    if (record.encType !== undefined) {
        fields.enc_type = record.encType
    }

    return fields
}

function hashToRecord(
    data: Record<string, string>,
    plaintext: Uint8Array | null,
    messageBytes: Uint8Array | null
): WaStoredMessageRecord {
    return {
        id: data.id,
        threadJid: data.thread_jid,
        senderJid: toStringOrNull(data.sender_jid) ?? undefined,
        participantJid: toStringOrNull(data.participant_jid) ?? undefined,
        fromMe: data.from_me === '1',
        timestampMs:
            toStringOrNull(data.timestamp_ms) !== null ? Number(data.timestamp_ms) : undefined,
        encType: toStringOrNull(data.enc_type) ?? undefined,
        plaintext: plaintext ?? undefined,
        messageBytes: messageBytes ?? undefined
    }
}
