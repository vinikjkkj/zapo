/**
 * Layer 1 — crypto primitives wrapper.
 *
 * Re-exports cryptographic primitives from zapo-js. These are bit-exact
 * implementations with no protocol interpretation, so reusing them does not
 * create the tautology described in AGENTS.md §2.
 */

export {
    aesGcmDecrypt,
    aesGcmEncrypt,
    Ed25519,
    hkdf,
    hkdfSplit,
    hmacSign,
    importAesGcmKey,
    importHmacKey,
    randomBytesAsync,
    sha256,
    X25519
} from 'zapo-js/crypto'
export type { CryptoKey, SignalKeyPair } from 'zapo-js/crypto'
export { signSignalMessage, verifySignalSignature } from 'zapo-js/signal'
