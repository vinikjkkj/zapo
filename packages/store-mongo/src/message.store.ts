import type { Binary, Document } from 'mongodb'
import type { WaMessageStore, WaStoredMessageRecord } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinaryOrNull, safeLimit, toBinary } from './helpers'
import type { WaMongoStorageOptions } from './types'

const COLLECTION = 'mailbox_messages'

interface MessageDoc {
    _id: { session_id: string; message_id: string }
    thread_jid: string
    sender_jid: string | null
    participant_jid: string | null
    from_me: boolean
    timestamp_ms: number | null
    enc_type: string | null
    plaintext: Binary | null
    message_bytes: Binary | null
}

function docToRecord(doc: MessageDoc): WaStoredMessageRecord {
    return {
        id: doc._id.message_id,
        threadJid: doc.thread_jid,
        senderJid: doc.sender_jid ?? undefined,
        participantJid: doc.participant_jid ?? undefined,
        fromMe: doc.from_me,
        timestampMs: doc.timestamp_ms ?? undefined,
        encType: doc.enc_type ?? undefined,
        plaintext: fromBinaryOrNull(doc.plaintext) ?? undefined,
        messageBytes: fromBinaryOrNull(doc.message_bytes) ?? undefined
    }
}

export class WaMessageMongoStore extends BaseMongoStore implements WaMessageStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
    }

    protected override async createIndexes(): Promise<void> {
        await this.col<MessageDoc>(COLLECTION).createIndex(
            { '_id.session_id': 1, thread_jid: 1, timestamp_ms: -1 },
            { background: true }
        )
    }

    private makeId(messageId: string): MessageDoc['_id'] {
        return { session_id: this.sessionId, message_id: messageId }
    }

    private toDoc(record: WaStoredMessageRecord): MessageDoc {
        return {
            _id: this.makeId(record.id),
            thread_jid: record.threadJid,
            sender_jid: record.senderJid ?? null,
            participant_jid: record.participantJid ?? null,
            from_me: record.fromMe,
            timestamp_ms: record.timestampMs ?? null,
            enc_type: record.encType ?? null,
            plaintext: record.plaintext ? toBinary(record.plaintext) : null,
            message_bytes: record.messageBytes ? toBinary(record.messageBytes) : null
        }
    }

    public async upsert(record: WaStoredMessageRecord): Promise<void> {
        await this.ensureIndexes()
        const doc = this.toDoc(record)
        const { _id, ...fields } = doc
        await this.col<MessageDoc>(COLLECTION).updateOne(
            { _id },
            { $set: fields },
            { upsert: true }
        )
    }

    public async upsertBatch(records: readonly WaStoredMessageRecord[]): Promise<void> {
        if (records.length === 0) return
        await this.ensureIndexes()

        const ops = records.map((record) => {
            const doc = this.toDoc(record)
            const { _id, ...fields } = doc
            return {
                updateOne: {
                    filter: { _id },
                    update: { $set: fields },
                    upsert: true
                }
            }
        })

        await this.col<MessageDoc>(COLLECTION).bulkWrite(ops, { ordered: false })
    }

    public async getById(id: string): Promise<WaStoredMessageRecord | null> {
        await this.ensureIndexes()
        const doc = await this.col<MessageDoc>(COLLECTION).findOne({ _id: this.makeId(id) })
        if (!doc) return null
        return docToRecord(doc)
    }

    public async listByThread(
        threadJid: string,
        limit?: number,
        beforeTimestampMs?: number
    ): Promise<readonly WaStoredMessageRecord[]> {
        await this.ensureIndexes()
        const resolved = safeLimit(limit, 50)

        const filter: Document = {
            '_id.session_id': this.sessionId,
            thread_jid: threadJid
        }

        if (beforeTimestampMs !== undefined) {
            filter.timestamp_ms = { $lt: beforeTimestampMs }
        }

        const docs = await this.col<MessageDoc>(COLLECTION)
            .find(filter)
            .sort({ timestamp_ms: -1, '_id.message_id': -1 })
            .limit(resolved)
            .toArray()

        return docs.map(docToRecord)
    }

    public async deleteById(id: string): Promise<number> {
        await this.ensureIndexes()
        const result = await this.col<MessageDoc>(COLLECTION).deleteOne({ _id: this.makeId(id) })
        return result.deletedCount
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await this.col<MessageDoc>(COLLECTION).deleteMany({ '_id.session_id': this.sessionId })
    }
}
