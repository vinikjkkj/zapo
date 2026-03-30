import type { SignalAddress, SignalSessionRecord } from 'zapo-js/signal'
import {
    encodeSignalSessionRecord,
    decodeSignalSessionRecord,
    toSignalAddressParts
} from 'zapo-js/signal'
import type { WaSessionStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { deleteKeysChunked, scanKeys, toRedisBuffer } from './helpers'
import type { WaRedisStorageOptions } from './types'

export class WaSessionRedisStore extends BaseRedisStore implements WaSessionStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    // ── Sessions ──────────────────────────────────────────────────────

    public async hasSession(address: SignalAddress): Promise<boolean> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:sess',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        return (await this.redis.exists(key)) === 1
    }

    public async hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]> {
        if (addresses.length === 0) return []
        const pipeline = this.redis.pipeline()
        for (const address of addresses) {
            const target = toSignalAddressParts(address)
            pipeline.exists(
                this.k(
                    'signal:sess',
                    this.sessionId,
                    target.user,
                    target.server,
                    String(target.device)
                )
            )
        }
        const results = await pipeline.exec()
        if (!results) return addresses.map(() => false)
        return results.map(([err, val]) => !err && val === 1)
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:sess',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        const data = await this.redis.getBuffer(key)
        if (!data) return null
        return decodeSignalSessionRecord(new Uint8Array(data))
    }

    public async getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]> {
        if (addresses.length === 0) return []
        const pipeline = this.redis.pipeline()
        for (const address of addresses) {
            const target = toSignalAddressParts(address)
            pipeline.getBuffer(
                this.k(
                    'signal:sess',
                    this.sessionId,
                    target.user,
                    target.server,
                    String(target.device)
                )
            )
        }
        const results = await pipeline.exec()
        if (!results) return addresses.map(() => null)
        return results.map(([err, data]) => {
            if (err || !data) return null
            return decodeSignalSessionRecord(new Uint8Array(data as Uint8Array))
        })
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:sess',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        const encoded = encodeSignalSessionRecord(session)
        await this.redis.set(key, toRedisBuffer(encoded))
    }

    public async setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        const pipeline = this.redis.pipeline()
        for (const entry of entries) {
            const target = toSignalAddressParts(entry.address)
            const key = this.k(
                'signal:sess',
                this.sessionId,
                target.user,
                target.server,
                String(target.device)
            )
            const encoded = encodeSignalSessionRecord(entry.session)
            pipeline.set(key, toRedisBuffer(encoded))
        }
        await pipeline.exec()
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:sess',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        await this.redis.del(key)
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        const scanPatterns = [this.k('signal:sess', this.sessionId, '*')]
        const scannedKeys = await Promise.all(scanPatterns.map((p) => scanKeys(this.redis, p)))
        const allKeys = scannedKeys.flat()
        if (allKeys.length > 0) {
            await deleteKeysChunked(this.redis, allKeys)
        }
    }
}
