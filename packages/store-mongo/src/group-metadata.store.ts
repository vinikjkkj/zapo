import type { WaGroupMetadataSnapshot, WaGroupMetadataStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import type { WaMongoStorageOptions } from './types'

interface GroupMetadataDoc {
    _id: { session_id: string; group_jid: string }
    participants: string[]
    ephemeral?: number
    updated_at_ms: number
    expires_at: Date
}

const DEFAULT_GROUP_METADATA_TTL_MS = 5 * 60 * 1000

export class WaGroupMetadataMongoStore extends BaseMongoStore implements WaGroupMetadataStore {
    private readonly ttlMs: number

    public constructor(options: WaMongoStorageOptions, ttlMs = DEFAULT_GROUP_METADATA_TTL_MS) {
        super(options)
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('groupMetadata ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    protected override async createIndexes(): Promise<void> {
        const col = this.col<GroupMetadataDoc>('group_participants_cache')
        await col.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
    }

    public async upsertGroupMetadata(snapshot: WaGroupMetadataSnapshot): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<GroupMetadataDoc>('group_participants_cache')
        const $set: Partial<GroupMetadataDoc> = {
            participants: snapshot.participants as string[],
            updated_at_ms: snapshot.updatedAtMs,
            expires_at: new Date(snapshot.updatedAtMs + this.ttlMs)
        }
        const update: Record<string, unknown> = { $set }
        if (snapshot.ephemeral === undefined) {
            update.$unset = { ephemeral: '' }
        } else {
            $set.ephemeral = snapshot.ephemeral
        }
        await col.updateOne(
            { _id: { session_id: this.sessionId, group_jid: snapshot.groupJid } },
            update,
            { upsert: true }
        )
    }

    public async getGroupMetadata(
        groupJid: string,
        nowMs = Date.now()
    ): Promise<WaGroupMetadataSnapshot | null> {
        await this.ensureIndexes()
        const col = this.col<GroupMetadataDoc>('group_participants_cache')
        const doc = await col.findOne({
            _id: { session_id: this.sessionId, group_jid: groupJid },
            expires_at: { $gt: new Date(nowMs) }
        })
        if (!doc) return null
        return {
            groupJid,
            participants: doc.participants,
            ephemeral: doc.ephemeral,
            updatedAtMs: doc.updated_at_ms
        }
    }

    public async deleteGroupMetadata(groupJid: string): Promise<number> {
        await this.ensureIndexes()
        const col = this.col<GroupMetadataDoc>('group_participants_cache')
        const result = await col.deleteOne({
            _id: { session_id: this.sessionId, group_jid: groupJid }
        })
        return result.deletedCount
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<GroupMetadataDoc>('group_participants_cache')
        await col.deleteMany({ '_id.session_id': this.sessionId })
    }
}
