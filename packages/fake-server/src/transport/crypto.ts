/**
 * Layer 1 — crypto primitives wrapper.
 *
 * Re-exports cryptographic primitives from zapo-js. These are bit-exact
 * implementations with no protocol interpretation, so reusing them does not
 * create the tautology described in AGENTS.md §2.
 */

export {
    aesCbcDecrypt,
    aesCbcEncrypt,
    aesGcmDecrypt,
    aesGcmEncrypt,
    Ed25519,
    hkdf,
    hkdfSplit,
    hmacSign,
    importAesCbcKey,
    importAesGcmKey,
    importHmacKey,
    importHmacSha512Key,
    prependVersion,
    randomBytesAsync,
    readVersionedContent,
    sha256,
    sha512,
    toRawPubKey,
    toSerializedPubKey,
    X25519
} from 'zapo-js/crypto'
export type { CryptoKey, SignalKeyPair } from 'zapo-js/crypto'
export { signSignalMessage, verifySignalSignature } from 'zapo-js/signal'
