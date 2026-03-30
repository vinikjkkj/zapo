import type { SignalAddress } from 'zapo-js/signal'
import { toSignalAddressParts } from 'zapo-js/signal'
import type { WaIdentityStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { scanKeys, toRedisBuffer } from './helpers'
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
        return new Uint8Array(data)
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (addresses.length === 0) return []
        const pipeline = this.redis.pipeline()
        for (const address of addresses) {
            const target = toSignalAddressParts(address)
            pipeline.getBuffer(
                this.k(
                    'signal:ident',
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
            return new Uint8Array(data as Uint8Array)
        })
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
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        const pipeline = this.redis.pipeline()
        for (const entry of entries) {
            const target = toSignalAddressParts(entry.address)
            const key = this.k(
                'signal:ident',
                this.sessionId,
                target.user,
                target.server,
                String(target.device)
            )
            pipeline.set(key, toRedisBuffer(entry.identityKey))
        }
        await pipeline.exec()
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        const scanPatterns = [this.k('signal:ident', this.sessionId, '*')]
        const scannedKeys = await Promise.all(scanPatterns.map((p) => scanKeys(this.redis, p)))
        const allKeys = scannedKeys.flat()
        if (allKeys.length > 0) {
            await this.redis.del(...allKeys)
        }
    }
}
