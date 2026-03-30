import type { Binary } from 'mongodb'
import type { PreKeyRecord } from 'zapo-js/signal'
import type { WaPreKeyStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinary, toBinary, safeLimit } from './helpers'
import type { WaMongoStorageOptions } from './types'

interface MetaDoc {
    _id: string
    server_has_prekeys: boolean
    next_prekey_id: number
    signed_prekey_rotation_ts: number | null
}

interface PreKeyDoc {
    _id: { session_id: string; key_id: number }
    pub_key: Binary
    priv_key: Binary
    uploaded: boolean
}

export class WaPreKeyMongoStore extends BaseMongoStore implements WaPreKeyStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
    }

    protected override async createIndexes(): Promise<void> {
        const prekeys = this.col<PreKeyDoc>('signal_prekeys')
        await prekeys.createIndex({ '_id.session_id': 1, uploaded: 1, '_id.key_id': 1 })
    }

    // ── PreKeys ───────────────────────────────────────────────────────

    public async putPreKey(record: PreKeyRecord): Promise<void> {
        await this.ensureIndexes()
        const prekeys = this.col<PreKeyDoc>('signal_prekeys')
        const metaCol = this.col<MetaDoc>('signal_meta')
        await prekeys.updateOne(
            { _id: { session_id: this.sessionId, key_id: record.keyId } },
            {
                $set: {
                    pub_key: toBinary(record.keyPair.pubKey),
                    priv_key: toBinary(record.keyPair.privKey),
                    uploaded: record.uploaded === true
                }
            },
            { upsert: true }
        )
        await metaCol.updateOne(
            { _id: this.sessionId },
            {
                $max: { next_prekey_id: record.keyId + 1 },
                $setOnInsert: {
                    server_has_prekeys: false,
                    signed_prekey_rotation_ts: null
                }
            },
            { upsert: true }
        )
    }

    public async getOrGenPreKeys(
        count: number,
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<readonly PreKeyRecord[]> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid prekey count: ${count}`)
        }

        while (true) {
            await this.ensureIndexes()
            const metaCol = this.col<MetaDoc>('signal_meta')

            // Ensure meta exists
            await metaCol.updateOne(
                { _id: this.sessionId },
                {
                    $setOnInsert: {
                        server_has_prekeys: false,
                        next_prekey_id: 1,
                        signed_prekey_rotation_ts: null
                    }
                },
                { upsert: true }
            )

            const available = await this.selectAvailablePreKeys(count)
            const missing = count - available.length
            if (missing <= 0) {
                return available
            }

            // Atomically reserve key IDs
            const metaResult = await metaCol.findOneAndUpdate(
                { _id: this.sessionId },
                { $inc: { next_prekey_id: missing } },
                { returnDocument: 'before' }
            )
            if (!metaResult) {
                throw new Error('signal meta row not found')
            }
            const startKeyId = metaResult.next_prekey_id

            const reservedKeyIds = Array.from({ length: missing }, (_, i) => startKeyId + i)

            const generated: PreKeyRecord[] = []
            let maxId = reservedKeyIds[reservedKeyIds.length - 1]
            for (const keyId of reservedKeyIds) {
                const record = await generator(keyId)
                generated.push(record)
                if (record.keyId > maxId) {
                    maxId = record.keyId
                }
            }

            const prekeys = this.col<PreKeyDoc>('signal_prekeys')
            if (generated.length > 0) {
                const ops = generated.map((record) => ({
                    updateOne: {
                        filter: {
                            _id: { session_id: this.sessionId, key_id: record.keyId }
                        },
                        update: {
                            $setOnInsert: {
                                pub_key: toBinary(record.keyPair.pubKey),
                                priv_key: toBinary(record.keyPair.privKey),
                                uploaded: record.uploaded === true
                            }
                        },
                        upsert: true
                    }
                }))
                await prekeys.bulkWrite(ops)
            }

            await metaCol.updateOne(
                { _id: this.sessionId },
                { $max: { next_prekey_id: maxId + 1 } }
            )

            const finalAvailable = await this.selectAvailablePreKeys(count)
            if (finalAvailable.length >= count) {
                return finalAvailable
            }
        }
    }

    public async getPreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        await this.ensureIndexes()
        const col = this.col<PreKeyDoc>('signal_prekeys')
        const doc = await col.findOne({
            _id: { session_id: this.sessionId, key_id: keyId }
        })
        if (!doc) return null
        return this.decodePreKeyDoc(doc)
    }

    public async getPreKeysById(
        keyIds: readonly number[]
    ): Promise<readonly (PreKeyRecord | null)[]> {
        if (keyIds.length === 0) return []
        await this.ensureIndexes()
        const col = this.col<PreKeyDoc>('signal_prekeys')
        const uniqueKeyIds = [...new Set(keyIds)]
        const docs = await col
            .find({
                '_id.session_id': this.sessionId,
                '_id.key_id': { $in: uniqueKeyIds }
            })
            .toArray()
        const byId = new Map<number, PreKeyRecord>()
        for (const doc of docs) {
            byId.set(doc._id.key_id, this.decodePreKeyDoc(doc))
        }
        return keyIds.map((id) => byId.get(id) ?? null)
    }

    public async consumePreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        await this.ensureIndexes()
        const col = this.col<PreKeyDoc>('signal_prekeys')
        const doc = await col.findOneAndDelete({
            _id: { session_id: this.sessionId, key_id: keyId }
        })
        if (!doc) return null
        return this.decodePreKeyDoc(doc)
    }

    public async getOrGenSinglePreKey(
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<PreKeyRecord> {
        const records = await this.getOrGenPreKeys(1, generator)
        return records[0]
    }

    public async markKeyAsUploaded(keyId: number): Promise<void> {
        await this.ensureIndexes()
        const meta = await this.getMeta()
        if (keyId < 0 || keyId >= meta.nextPreKeyId) {
            throw new Error(`prekey ${keyId} is out of boundary`)
        }
        const col = this.col<PreKeyDoc>('signal_prekeys')
        await col.updateMany(
            {
                '_id.session_id': this.sessionId,
                '_id.key_id': { $lte: keyId }
            },
            { $set: { uploaded: true } }
        )
    }

    // ── Server State ──────────────────────────────────────────────────

    public async setServerHasPreKeys(value: boolean): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<MetaDoc>('signal_meta')
        await col.updateOne(
            { _id: this.sessionId },
            {
                $set: { server_has_prekeys: value },
                $setOnInsert: {
                    next_prekey_id: 1,
                    signed_prekey_rotation_ts: null
                }
            },
            { upsert: true }
        )
    }

    public async getServerHasPreKeys(): Promise<boolean> {
        const meta = await this.getMeta()
        return meta.serverHasPreKeys
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await this.col<PreKeyDoc>('signal_prekeys').deleteMany({
            '_id.session_id': this.sessionId
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async getMeta(): Promise<{
        serverHasPreKeys: boolean
        nextPreKeyId: number
        signedPreKeyRotationTs: number | null
    }> {
        await this.ensureIndexes()
        const col = this.col<MetaDoc>('signal_meta')
        await col.updateOne(
            { _id: this.sessionId },
            {
                $setOnInsert: {
                    server_has_prekeys: false,
                    next_prekey_id: 1,
                    signed_prekey_rotation_ts: null
                }
            },
            { upsert: true }
        )
        const doc = await col.findOne({ _id: this.sessionId })
        if (!doc) throw new Error('signal meta row not found')
        return {
            serverHasPreKeys: doc.server_has_prekeys,
            nextPreKeyId: doc.next_prekey_id,
            signedPreKeyRotationTs: doc.signed_prekey_rotation_ts
        }
    }

    private async selectAvailablePreKeys(limit: number): Promise<PreKeyRecord[]> {
        const resolved = safeLimit(limit, 100)
        const col = this.col<PreKeyDoc>('signal_prekeys')
        const docs = await col
            .find({
                '_id.session_id': this.sessionId,
                uploaded: false
            })
            .sort({ '_id.key_id': 1 })
            .limit(resolved)
            .toArray()
        return docs.map((doc) => this.decodePreKeyDoc(doc))
    }

    private decodePreKeyDoc(doc: PreKeyDoc): PreKeyRecord {
        return {
            keyId: doc._id.key_id,
            keyPair: {
                pubKey: fromBinary(doc.pub_key),
                privKey: fromBinary(doc.priv_key)
            },
            uploaded: doc.uploaded
        }
    }
}
