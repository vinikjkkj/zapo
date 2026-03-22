import { randomIntAsync } from '@crypto'
import { toSerializedPubKey } from '@crypto/core/keys'
import { X25519 } from '@crypto/curves/X25519'
import { signSignalMessage } from '@signal/crypto/WaAdvSignature'
import type { PreKeyRecord, RegistrationInfo, SignedPreKeyRecord } from '@signal/types'

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

export async function generatePreKeyPair(keyId: number): Promise<PreKeyRecord> {
    return {
        keyId,
        keyPair: await X25519.generateKeyPair(),
        uploaded: false
    }
}

export async function generateSignedPreKey(
    keyId: number,
    signingPrivateKey: Uint8Array
): Promise<SignedPreKeyRecord> {
    const keyPair = await X25519.generateKeyPair()
    const serializedPubKey = toSerializedPubKey(keyPair.pubKey)
    const signature = await signSignalMessage(signingPrivateKey, serializedPubKey)
    return {
        keyId,
        keyPair,
        signature,
        uploaded: false
    }
}

export async function generateRegistrationId(): Promise<number> {
    return await randomIntAsync(1, 16_381)
}
