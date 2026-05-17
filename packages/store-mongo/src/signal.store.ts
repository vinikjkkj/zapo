import type { Binary } from 'mongodb'
import type { RegistrationInfo, SignedPreKeyRecord } from 'zapo-js/signal'
import type { WaSignalStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinary, toBinary } from './helpers'
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

export class WaSignalMongoStore extends BaseMongoStore implements WaSignalStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
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

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await Promise.all([
            this.col<MetaDoc>('signal_meta').updateOne(
                { _id: this.sessionId },
                { $set: { signed_prekey_rotation_ts: null } }
            ),
            this.col<RegistrationDoc>('signal_registration').deleteMany({ _id: this.sessionId }),
            this.col<SignedPreKeyDoc>('signal_signed_prekey').deleteMany({ _id: this.sessionId })
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
