/** Generates Signal prekey bundles for fake peers. */

import { type SignalKeyPair, toSerializedPubKey, X25519, xeddsaSign } from '../../transport/crypto'

export interface FakePeerKeyBundle {
    readonly registrationId: number
    readonly identityKeyPair: SignalKeyPair
    readonly signedPreKey: {
        readonly id: number
        readonly keyPair: SignalKeyPair
        readonly signature: Uint8Array
    }
    readonly oneTimePreKeys: ReadonlyArray<{
        readonly id: number
        readonly keyPair: SignalKeyPair
    }>
}

export interface GenerateFakePeerKeyBundleOptions {
    readonly oneTimePreKeyCount?: number
    readonly identityKeyPair?: SignalKeyPair
    readonly registrationId?: number
    readonly signedPreKeyId?: number
    readonly firstOneTimePreKeyId?: number
}

export async function generateFakePeerKeyBundle(
    options: GenerateFakePeerKeyBundleOptions = {}
): Promise<FakePeerKeyBundle> {
    const identityKeyPair = options.identityKeyPair ?? (await X25519.generateKeyPair())
    const signedPreKeyKeyPair = await X25519.generateKeyPair()
    const signedPreKeyId = options.signedPreKeyId ?? 1
    const signedPreKeySerialized = toSerializedPubKey(signedPreKeyKeyPair.pubKey)
    const signedPreKeySignature = await xeddsaSign(identityKeyPair.privKey, signedPreKeySerialized)

    const oneTimeCount = options.oneTimePreKeyCount ?? 4
    const firstId = options.firstOneTimePreKeyId ?? 1
    const oneTimePreKeys = await Promise.all(
        Array.from({ length: oneTimeCount }, async (_, idx) => ({
            id: firstId + idx,
            keyPair: await X25519.generateKeyPair()
        }))
    )

    return {
        registrationId: options.registrationId ?? Math.floor(Math.random() * 0x3fff) + 1,
        identityKeyPair,
        signedPreKey: {
            id: signedPreKeyId,
            keyPair: signedPreKeyKeyPair,
            signature: signedPreKeySignature
        },
        oneTimePreKeys
    }
}
