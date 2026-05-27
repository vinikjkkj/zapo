import { randomIntAsync, xeddsaSign } from '@crypto'
import { toSerializedPubKey } from '@crypto/core/keys'
import { X25519 } from '@crypto/curves/X25519'
import type { PreKeyRecord, RegistrationInfo, SignedPreKeyRecord } from '@signal/types'

/**
 * Generates the per-device Signal registration info – a random registration id
 * plus a fresh identity X25519 key pair.
 */
export async function generateRegistrationInfo(): Promise<RegistrationInfo> {
    const [registrationId, identityKeyPair] = await Promise.all([
        generateRegistrationId(),
        X25519.generateKeyPair()
    ])
    return {
        registrationId,
        identityKeyPair
    }
}

/** Generates a fresh one-time prekey record with the given `keyId`. */
export async function generatePreKeyPair(keyId: number): Promise<PreKeyRecord> {
    return {
        keyId,
        keyPair: await X25519.generateKeyPair(),
        uploaded: false
    }
}

/**
 * Generates a signed prekey: a fresh X25519 keypair plus an XEdDSA signature
 * over its serialized public key, signed by `signingPrivateKey` (identity key).
 */
export async function generateSignedPreKey(
    keyId: number,
    signingPrivateKey: Uint8Array
): Promise<SignedPreKeyRecord> {
    const keyPair = await X25519.generateKeyPair()
    const serializedPubKey = toSerializedPubKey(keyPair.pubKey)
    const signature = await xeddsaSign(signingPrivateKey, serializedPubKey)
    return {
        keyId,
        keyPair,
        signature,
        uploaded: false
    }
}

/** Generates a Signal registration id in the valid `[1, 16380]` range. */
export async function generateRegistrationId(): Promise<number> {
    return await randomIntAsync(1, 16_381)
}
