import { isMlKemSupported } from '@crypto/kem/MlKem'
import { WA_DEFAULTS } from '@protocol/constants'
import { SIGNAL_PQ_SESSION_SERVER } from '@signal/constants'
import type { SignalAddress } from '@signal/types'
import { hasPqPreKeyStore, type WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaSessionStore } from '@store/contracts/session.store'

/**
 * Gates for the post-quantum paths. Both are `false` unless the runtime has
 * ML-KEM, the pre-key store implements the post-quantum methods and the
 * matching server flags are on, so a disabled policy leaves the client on
 * classic Signal only.
 */
export interface SignalPqPolicy {
    /** Generate, upload and replenish ML-KEM pre-keys. */
    readonly isKeyUploadEnabled: () => boolean
    /** Establish and write post-quantum 1:1 sessions. */
    readonly isOneToOneEnabled: () => boolean
}

export const SIGNAL_PQ_DISABLED: SignalPqPolicy = Object.freeze({
    isKeyUploadEnabled: () => false,
    isOneToOneEnabled: () => false
})

/**
 * Builds the policy from the server flags: key upload needs `pq_keys_upload`,
 * and 1:1 sessions also need `pq_1on1_message_enabled`. Both require runtime
 * ML-KEM support and a pre-key store with the post-quantum methods. Flags are
 * read on every call, so a sync that arrives later takes effect without a restart.
 */
export function createSignalPqPolicy(
    getFlag: (name: 'pq_keys_upload' | 'pq_1on1_message_enabled') => boolean,
    preKeyStore: WaPreKeyStore
): SignalPqPolicy {
    const isKeyUploadEnabled = () =>
        getFlag('pq_keys_upload') && isMlKemSupported() && hasPqPreKeyStore(preKeyStore)
    return {
        isKeyUploadEnabled,
        isOneToOneEnabled: () => isKeyUploadEnabled() && getFlag('pq_1on1_message_enabled')
    }
}

/**
 * Address of the post-quantum session that runs alongside the classic one for
 * the same device, or `null` when the device cannot hold one (only regular LID
 * devices can).
 */
export function toPqSessionAddress(address: SignalAddress): SignalAddress | null {
    if (
        address.server !== WA_DEFAULTS.LID_SERVER ||
        address.device === WA_DEFAULTS.HOSTED_DEVICE_ID
    ) {
        return null
    }
    return { user: address.user, server: SIGNAL_PQ_SESSION_SERVER, device: address.device }
}

export function isPqSessionAddress(address: SignalAddress): boolean {
    return address.server === SIGNAL_PQ_SESSION_SERVER
}

/** The classic address a post-quantum session address shadows; others pass through. */
export function toClassicSessionAddress(address: SignalAddress): SignalAddress {
    if (!isPqSessionAddress(address)) {
        return address
    }
    return { user: address.user, server: WA_DEFAULTS.LID_SERVER, device: address.device }
}

/** Deletes the classic session and its post-quantum twin, if any. */
export async function deleteSessionScopes(
    store: Pick<WaSessionStore, 'deleteSession'>,
    address: SignalAddress
): Promise<void> {
    const pqAddress = toPqSessionAddress(address)
    await store.deleteSession(address)
    if (pqAddress) {
        await store.deleteSession(pqAddress)
    }
}
