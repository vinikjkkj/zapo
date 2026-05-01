import type { PreKeyRecord, SignalAddress } from 'zapo-js/signal'

import { signalAddressFromLibsignalString } from '../util/address'

import type { BaileysKeyPair } from './types'

export function convertBaileysPreKey(
    keyId: number,
    keyPair: BaileysKeyPair,
    options: { readonly uploaded?: boolean } = {}
): PreKeyRecord {
    return {
        keyId,
        keyPair: {
            pubKey: keyPair.public,
            privKey: keyPair.private
        },
        uploaded: options.uploaded
    }
}

export function convertBaileysIdentityKey(
    addrEncoded: string,
    identityKey: Uint8Array,
    options: { readonly server?: string } = {}
): { readonly address: SignalAddress; readonly identityKey: Uint8Array } {
    return {
        address: signalAddressFromLibsignalString(addrEncoded, options),
        identityKey
    }
}
