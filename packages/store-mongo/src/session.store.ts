import type { Binary } from 'mongodb'
import { signalAddressKey } from 'zapo-js/protocol'
import type { SignalAddress, SignalSessionRecord } from 'zapo-js/signal'
import {
    encodeSignalSessionRecord,
    decodeSignalSessionRecord,
    toSignalAddressParts
} from 'zapo-js/signal'
import type { WaSessionStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinary, toBinary } from './helpers'
import type { WaMongoStorageOptions } from './types'

interface SessionDoc {
    _id: { session_id: string; user: string; server: string; device: number }
    record: Binary
}

export class WaSessionMongoStore extends BaseMongoStore implements WaSessionStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
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

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await this.col<SessionDoc>('signal_sessions').deleteMany({
            '_id.session_id': this.sessionId
        })
    }
}
