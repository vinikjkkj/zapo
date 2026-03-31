import type { WaMessageSecretEntry, WaMessageSecretStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { deleteKeysChunked, scanKeys, toBytesOrNull, toRedisBuffer } from './helpers'
import type { WaRedisStorageOptions } from './types'

const DEFAULT_MESSAGE_SECRET_TTL_MS = 30 * 60 * 1000

export class WaMessageSecretRedisStore extends BaseRedisStore implements WaMessageSecretStore {
    private readonly ttlMs: number

    public constructor(options: WaRedisStorageOptions, ttlMs = DEFAULT_MESSAGE_SECRET_TTL_MS) {
        super(options)
        if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
            throw new Error('message-secret ttlMs must be a positive integer')
        }
        this.ttlMs = ttlMs
    }

    public async get(messageId: string, _nowMs?: number): Promise<WaMessageSecretEntry | null> {
        const key = this.k('msgsecret', this.sessionId, messageId)
        const pipeline = this.redis.pipeline()
        pipeline.hgetBuffer(key, 'secret')
        pipeline.hget(key, 'sender_jid')
        const results = await pipeline.exec()
        if (!results) return null
        const [errSecret, rawSecret] = results[0]
        const [errJid, rawJid] = results[1]
        if (errSecret || errJid) return null
        const secret = toBytesOrNull(rawSecret)
        if (!secret) return null
        return { secret, senderJid: typeof rawJid === 'string' ? rawJid : '' }
    }

    public async getBatch(
        messageIds: readonly string[],
        _nowMs?: number
    ): Promise<readonly (WaMessageSecretEntry | null)[]> {
        if (messageIds.length === 0) return []

        const pipeline = this.redis.pipeline()
        for (const messageId of messageIds) {
            const key = this.k('msgsecret', this.sessionId, messageId)
            pipeline.hgetBuffer(key, 'secret')
            pipeline.hget(key, 'sender_jid')
        }
        const results = await pipeline.exec()
        if (!results) return messageIds.map(() => null)

        return messageIds.map((_messageId, index) => {
            const base = index * 2
            const [errSecret, rawSecret] = results[base]
            const [errJid, rawJid] = results[base + 1]
            if (errSecret || errJid) return null
            const secret = toBytesOrNull(rawSecret)
            if (!secret) return null
            return { secret, senderJid: typeof rawJid === 'string' ? rawJid : '' }
        })
    }

    public async set(messageId: string, entry: WaMessageSecretEntry): Promise<void> {
        const key = this.k('msgsecret', this.sessionId, messageId)
        const multi = this.redis.multi()
        multi.hset(key, 'secret', toRedisBuffer(entry.secret), 'sender_jid', entry.senderJid)
        multi.pexpire(key, this.ttlMs)
        const results = await multi.exec()
        if (results) {
            for (const [err] of results) {
                if (err) throw err
            }
        }
    }

    public async setBatch(
        entries: readonly { readonly messageId: string; readonly entry: WaMessageSecretEntry }[]
    ): Promise<void> {
        if (entries.length === 0) return
        const multi = this.redis.multi()
        for (const e of entries) {
            const key = this.k('msgsecret', this.sessionId, e.messageId)
            multi.hset(
                key,
                'secret',
                toRedisBuffer(e.entry.secret),
                'sender_jid',
                e.entry.senderJid
            )
            multi.pexpire(key, this.ttlMs)
        }
        const results = await multi.exec()
        if (results) {
            for (const [err] of results) {
                if (err) throw err
            }
        }
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        const pattern = this.k('msgsecret', this.sessionId, '*')
        const keys = await scanKeys(this.redis, pattern)
        if (keys.length > 0) {
            await deleteKeysChunked(this.redis, keys)
        }
    }
}
