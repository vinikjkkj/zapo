import { signalAddressKey } from '@protocol/jid'
import type { SignalAddress } from '@signal/types'
import type { WaIdentityStore as WaIdentityStoreContract } from '@store/contracts/identity.store'
import { resolvePositive } from '@util/coercion'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_MAX_REMOTE_IDENTITIES = 8_192

export interface WaIdentityMemoryStoreOptions {
    readonly maxRemoteIdentities?: number
}

export class WaIdentityMemoryStore implements WaIdentityStoreContract {
    protected readonly remoteIdentities: Map<string, Uint8Array>
    private readonly maxRemoteIdentities: number

    public constructor(options: WaIdentityMemoryStoreOptions = {}) {
        this.remoteIdentities = new Map()
        this.maxRemoteIdentities = resolvePositive(
            options.maxRemoteIdentities,
            DEFAULT_MAX_REMOTE_IDENTITIES,
            'WaIdentityMemoryStoreOptions.maxRemoteIdentities'
        )
    }

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        const key = signalAddressKey(address)
        const identityKey = this.remoteIdentities.get(key)
        if (identityKey === undefined) return null
        this.onEntryAccess(key)
        return identityKey
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        const result = new Array<Uint8Array | null>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            const key = signalAddressKey(addresses[i])
            const identityKey = this.remoteIdentities.get(key)
            if (identityKey === undefined) {
                result[i] = null
            } else {
                this.onEntryAccess(key)
                result[i] = identityKey
            }
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
            this.onEvict
        )
        this.onEntryAccess(key)
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        for (const entry of entries) {
            const key = signalAddressKey(entry.address)
            setBoundedMapEntry(
                this.remoteIdentities,
                key,
                entry.identityKey,
                this.maxRemoteIdentities,
                this.onEvict
            )
            this.onEntryAccess(key)
        }
    }

    public async clear(): Promise<void> {
        this.remoteIdentities.clear()
        this.onEntriesClear()
    }

    /** Runs with the key of every read hit and write. No-op unless a subclass tracks access. */
    protected onEntryAccess(key: string): void {}

    /** Runs with the key of every cap-evicted entry. */
    protected onEntryRemove(key: string): void {}

    protected onEntriesClear(): void {}

    private readonly onEvict = (key: string): void => this.onEntryRemove(key)
}
