import { hexToBytes } from '@util/bytes'

/**
 * ML-KEM-1024 (FIPS 203, the standardized CRYSTALS-Kyber-1024) sizes, in bytes.
 * A public key or ciphertext coming off the wire is length-checked against them.
 */
export const ML_KEM_1024_PUBLIC_KEY_BYTES = 1568
export const ML_KEM_1024_CIPHERTEXT_BYTES = 1568
export const ML_KEM_1024_SHARED_SECRET_BYTES = 32

/**
 * Fixed ASN.1 SubjectPublicKeyInfo prefix OpenSSL prepends to a raw ML-KEM-1024
 * encapsulation key. Stripping it yields the 1568-byte raw key WhatsApp sends on
 * the wire; prepending it turns a peer's raw key back into DER for
 * `createPublicKey`. Same strip/prepend pattern used for X25519/Ed25519.
 */
export const ML_KEM_1024_SPKI_PREFIX: Readonly<Uint8Array> = hexToBytes(
    '30820632300b06096086480165030404030382062100'
)
