import { type SignalAddress, toSignalAddressParts } from 'zapo-js/signal'
import type { WaIdentityStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { deleteKeysChunked, scanKeys, toRedisBuffer } from './helpers'
import type { WaRedisStorageOptions } from './types'

export class WaIdentityRedisStore extends BaseRedisStore implements WaIdentityStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    // ── Identities ────────────────────────────────────────────────────

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:ident',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        const data = await this.redis.getBuffer(key)
        if (!data) return null
        await this.refreshTtl([key])
        return new Uint8Array(data)
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (addresses.length === 0) return []
        const keys = new Array<string>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            const target = toSignalAddressParts(addresses[i])
            keys[i] = this.k(
                'signal:ident',
                this.sessionId,
                target.user,
                target.server,
                String(target.device)
            )
        }
        const values = await this.redis.mgetBuffer(...keys)
        await this.refreshTtl(keys.filter((_key, i) => values[i] !== null))
        return values.map((data) => (data ? new Uint8Array(data) : null))
    }

    public async setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:ident',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        await this.redis.set(key, toRedisBuffer(identityKey))
        await this.refreshTtl([key])
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        const args: Array<string | Buffer> = []
        const keys: string[] = []
        for (const entry of entries) {
            const target = toSignalAddressParts(entry.address)
            const key = this.k(
                'signal:ident',
                this.sessionId,
                target.user,
                target.server,
                String(target.device)
            )
            keys.push(key)
            args.push(key, toRedisBuffer(entry.identityKey))
        }
        await (this.redis as unknown as { mset: (...args: unknown[]) => Promise<unknown> }).mset(
            ...args
        )
        await this.refreshTtl(keys)
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        const scanPatterns = [this.k('signal:ident', this.sessionId, '*')]
        const scannedKeys = await Promise.all(scanPatterns.map((p) => scanKeys(this.redis, p)))
        const allKeys = scannedKeys.flat()
        if (allKeys.length > 0) {
            await deleteKeysChunked(this.redis, allKeys)
        }
    }
}
