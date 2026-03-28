import type { WaStoredThreadRecord, WaThreadStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { safeLimit } from './helpers'
import type { WaMongoStorageOptions } from './types'

const COLLECTION = 'mailbox_threads'

interface ThreadDoc {
    _id: { session_id: string; jid: string }
    name: string | null
    unread_count: number | null
    archived: boolean | null
    pinned: number | null
    mute_end_ms: number | null
    marked_as_unread: boolean | null
    ephemeral_expiration: number | null
}

function docToRecord(doc: ThreadDoc): WaStoredThreadRecord {
    return {
        jid: doc._id.jid,
        name: doc.name ?? undefined,
        unreadCount: doc.unread_count ?? undefined,
        archived: doc.archived ?? undefined,
        pinned: doc.pinned ?? undefined,
        muteEndMs: doc.mute_end_ms ?? undefined,
        markedAsUnread: doc.marked_as_unread ?? undefined,
        ephemeralExpiration: doc.ephemeral_expiration ?? undefined
    }
}

function buildCoalesceSet(record: WaStoredThreadRecord): Partial<ThreadDoc> {
    const set: Partial<ThreadDoc> = {}
    if (record.name !== undefined) set.name = record.name
    if (record.unreadCount !== undefined) set.unread_count = record.unreadCount
    if (record.archived !== undefined) set.archived = record.archived
    if (record.pinned !== undefined) set.pinned = record.pinned
    if (record.muteEndMs !== undefined) set.mute_end_ms = record.muteEndMs
    if (record.markedAsUnread !== undefined) set.marked_as_unread = record.markedAsUnread
    if (record.ephemeralExpiration !== undefined)
        set.ephemeral_expiration = record.ephemeralExpiration
    return set
}

export class WaThreadMongoStore extends BaseMongoStore implements WaThreadStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
    }

    private makeId(jid: string): ThreadDoc['_id'] {
        return { session_id: this.sessionId, jid }
    }

    public async upsert(record: WaStoredThreadRecord): Promise<void> {
        await this.ensureIndexes()
        const set = buildCoalesceSet(record)
        await this.col<ThreadDoc>(COLLECTION).updateOne(
            { _id: this.makeId(record.jid) },
            { $set: set },
            { upsert: true }
        )
    }

    public async upsertBatch(records: readonly WaStoredThreadRecord[]): Promise<void> {
        if (records.length === 0) return
        await this.ensureIndexes()

        const ops = records.map((record) => ({
            updateOne: {
                filter: { _id: this.makeId(record.jid) },
                update: { $set: buildCoalesceSet(record) },
                upsert: true
            }
        }))

        await this.col<ThreadDoc>(COLLECTION).bulkWrite(ops, { ordered: false })
    }

    public async getByJid(jid: string): Promise<WaStoredThreadRecord | null> {
        await this.ensureIndexes()
        const doc = await this.col<ThreadDoc>(COLLECTION).findOne({ _id: this.makeId(jid) })
        if (!doc) return null
        return docToRecord(doc)
    }

    public async list(limit?: number): Promise<readonly WaStoredThreadRecord[]> {
        await this.ensureIndexes()
        const resolved = safeLimit(limit, 100)
        const docs = await this.col<ThreadDoc>(COLLECTION)
            .find({ '_id.session_id': this.sessionId })
            .limit(resolved)
            .toArray()
        return docs.map(docToRecord)
    }

    public async deleteByJid(jid: string): Promise<number> {
        await this.ensureIndexes()
        const result = await this.col<ThreadDoc>(COLLECTION).deleteOne({ _id: this.makeId(jid) })
        return result.deletedCount
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await this.col<ThreadDoc>(COLLECTION).deleteMany({ '_id.session_id': this.sessionId })
    }
}
