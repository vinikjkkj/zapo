import { randomInt } from 'node:crypto'

import { toSerializedPubKey } from '../../crypto/core/keys'
import { X25519 } from '../../crypto/curves/X25519'
import { WaAdvSignature } from '../crypto/WaAdvSignature'
import type { PreKeyRecord, RegistrationInfo, SignedPreKeyRecord } from '../types'

export async function generateRegistrationInfo(): Promise<RegistrationInfo> {
    return {
        registrationId: await generateRegistrationId(),
        identityKeyPair: await X25519.generateKeyPair()
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
    const signature = await WaAdvSignature.signSignalMessage(signingPrivateKey, serializedPubKey)
    return {
        keyId,
        keyPair,
        signature,
        uploaded: false
    }
}

export function generateRegistrationId(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        randomInt(1, 16_381, (error, value) => {
            if (error) {
                reject(error)
                return
            }
            resolve(value)
        })
    })
}
