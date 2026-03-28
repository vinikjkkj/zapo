import type { Binary } from 'mongodb'
import { signalAddressKey } from 'zapo-js/protocol'
import type {
    PreKeyRecord,
    RegistrationInfo,
    SignalAddress,
    SignalSessionRecord,
    SignedPreKeyRecord
} from 'zapo-js/signal'
import {
    encodeSignalSessionRecord,
    decodeSignalSessionRecord,
    toSignalAddressParts
} from 'zapo-js/signal'
import type { WaSignalStore, WaSignalMetaSnapshot } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinary, toBinary, safeLimit } from './helpers'
import type { WaMongoStorageOptions } from './types'

interface MetaDoc {
    _id: string
    server_has_prekeys: boolean
    next_prekey_id: number
    signed_prekey_rotation_ts: number | null
}

interface RegistrationDoc {
    _id: string
    registration_id: number
    identity_pub_key: Binary
    identity_priv_key: Binary
}

interface SignedPreKeyDoc {
    _id: string
    key_id: number
    pub_key: Binary
    priv_key: Binary
    signature: Binary
    uploaded: boolean
}

interface PreKeyDoc {
    _id: { session_id: string; key_id: number }
    pub_key: Binary
    priv_key: Binary
    uploaded: boolean
}

interface SessionDoc {
    _id: { session_id: string; user: string; server: string; device: number }
    record: Binary
}

interface IdentityDoc {
    _id: { session_id: string; user: string; server: string; device: number }
    identity_key: Binary
}

export class WaSignalMongoStore extends BaseMongoStore implements WaSignalStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
    }

    protected override async createIndexes(): Promise<void> {
        const prekeys = this.col<PreKeyDoc>('signal_prekeys')
        await prekeys.createIndex({ '_id.session_id': 1, uploaded: 1, '_id.key_id': 1 })
    }

    // ── Registration ──────────────────────────────────────────────────

    public async getRegistrationInfo(): Promise<RegistrationInfo | null> {
        await this.ensureIndexes()
        const col = this.col<RegistrationDoc>('signal_registration')
        const doc = await col.findOne({ _id: this.sessionId })
        if (!doc) return null
        return {
            registrationId: doc.registration_id,
            identityKeyPair: {
                pubKey: fromBinary(doc.identity_pub_key),
                privKey: fromBinary(doc.identity_priv_key)
            }
        }
    }

    public async setRegistrationInfo(info: RegistrationInfo): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<RegistrationDoc>('signal_registration')
        await col.updateOne(
            { _id: this.sessionId },
            {
                $set: {
                    registration_id: info.registrationId,
                    identity_pub_key: toBinary(info.identityKeyPair.pubKey),
                    identity_priv_key: toBinary(info.identityKeyPair.privKey)
                }
            },
            { upsert: true }
        )
    }

    // ── Signed PreKey ─────────────────────────────────────────────────

    public async getSignedPreKey(): Promise<SignedPreKeyRecord | null> {
        await this.ensureIndexes()
        const col = this.col<SignedPreKeyDoc>('signal_signed_prekey')
        const doc = await col.findOne({ _id: this.sessionId })
        if (!doc) return null
        return this.decodeSignedPreKeyDoc(doc)
    }

    public async setSignedPreKey(record: SignedPreKeyRecord): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<SignedPreKeyDoc>('signal_signed_prekey')
        await col.updateOne(
            { _id: this.sessionId },
            {
                $set: {
                    key_id: record.keyId,
                    pub_key: toBinary(record.keyPair.pubKey),
                    priv_key: toBinary(record.keyPair.privKey),
                    signature: toBinary(record.signature),
                    uploaded: record.uploaded === true
                }
            },
            { upsert: true }
        )
    }

    public async getSignedPreKeyById(keyId: number): Promise<SignedPreKeyRecord | null> {
        await this.ensureIndexes()
        const col = this.col<SignedPreKeyDoc>('signal_signed_prekey')
        const doc = await col.findOne({ _id: this.sessionId, key_id: keyId })
        if (!doc) return null
        return this.decodeSignedPreKeyDoc(doc)
    }

    public async setSignedPreKeyRotationTs(value: number | null): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<MetaDoc>('signal_meta')
        await col.updateOne(
            { _id: this.sessionId },
            {
                $set: { signed_prekey_rotation_ts: value },
                $setOnInsert: { server_has_prekeys: false, next_prekey_id: 1 }
            },
            { upsert: true }
        )
    }

    public async getSignedPreKeyRotationTs(): Promise<number | null> {
        const meta = await this.getMeta()
        return meta.signedPreKeyRotationTs
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

    // ── Meta ──────────────────────────────────────────────────────────

    public async getSignalMeta(): Promise<WaSignalMetaSnapshot> {
        await this.ensureIndexes()
        const metaCol = this.col<MetaDoc>('signal_meta')
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
        const meta = await metaCol.findOne({ _id: this.sessionId })
        if (!meta) throw new Error('signal meta row not found')

        const regCol = this.col<RegistrationDoc>('signal_registration')
        const regDoc = await regCol.findOne({ _id: this.sessionId })
        const registrationInfo: RegistrationInfo | null = regDoc
            ? {
                  registrationId: regDoc.registration_id,
                  identityKeyPair: {
                      pubKey: fromBinary(regDoc.identity_pub_key),
                      privKey: fromBinary(regDoc.identity_priv_key)
                  }
              }
            : null

        const signedCol = this.col<SignedPreKeyDoc>('signal_signed_prekey')
        const signedDoc = await signedCol.findOne({ _id: this.sessionId })
        const signedPreKey: SignedPreKeyRecord | null = signedDoc
            ? this.decodeSignedPreKeyDoc(signedDoc)
            : null

        return {
            serverHasPreKeys: meta.server_has_prekeys,
            signedPreKeyRotationTs: meta.signed_prekey_rotation_ts,
            registrationInfo,
            signedPreKey
        }
    }

    // ── Sessions ──────────────────────────────────────────────────────

    public async hasSession(address: SignalAddress): Promise<boolean> {
        await this.ensureIndexes()
        const col = this.col<SessionDoc>('signal_sessions')
        const target = toSignalAddressParts(address)
        const count = await col.countDocuments(
            {
                _id: {
                    session_id: this.sessionId,
                    user: target.user,
                    server: target.server,
                    device: target.device
                }
            },
            { limit: 1 }
        )
        return count > 0
    }

    public async hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]> {
        if (addresses.length === 0) return []
        await this.ensureIndexes()
        const col = this.col<SessionDoc>('signal_sessions')
        const targets = addresses.map((a) => toSignalAddressParts(a))
        const idFilters = targets.map((t) => ({
            session_id: this.sessionId,
            user: t.user,
            server: t.server,
            device: t.device
        }))
        const docs = await col
            .find({ _id: { $in: idFilters } }, { projection: { _id: 1 } })
            .toArray()
        const existingKeys = new Set<string>()
        for (const doc of docs) {
            existingKeys.add(
                signalAddressKey({
                    user: doc._id.user,
                    server: doc._id.server,
                    device: doc._id.device
                })
            )
        }
        return targets.map((t) => existingKeys.has(signalAddressKey(t)))
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        await this.ensureIndexes()
        const col = this.col<SessionDoc>('signal_sessions')
        const target = toSignalAddressParts(address)
        const doc = await col.findOne({
            _id: {
                session_id: this.sessionId,
                user: target.user,
                server: target.server,
                device: target.device
            }
        })
        if (!doc) return null
        return decodeSignalSessionRecord(fromBinary(doc.record))
    }

    public async getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]> {
        if (addresses.length === 0) return []
        await this.ensureIndexes()
        const col = this.col<SessionDoc>('signal_sessions')
        const targets = addresses.map((a) => toSignalAddressParts(a))
        const orFilters = targets.map((t) => ({
            '_id.session_id': this.sessionId,
            '_id.user': t.user,
            '_id.server': t.server,
            '_id.device': t.device
        }))
        const docs = await col.find({ $or: orFilters }).toArray()
        const byKey = new Map<string, SignalSessionRecord>()
        for (const doc of docs) {
            byKey.set(
                signalAddressKey({
                    user: doc._id.user,
                    server: doc._id.server,
                    device: doc._id.device
                }),
                decodeSignalSessionRecord(fromBinary(doc.record))
            )
        }
        return targets.map((t) => byKey.get(signalAddressKey(t)) ?? null)
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<SessionDoc>('signal_sessions')
        const target = toSignalAddressParts(address)
        await col.updateOne(
            {
                _id: {
                    session_id: this.sessionId,
                    user: target.user,
                    server: target.server,
                    device: target.device
                }
            },
            { $set: { record: toBinary(encodeSignalSessionRecord(session)) } },
            { upsert: true }
        )
    }

    public async setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        await this.ensureIndexes()
        const col = this.col<SessionDoc>('signal_sessions')
        const ops = entries.map((entry) => {
            const target = toSignalAddressParts(entry.address)
            return {
                updateOne: {
                    filter: {
                        _id: {
                            session_id: this.sessionId,
                            user: target.user,
                            server: target.server,
                            device: target.device
                        }
                    },
                    update: {
                        $set: { record: toBinary(encodeSignalSessionRecord(entry.session)) }
                    },
                    upsert: true
                }
            }
        })
        await col.bulkWrite(ops)
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<SessionDoc>('signal_sessions')
        const target = toSignalAddressParts(address)
        await col.deleteOne({
            _id: {
                session_id: this.sessionId,
                user: target.user,
                server: target.server,
                device: target.device
            }
        })
    }

    // ── Identities ────────────────────────────────────────────────────

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        await this.ensureIndexes()
        const col = this.col<IdentityDoc>('signal_identities')
        const target = toSignalAddressParts(address)
        const doc = await col.findOne({
            _id: {
                session_id: this.sessionId,
                user: target.user,
                server: target.server,
                device: target.device
            }
        })
        if (!doc) return null
        return fromBinary(doc.identity_key)
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (addresses.length === 0) return []
        await this.ensureIndexes()
        const col = this.col<IdentityDoc>('signal_identities')
        const targets = addresses.map((a) => toSignalAddressParts(a))
        const orFilters = targets.map((t) => ({
            '_id.session_id': this.sessionId,
            '_id.user': t.user,
            '_id.server': t.server,
            '_id.device': t.device
        }))
        const docs = await col.find({ $or: orFilters }).toArray()
        const byKey = new Map<string, Uint8Array>()
        for (const doc of docs) {
            byKey.set(
                signalAddressKey({
                    user: doc._id.user,
                    server: doc._id.server,
                    device: doc._id.device
                }),
                fromBinary(doc.identity_key)
            )
        }
        return targets.map((t) => byKey.get(signalAddressKey(t)) ?? null)
    }

    public async setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<IdentityDoc>('signal_identities')
        const target = toSignalAddressParts(address)
        await col.updateOne(
            {
                _id: {
                    session_id: this.sessionId,
                    user: target.user,
                    server: target.server,
                    device: target.device
                }
            },
            { $set: { identity_key: toBinary(identityKey) } },
            { upsert: true }
        )
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        await this.ensureIndexes()
        const col = this.col<IdentityDoc>('signal_identities')
        const ops = entries.map((entry) => {
            const target = toSignalAddressParts(entry.address)
            return {
                updateOne: {
                    filter: {
                        _id: {
                            session_id: this.sessionId,
                            user: target.user,
                            server: target.server,
                            device: target.device
                        }
                    },
                    update: { $set: { identity_key: toBinary(entry.identityKey) } },
                    upsert: true
                }
            }
        })
        await col.bulkWrite(ops)
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await Promise.all([
            this.col<MetaDoc>('signal_meta').deleteMany({ _id: this.sessionId }),
            this.col<RegistrationDoc>('signal_registration').deleteMany({ _id: this.sessionId }),
            this.col<SignedPreKeyDoc>('signal_signed_prekey').deleteMany({ _id: this.sessionId }),
            this.col<PreKeyDoc>('signal_prekeys').deleteMany({ '_id.session_id': this.sessionId }),
            this.col<SessionDoc>('signal_sessions').deleteMany({
                '_id.session_id': this.sessionId
            }),
            this.col<IdentityDoc>('signal_identities').deleteMany({
                '_id.session_id': this.sessionId
            })
        ])
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

    private decodeSignedPreKeyDoc(doc: SignedPreKeyDoc): SignedPreKeyRecord {
        return {
            keyId: doc.key_id,
            keyPair: {
                pubKey: fromBinary(doc.pub_key),
                privKey: fromBinary(doc.priv_key)
            },
            signature: fromBinary(doc.signature),
            uploaded: doc.uploaded
        }
    }
}
