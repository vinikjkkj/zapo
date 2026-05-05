import { hmacSha256Sign, toRawPubKey, xeddsaSign, xeddsaVerify } from '@crypto'
import type { SignalKeyPair } from '@crypto/curves/types'
import {
    ADV_PREFIX_ACCOUNT_SIGNATURE,
    ADV_PREFIX_DEVICE_SIGNATURE,
    ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE,
    ADV_PREFIX_HOSTED_DEVICE_SIGNATURE
} from '@signal/crypto/constants'
import { concatBytes } from '@util/bytes'

export {
    ADV_PREFIX_ACCOUNT_SIGNATURE,
    ADV_PREFIX_DEVICE_SIGNATURE,
    ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE,
    ADV_PREFIX_HOSTED_DEVICE_SIGNATURE
} from '@signal/crypto/constants'

export async function verifyDeviceIdentityAccountSignature(
    details: Uint8Array,
    accountSignature: Uint8Array,
    identityPublicKey: Uint8Array,
    accountSignatureKey: Uint8Array,
    isHosted = false
): Promise<boolean> {
    const prefix = isHosted ? ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE : ADV_PREFIX_ACCOUNT_SIGNATURE
    const message = concatBytes([prefix, details, identityPublicKey])
    return xeddsaVerify(toRawPubKey(accountSignatureKey), message, accountSignature)
}

export async function generateDeviceSignature(
    details: Uint8Array,
    identityKeyPair: SignalKeyPair,
    accountSignatureKey: Uint8Array,
    isHosted = false
): Promise<Uint8Array> {
    const prefix = isHosted ? ADV_PREFIX_HOSTED_DEVICE_SIGNATURE : ADV_PREFIX_DEVICE_SIGNATURE
    const message = concatBytes([prefix, details, identityKeyPair.pubKey, accountSignatureKey])
    return xeddsaSign(identityKeyPair.privKey, message)
}

export function computeAdvIdentityHmac(secretKey: Uint8Array, details: Uint8Array): Uint8Array {
    return hmacSha256Sign(secretKey, details)
}
