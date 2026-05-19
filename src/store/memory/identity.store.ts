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
    private readonly remoteIdentities: Map<string, Uint8Array>
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
        return this.remoteIdentities.get(signalAddressKey(address)) ?? null
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        const result = new Array<Uint8Array | null>(addresses.length)
        for (let i = 0; i < addresses.length; i += 1) {
            result[i] = this.remoteIdentities.get(signalAddressKey(addresses[i])) ?? null
        }
        return result
    }

    public async setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void> {
        setBoundedMapEntry(
            this.remoteIdentities,
            signalAddressKey(address),
            identityKey,
            this.maxRemoteIdentities
        )
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        for (const entry of entries) {
            setBoundedMapEntry(
                this.remoteIdentities,
                signalAddressKey(entry.address),
                entry.identityKey,
                this.maxRemoteIdentities
            )
        }
    }

    public async clear(): Promise<void> {
        this.remoteIdentities.clear()
    }
}
