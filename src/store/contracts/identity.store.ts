import type { SignalAddress } from '@signal/types'

export interface WaIdentityStore {
    getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null>
    getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]>
    setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void>
    setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void>
    clear(): Promise<void>
}
