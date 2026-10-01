import { signalAddressKey } from '@protocol/jid'
import type { SignalAddress } from '@signal/types'
import type { WaIdentityStore as WaIdentityStoreContract } from '@store/contracts/identity.store'
import { resolveOptionalPositive, resolvePositive } from '@util/coercion'
import {
    createIdleExpiryIndex,
    createPeriodicCleanup,
    type IdleExpiryIndex,
    type PeriodicCleanupHandle,
    setBoundedMapEntry
} from '@util/collections'

const DEFAULT_MAX_REMOTE_IDENTITIES = 8_192

export interface WaIdentityMemoryStoreOptions {
    readonly maxRemoteIdentities?: number
    /**
     * Evicts a remote identity once it has been neither read nor written for
     * this many milliseconds; a periodic sweep reclaims it. Unset keeps
     * identities until `maxRemoteIdentities` evicts them.
     *
     * Meant for a cache in front of a persistent backend (the `cacheLayer`
     * L1), where an evicted entry is simply re-read. On a store that is the
     * source of truth, expiry forgets the peer's trusted identity key.
     */
    readonly ttlMs?: number
}

export class WaIdentityMemoryStore implements WaIdentityStoreContract {
    private readonly remoteIdentities: Map<string, Uint8Array>
    private readonly maxRemoteIdentities: number
    private readonly idle: IdleExpiryIndex<string> | null
    private readonly cleanup: PeriodicCleanupHandle | null

    public constructor(options: WaIdentityMemoryStoreOptions = {}) {
        this.remoteIdentities = new Map()
        this.maxRemoteIdentities = resolvePositive(
            options.maxRemoteIdentities,
            DEFAULT_MAX_REMOTE_IDENTITIES,
            'WaIdentityMemoryStoreOptions.maxRemoteIdentities'
        )
        const ttlMs = resolveOptionalPositive(options.ttlMs, 'WaIdentityMemoryStoreOptions.ttlMs')
        this.idle = ttlMs === undefined ? null : createIdleExpiryIndex(ttlMs)
        this.cleanup =
            ttlMs === undefined
                ? null
                : createPeriodicCleanup(ttlMs, () => {
                      void this.cleanupExpired(Date.now())
                  })
    }

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        const key = signalAddressKey(address)
        const identityKey = this.remoteIdentities.get(key)
        if (identityKey === undefined) return null
        this.idle?.touch(key, Date.now())
        return identityKey
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        const idle = this.idle
        const nowMs = idle === null ? 0 : Date.now()
        const result = new Array<Uint8Array | null>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            const key = signalAddressKey(addresses[i])
            const identityKey = this.remoteIdentities.get(key)
            if (identityKey !== undefined) idle?.touch(key, nowMs)
            result[i] = identityKey ?? null
        }
        return result
    }

    public async setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void> {
        const key = signalAddressKey(address)
        setBoundedMapEntry(
            this.remoteIdentities,
            key,
            identityKey,
            this.maxRemoteIdentities,
            this.idle?.delete
        )
        this.idle?.touch(key, Date.now())
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        const idle = this.idle
        const nowMs = idle === null ? 0 : Date.now()
        for (const entry of entries) {
            const key = signalAddressKey(entry.address)
            setBoundedMapEntry(
                this.remoteIdentities,
                key,
                entry.identityKey,
                this.maxRemoteIdentities,
                idle?.delete
            )
            idle?.touch(key, nowMs)
        }
    }

    public async clear(): Promise<void> {
        this.remoteIdentities.clear()
        this.idle?.clear()
    }

    /**
     * Evicts the identities idle for at least `ttlMs` as of `nowMs` and
     * returns how many were evicted. Runs on a timer when `ttlMs` is set; a
     * no-op otherwise.
     */
    public async cleanupExpired(nowMs: number): Promise<number> {
        if (this.idle === null) return 0
        return this.idle.sweep(nowMs, (key) => {
            this.remoteIdentities.delete(key)
        })
    }

    public async destroy(): Promise<void> {
        this.cleanup?.destroy()
        await this.clear()
    }
}
