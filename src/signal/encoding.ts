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

export function toSignalAddressParts(address: SignalAddress): SignalAddressParts {
    return {
        user: address.user,
        server: address.server ?? WA_DEFAULTS.HOST_DOMAIN,
        device: address.device
    }
}

export function decodeStoreCount(row: StoreCountRow | null, field: string): number {
    return row ? asNumber(row.count, field) : 0
}
