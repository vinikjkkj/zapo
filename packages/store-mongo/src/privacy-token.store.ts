import type { Binary } from 'mongodb'
import type { WaPrivacyTokenStore, WaStoredPrivacyTokenRecord } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinaryOrNull, toBinary } from './helpers'
import type { WaMongoStorageOptions } from './types'

const COLLECTION = 'privacy_tokens'

interface PrivacyTokenDoc {
    _id: { session_id: string; jid: string }
    tc_token: Binary | null
    tc_token_timestamp: number | null
    tc_token_sender_timestamp: number | null
    nct_salt: Binary | null
    updated_at_ms: number
}

function docToRecord(doc: PrivacyTokenDoc): WaStoredPrivacyTokenRecord {
    return {
        jid: doc._id.jid,
        tcToken: fromBinaryOrNull(doc.tc_token) ?? undefined,
        tcTokenTimestamp: doc.tc_token_timestamp ?? undefined,
        tcTokenSenderTimestamp: doc.tc_token_sender_timestamp ?? undefined,
        nctSalt: fromBinaryOrNull(doc.nct_salt) ?? undefined,
        updatedAtMs: doc.updated_at_ms
    }
}

function buildCoalesceSet(record: WaStoredPrivacyTokenRecord): Partial<PrivacyTokenDoc> {
    const set: Partial<PrivacyTokenDoc> = {
        updated_at_ms: record.updatedAtMs
    }
    if (record.tcToken !== undefined) set.tc_token = toBinary(record.tcToken)
    if (record.tcTokenTimestamp !== undefined) set.tc_token_timestamp = record.tcTokenTimestamp
    if (record.tcTokenSenderTimestamp !== undefined) {
        set.tc_token_sender_timestamp = record.tcTokenSenderTimestamp
    }
    if (record.nctSalt !== undefined) set.nct_salt = toBinary(record.nctSalt)
    return set
}

export class WaPrivacyTokenMongoStore extends BaseMongoStore implements WaPrivacyTokenStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
    }

    private makeId(jid: string): PrivacyTokenDoc['_id'] {
        return { session_id: this.sessionId, jid }
    }

    public async upsert(record: WaStoredPrivacyTokenRecord): Promise<void> {
        await this.ensureIndexes()
        const set = buildCoalesceSet(record)
        await this.col<PrivacyTokenDoc>(COLLECTION).updateOne(
            { _id: this.makeId(record.jid) },
            { $set: set },
            { upsert: true }
        )
    }

    public async upsertBatch(records: readonly WaStoredPrivacyTokenRecord[]): Promise<void> {
        if (records.length === 0) return
        await this.ensureIndexes()

        const ops = records.map((record) => ({
            updateOne: {
                filter: { _id: this.makeId(record.jid) },
                update: { $set: buildCoalesceSet(record) },
                upsert: true
            }
        }))

        await this.col<PrivacyTokenDoc>(COLLECTION).bulkWrite(ops, { ordered: false })
    }

    public async getByJid(jid: string): Promise<WaStoredPrivacyTokenRecord | null> {
        await this.ensureIndexes()
        const doc = await this.col<PrivacyTokenDoc>(COLLECTION).findOne({ _id: this.makeId(jid) })
        if (!doc) return null
        return docToRecord(doc)
    }

    public async deleteByJid(jid: string): Promise<number> {
        await this.ensureIndexes()
        const result = await this.col<PrivacyTokenDoc>(COLLECTION).deleteOne({
            _id: this.makeId(jid)
        })
        return result.deletedCount
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await this.col<PrivacyTokenDoc>(COLLECTION).deleteMany({ '_id.session_id': this.sessionId })
    }

    public override async destroy(): Promise<void> {
        await super.destroy()
    }
}
