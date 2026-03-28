import type { WaContactStore, WaStoredContactRecord } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import type { WaMongoStorageOptions } from './types'

const COLLECTION = 'mailbox_contacts'

interface ContactDoc {
    _id: { session_id: string; jid: string }
    display_name: string | null
    push_name: string | null
    lid: string | null
    phone_number: string | null
    last_updated_ms: number
}

function docToRecord(doc: ContactDoc): WaStoredContactRecord {
    return {
        jid: doc._id.jid,
        displayName: doc.display_name ?? undefined,
        pushName: doc.push_name ?? undefined,
        lid: doc.lid ?? undefined,
        phoneNumber: doc.phone_number ?? undefined,
        lastUpdatedMs: doc.last_updated_ms
    }
}

function buildCoalesceSet(record: WaStoredContactRecord): Partial<ContactDoc> {
    const set: Partial<ContactDoc> = {
        last_updated_ms: record.lastUpdatedMs
    }
    if (record.displayName !== undefined) set.display_name = record.displayName
    if (record.pushName !== undefined) set.push_name = record.pushName
    if (record.lid !== undefined) set.lid = record.lid
    if (record.phoneNumber !== undefined) set.phone_number = record.phoneNumber
    return set
}

export class WaContactMongoStore extends BaseMongoStore implements WaContactStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
    }

    private makeId(jid: string): ContactDoc['_id'] {
        return { session_id: this.sessionId, jid }
    }

    public async upsert(record: WaStoredContactRecord): Promise<void> {
        await this.ensureIndexes()
        const set = buildCoalesceSet(record)
        await this.col<ContactDoc>(COLLECTION).updateOne(
            { _id: this.makeId(record.jid) },
            { $set: set },
            { upsert: true }
        )
    }

    public async upsertBatch(records: readonly WaStoredContactRecord[]): Promise<void> {
        if (records.length === 0) return
        await this.ensureIndexes()

        const ops = records.map((record) => ({
            updateOne: {
                filter: { _id: this.makeId(record.jid) },
                update: { $set: buildCoalesceSet(record) },
                upsert: true
            }
        }))

        await this.col<ContactDoc>(COLLECTION).bulkWrite(ops, { ordered: false })
    }

    public async getByJid(jid: string): Promise<WaStoredContactRecord | null> {
        await this.ensureIndexes()
        const doc = await this.col<ContactDoc>(COLLECTION).findOne({ _id: this.makeId(jid) })
        if (!doc) return null
        return docToRecord(doc)
    }

    public async deleteByJid(jid: string): Promise<number> {
        await this.ensureIndexes()
        const result = await this.col<ContactDoc>(COLLECTION).deleteOne({ _id: this.makeId(jid) })
        return result.deletedCount
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await this.col<ContactDoc>(COLLECTION).deleteMany({ '_id.session_id': this.sessionId })
    }
}
