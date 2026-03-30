import type { Binary } from 'mongodb'
import type { WaMessageSecretStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinary, toBinary } from './helpers'
import type { WaMongoStorageOptions } from './types'

interface MessageSecretDoc {
    _id: { session_id: string; message_id: string }
    secret: Binary
    expires_at: Date
}

const DEFAULT_MESSAGE_SECRET_TTL_MS = 30 * 60 * 1000

export class WaMessageSecretMongoStore extends BaseMongoStore implements WaMessageSecretStore {
    private readonly ttlMs: number

    public constructor(options: WaMongoStorageOptions, ttlMs = DEFAULT_MESSAGE_SECRET_TTL_MS) {
        super(options)
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('message-secret ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    protected override async createIndexes(): Promise<void> {
        const col = this.col<MessageSecretDoc>('message_secrets_cache')
        await col.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
    }

    public async get(messageId: string, nowMs = Date.now()): Promise<Uint8Array | null> {
        await this.ensureIndexes()
        const col = this.col<MessageSecretDoc>('message_secrets_cache')
        const doc = await col.findOne({
            _id: { session_id: this.sessionId, message_id: messageId },
            expires_at: { $gt: new Date(nowMs) }
        })
        if (!doc) return null
        return fromBinary(doc.secret)
    }

    public async getBatch(
        messageIds: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (Uint8Array | null)[]> {
        if (messageIds.length === 0) return []
        await this.ensureIndexes()
        const col = this.col<MessageSecretDoc>('message_secrets_cache')
        const uniqueIds = [...new Set(messageIds)]
        const docs = await col
            .find({
                '_id.session_id': this.sessionId,
                '_id.message_id': { $in: uniqueIds },
                expires_at: { $gt: new Date(nowMs) }
            })
            .toArray()

        const byMessageId = new Map<string, Uint8Array>()
        for (const doc of docs) {
            byMessageId.set(doc._id.message_id, fromBinary(doc.secret))
        }
        return messageIds.map((id) => byMessageId.get(id) ?? null)
    }

    public async set(messageId: string, secret: Uint8Array): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<MessageSecretDoc>('message_secrets_cache')
        await col.updateOne(
            { _id: { session_id: this.sessionId, message_id: messageId } },
            {
                $set: {
                    secret: toBinary(secret),
                    expires_at: new Date(Date.now() + this.ttlMs)
                }
            },
            { upsert: true }
        )
    }

    public async setBatch(
        entries: readonly { readonly messageId: string; readonly secret: Uint8Array }[]
    ): Promise<void> {
        if (entries.length === 0) return
        await this.ensureIndexes()
        const col = this.col<MessageSecretDoc>('message_secrets_cache')
        const now = Date.now()
        const ops = entries.map((entry) => ({
            updateOne: {
                filter: { _id: { session_id: this.sessionId, message_id: entry.messageId } },
                update: {
                    $set: {
                        secret: toBinary(entry.secret),
                        expires_at: new Date(now + this.ttlMs)
                    }
                },
                upsert: true
            }
        }))
        await col.bulkWrite(ops)
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<MessageSecretDoc>('message_secrets_cache')
        await col.deleteMany({ '_id.session_id': this.sessionId })
    }
}
