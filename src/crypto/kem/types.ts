/**
 * A post-quantum KEM key pair.
 *
 * `pubKey` is the raw 1568-byte ML-KEM-1024 encapsulation key, exactly as it
 * travels on the wire and is signed. `privKey` is the local decapsulation key
 * held in an opaque node-native encoding (PKCS8 DER); it never leaves the
 * device, so its byte layout is an internal storage detail and does not need
 * to match any peer's representation.
 *
 * @sensitive `privKey` is secret key material. Do not `JSON.stringify` or log
 * instances; the consumer is responsible for encryption-at-rest.
 */
export interface KemKeyPair {
    readonly pubKey: Uint8Array
    readonly privKey: Uint8Array
}

/** Result of encapsulating against a peer's KEM public key. */
export interface KemEncapsulation {
    /** The 1568-byte ciphertext sent to the peer (carried in the pre-key message). */
    readonly ciphertext: Uint8Array
    /** The 32-byte shared secret folded into the PQXDH key derivation. */
    readonly sharedSecret: Uint8Array
}
