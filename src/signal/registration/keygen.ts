import { generateKemKeyPair, randomIntAsync, xeddsaSign } from '@crypto'
import { toSerializedPubKey } from '@crypto/core/keys'
import { X25519 } from '@crypto/curves/X25519'
import { SIGNAL_KYBER_PREKEY_ID_BORDER } from '@signal/constants'
import type {
    KyberPreKeyRecord,
    PreKeyRecord,
    RegistrationInfo,
    SignedPreKeyRecord
} from '@signal/types'

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

/**
 * Generates a post-quantum (ML-KEM-1024) pre-key: a fresh KEM key pair plus an
 * XEdDSA signature over its raw public key, signed by `signingPrivateKey` (the
 * identity key). `lastResort` marks the long-lived fallback key. The raw public
 * key is signed directly (no Curve25519 `0x05` serialization prefix).
 *
 * @throws when `keyId` is outside the 3-byte wire range `[0, 16777214]`.
 */
export async function generateKyberPreKey(
    keyId: number,
    signingPrivateKey: Uint8Array,
    lastResort = false
): Promise<KyberPreKeyRecord> {
    if (!Number.isSafeInteger(keyId) || keyId < 0 || keyId >= SIGNAL_KYBER_PREKEY_ID_BORDER) {
        throw new Error(`invalid kyber prekey id: ${keyId}`)
    }
    const keyPair = await generateKemKeyPair()
    const signature = await xeddsaSign(signingPrivateKey, keyPair.pubKey)
    return {
        keyId,
        keyPair,
        signature,
        lastResort
    }
}

/** Generates a Signal registration id in the valid `[1, 16380]` range. */
export async function generateRegistrationId(): Promise<number> {
    return await randomIntAsync(1, 16_381)
}
