import { WA_DEFAULTS } from '@protocol/constants'
import type { SignalAddress } from '@signal/types'
import { asNumber } from '@util/coercion'

export interface SignalAddressParts {
    readonly user: string
    readonly server: string
    readonly device: number
}

export interface StoreCountRow extends Record<string, unknown> {
    readonly count: unknown
}

/** Flattens a {@link SignalAddress} into plain fields, defaulting `server` to the host domain. */
export function toSignalAddressParts(address: SignalAddress): SignalAddressParts {
    return {
        user: address.user,
        server: address.server ?? WA_DEFAULTS.HOST_DOMAIN,
        device: address.device
    }
}

/**
 * Reads the `count` field of a single-row SQL `COUNT(*)` result, returning
 * `0` when the row is missing.
 */
export function decodeStoreCount(row: StoreCountRow | null, field: string): number {
    return row ? asNumber(row.count, field) : 0
}
