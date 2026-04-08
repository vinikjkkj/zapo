/**
 * Builds a Signal pre-key bundle that the fake server can publish on
 * behalf of a `FakePeer` so the real `WaClient` can fetch it via the
 * `<key_fetch>` IQ and start an outgoing Signal session.
 *
 * Sources:
 *   /deobfuscated/WAWebFetch/WAWebFetchPrekeysJob.js
 *   /deobfuscated/WASignal/WASignalKeys.js
 * Cross-checked against the lib's `parseUserKeyBundle` in
 * `src/signal/api/SignalSessionSyncApi.ts` and `initiateSessionOutgoing`
 * in `src/signal/session/SignalSession.ts`.
 *
 * The signed pre-key signature uses the WhatsApp variant of XEdDSA over
 * the **serialized (33-byte, 0x05-prefixed)** signed pre-key public key.
 * Both the lib's `verifySignalSignature` and `signSignalMessage` operate
 * on the serialized form, so we sign the serialized public key here.
 */

import {
    type SignalKeyPair,
    signSignalMessage,
    toSerializedPubKey,
    X25519
} from '../../transport/crypto'

export interface FakePeerKeyBundle {
    /** 32-bit registration id (re-used for the PreKeySignalMessage proto). */
    readonly registrationId: number
    /** Long-term identity keypair (the "Bob" identity from the lib's POV). */
    readonly identityKeyPair: SignalKeyPair
    readonly signedPreKey: {
        readonly id: number
        readonly keyPair: SignalKeyPair
        /** XEdDSA signature over `toSerializedPubKey(signedPreKey.keyPair.pubKey)`. */
        readonly signature: Uint8Array
    }
    readonly oneTimePreKeys: ReadonlyArray<{
        readonly id: number
        readonly keyPair: SignalKeyPair
    }>
}

export interface GenerateFakePeerKeyBundleOptions {
    /** How many one-time prekeys to mint (default: 4). */
    readonly oneTimePreKeyCount?: number
    /** Optional pre-existing identity keypair. */
    readonly identityKeyPair?: SignalKeyPair
    /** Optional pre-existing registration id. */
    readonly registrationId?: number
    /** Optional fixed signed prekey id (default: 1). */
    readonly signedPreKeyId?: number
    /** Optional starting one-time prekey id (default: 1). */
    readonly firstOneTimePreKeyId?: number
}

export async function generateFakePeerKeyBundle(
    options: GenerateFakePeerKeyBundleOptions = {}
): Promise<FakePeerKeyBundle> {
    const identityKeyPair = options.identityKeyPair ?? (await X25519.generateKeyPair())
    const signedPreKeyKeyPair = await X25519.generateKeyPair()
    const signedPreKeyId = options.signedPreKeyId ?? 1
    const signedPreKeySerialized = toSerializedPubKey(signedPreKeyKeyPair.pubKey)
    const signedPreKeySignature = await signSignalMessage(
        identityKeyPair.privKey,
        signedPreKeySerialized
    )

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
