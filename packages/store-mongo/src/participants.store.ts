import type { WaParticipantsSnapshot, WaParticipantsStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import type { WaMongoStorageOptions } from './types'

interface ParticipantsDoc {
    _id: { session_id: string; group_jid: string }
    participants: string[]
    updated_at_ms: number
    expires_at: Date
}

const DEFAULT_PARTICIPANTS_TTL_MS = 5 * 60 * 1000

export class WaParticipantsMongoStore extends BaseMongoStore implements WaParticipantsStore {
    private readonly ttlMs: number

    public constructor(options: WaMongoStorageOptions, ttlMs = DEFAULT_PARTICIPANTS_TTL_MS) {
        super(options)
        if (!Number.isFinite(ttlMs) || ttlMs < 0) {
            throw new Error('participants ttlMs must be a non-negative finite number')
        }
        this.ttlMs = ttlMs
    }

    protected override async createIndexes(): Promise<void> {
        const col = this.col<ParticipantsDoc>('group_participants_cache')
        await col.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
    }

    public async upsertGroupParticipants(snapshot: WaParticipantsSnapshot): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<ParticipantsDoc>('group_participants_cache')
        await col.updateOne(
            { _id: { session_id: this.sessionId, group_jid: snapshot.groupJid } },
            {
                $set: {
                    participants: snapshot.participants as string[],
                    updated_at_ms: snapshot.updatedAtMs,
                    expires_at: new Date(snapshot.updatedAtMs + this.ttlMs)
                }
            },
            { upsert: true }
        )
    }

    public async getGroupParticipants(
        groupJid: string,
        _nowMs?: number
    ): Promise<WaParticipantsSnapshot | null> {
        await this.ensureIndexes()
        const col = this.col<ParticipantsDoc>('group_participants_cache')
        const doc = await col.findOne({
            _id: { session_id: this.sessionId, group_jid: groupJid }
        })
        if (!doc) return null
        return {
            groupJid,
            participants: doc.participants,
            updatedAtMs: doc.updated_at_ms
        }
    }

    public async deleteGroupParticipants(groupJid: string): Promise<number> {
        await this.ensureIndexes()
        const col = this.col<ParticipantsDoc>('group_participants_cache')
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
        const col = this.col<ParticipantsDoc>('group_participants_cache')
        await col.deleteMany({ '_id.session_id': this.sessionId })
    }
}
