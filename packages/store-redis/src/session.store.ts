import {
    decodeSignalSessionRecord,
    encodeSignalSessionRecord,
    type SignalAddress,
    type SignalSessionRecord,
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
        // Single EXISTS with variadic keys: redis returns total matched count,
        // so we need per-key results via MGET-on-existence pattern. Simplest:
        // MGET the keys and treat null == missing.
        const keys = new Array<string>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            const target = toSignalAddressParts(addresses[i])
            keys[i] = this.k(
                'signal:sess',
                this.sessionId,
                target.user,
                target.server,
                String(target.device)
            )
        }
        const values = await this.redis.mget(...keys)
        return values.map((v) => v !== null)
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
        const keys = new Array<string>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            const target = toSignalAddressParts(addresses[i])
            keys[i] = this.k(
                'signal:sess',
                this.sessionId,
                target.user,
                target.server,
                String(target.device)
            )
        }
        // mgetBuffer: single MGET command server-side returning binary values.
        const values = await this.redis.mgetBuffer(...keys)
        return values.map((data) => {
            if (!data) return null
            return decodeSignalSessionRecord(new Uint8Array(data))
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
        // Single MSET — ioredis accepts variadic (key, value) pairs and the
        // command is processed as one unit server-side, replacing what would
        // otherwise be N pipelined SETs.
        const args: Array<string | Buffer> = []
        for (const entry of entries) {
            const target = toSignalAddressParts(entry.address)
            args.push(
                this.k(
                    'signal:sess',
                    this.sessionId,
                    target.user,
                    target.server,
                    String(target.device)
                ),
                toRedisBuffer(encodeSignalSessionRecord(entry.session))
            )
        }
        await (this.redis as unknown as { mset: (...args: unknown[]) => Promise<unknown> }).mset(
            ...args
        )
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
