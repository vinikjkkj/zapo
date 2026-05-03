import type { PreKeyRecord, SignalAddress } from 'zapo-js/signal'

import { signalAddressFromLibsignalString } from '../util/address'
import { keyPairFromPrivate } from '../util/keys'

import { toBool, toNumber } from './numeric'
import type { WhatsmeowIdentityKeyRow, WhatsmeowPreKeyRow } from './types'

/** Async: only the private is stored, public derived via X25519. */
export async function convertWhatsmeowPreKey(row: WhatsmeowPreKeyRow): Promise<PreKeyRecord> {
    const keyPair = await keyPairFromPrivate(row.key)
    return {
        keyId: toNumber(row.key_id, 'pre_keys.key_id'),
        keyPair,
        uploaded: toBool(row.uploaded)
    }
}

export function convertWhatsmeowIdentityKey(
    row: WhatsmeowIdentityKeyRow,
    options: { readonly server?: string } = {}
): { readonly address: SignalAddress; readonly identityKey: Uint8Array } {
    return {
        address: signalAddressFromLibsignalString(row.their_id, options),
        identityKey: row.identity
    }
}
