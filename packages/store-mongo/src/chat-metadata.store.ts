import type { WaChatMetadataSnapshot, WaChatMetadataStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import type { WaMongoStorageOptions } from './types'

interface ChatMetadataDoc {
    _id: { session_id: string; chat_jid: string }
    ephemeralExpiration?: number
    ephemeralSettingTimestamp?: number
    updated_at_ms: number
    expires_at: Date
}

const DEFAULT_CHAT_METADATA_TTL_MS = 30 * 60 * 1000

const OPTIONAL_FIELDS = ['ephemeralExpiration', 'ephemeralSettingTimestamp'] as const

export class WaChatMetadataMongoStore extends BaseMongoStore implements WaChatMetadataStore {
    private readonly ttlMs: number

    public constructor(options: WaMongoStorageOptions, ttlMs = DEFAULT_CHAT_METADATA_TTL_MS) {
        super(options)
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('chatMetadata ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    protected override async createIndexes(): Promise<void> {
        const col = this.col<ChatMetadataDoc>('chat_metadata_cache')
        await col.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
    }

    public async upsertChatMetadata(snapshot: WaChatMetadataSnapshot): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<ChatMetadataDoc>('chat_metadata_cache')
        const $set: Partial<ChatMetadataDoc> = {
            updated_at_ms: snapshot.updatedAtMs,
            expires_at: new Date(snapshot.updatedAtMs + this.ttlMs)
        }
        const unset: Record<string, ''> = {}
        for (const field of OPTIONAL_FIELDS) {
            const value = snapshot[field]
            if (value === undefined) {
                unset[field] = ''
            } else {
                Object.assign($set, { [field]: value })
            }
        }
        const update: Record<string, unknown> = { $set }
        if (Object.keys(unset).length > 0) {
            update.$unset = unset
        }
        await col.updateOne(
            { _id: { session_id: this.sessionId, chat_jid: snapshot.chatJid } },
            update,
            { upsert: true }
        )
    }

    public async getChatMetadata(
        chatJid: string,
        _nowMs?: number
    ): Promise<WaChatMetadataSnapshot | null> {
        await this.ensureIndexes()
        const col = this.col<ChatMetadataDoc>('chat_metadata_cache')
        const doc = await col.findOne({ _id: { session_id: this.sessionId, chat_jid: chatJid } })
        if (!doc) return null
        return {
            chatJid,
            ephemeralExpiration: doc.ephemeralExpiration,
            ephemeralSettingTimestamp: doc.ephemeralSettingTimestamp,
            updatedAtMs: doc.updated_at_ms
        }
    }

    public async deleteChatMetadata(chatJid: string): Promise<number> {
        await this.ensureIndexes()
        const col = this.col<ChatMetadataDoc>('chat_metadata_cache')
        const result = await col.deleteOne({
            _id: { session_id: this.sessionId, chat_jid: chatJid }
        })
        return result.deletedCount ?? 0
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<ChatMetadataDoc>('chat_metadata_cache')
        await col.deleteMany({ '_id.session_id': this.sessionId })
    }
}
