import type { Binary } from 'mongodb'
import { signalAddressKey } from 'zapo-js/protocol'
import type { SignalAddress } from 'zapo-js/signal'
import { toSignalAddressParts } from 'zapo-js/signal'
import type { WaIdentityStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinary, toBinary } from './helpers'
import type { WaMongoStorageOptions } from './types'

interface IdentityDoc {
    _id: { session_id: string; user: string; server: string; device: number }
    identity_key: Binary
}

export class WaIdentityMongoStore extends BaseMongoStore implements WaIdentityStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
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
        await this.col<IdentityDoc>('signal_identities').deleteMany({
            '_id.session_id': this.sessionId
        })
    }
}
