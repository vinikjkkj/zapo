/**
 * Layer 1 – crypto primitives wrapper.
 *
 * Re-exports bit-exact cryptographic primitives from zapo-js. No protocol
 * interpretation, so reusing them does not create a test-vs-impl tautology.
 */

export {
    aesCbcDecrypt,
    aesCbcEncrypt,
    aesGcmDecrypt,
    aesGcmEncrypt,
    Ed25519,
    hkdf,
    hkdfSplit,
    hmacSha256Sign,
    hmacSha512Sign,
    prependVersion,
    randomBytesAsync,
    readVersionedContent,
    sha256,
    sha512,
    toRawPubKey,
    toSerializedPubKey,
    X25519,
    xeddsaSign,
    xeddsaVerify
} from 'zapo-js/crypto'
export type { SignalKeyPair } from 'zapo-js/crypto'
export { WaMediaCrypto } from 'zapo-js/media'
