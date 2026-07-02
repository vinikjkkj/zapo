import { encodeBytesToCrockford } from '@auth/pairing/pairing-code-crypto'
import { aesGcmEncrypt, hkdf, randomBytesAsync, sha256 } from '@crypto'
import type { SignalKeyPair } from '@crypto/curves/types'
import { X25519 } from '@crypto/curves/X25519'
import { proto } from '@proto'
import { concatBytes, TEXT_ENCODER } from '@util/bytes'

/**
 * Cryptographic core of the WhatsApp "Shortcake" companion-linking protocol
 * (the device-link flow the official clients call CRSC / Shortcake).
 *
 * This module implements ONLY the wire/crypto half: ephemeral X25519 key
 * exchange, the commit-reveal nonce, the verification code, and the AES-GCM
 * pairing envelope. The WebAuthn/passkey assertion that gates the prologue is
 * NOT produced here – it is an opaque input supplied by the caller (so the
 * credential source stays out of the protocol layer).
 *
 * Mirrors `WAWebShortcakeLinkingAlgorithm` from the web client.
 */

const NONCE_BYTES = 32
const VERIFICATION_CODE_BYTES = 5
const GCM_IV_BYTES = 12
const ENCRYPTION_KEY_BYTES = 32
const EPHEMERAL_PUBLIC_KEY_BYTES = 32

/** HKDF `info` for the pairing-request encryption key. */
const ENCRYPTION_KEY_INFO = TEXT_ENCODER.encode('Pairing Information Encryption Key')

/**
 * Decoded `PrimaryEphemeralIdentity` the primary device returns: its ephemeral
 * X25519 public key (32B) and a 32B nonce used to derive the verification code.
 */
export interface ShortcakePrimaryEphemeralIdentity {
    readonly publicKey: Uint8Array
    readonly nonce: Uint8Array
}

/**
 * @sensitive Carries the companion's ephemeral X25519 private key
 * (`keyPair.privKey`) and the pre-image `companionNonce`. Hold these in memory
 * for the handshake only; never log or `JSON.stringify` an instance.
 */
export interface ShortcakeCompanionEphemeralIdentity {
    /** Companion ephemeral X25519 keypair (private half kept for the ECDH). */
    readonly keyPair: SignalKeyPair
    /** 32 random bytes committed up-front, revealed only after the primary replies. */
    readonly companionNonce: Uint8Array
    /** Encoded `CompanionEphemeralIdentity` proto (committed + sent in the prologue). */
    readonly companionEphemeralIdentityBytes: Uint8Array
    /** `SHA-256(companionEphemeralIdentity ‖ companionNonce)` – the commitment hash. */
    readonly commitmentHash: Uint8Array
    /** Encoded `ProloguePayload` proto ready for the `SetPasskeyPrologue` IQ. */
    readonly prologuePayloadBytes: Uint8Array
}

/**
 * Generates the companion's ephemeral identity + commitment for a Shortcake
 * prologue. The companion publishes a commitment to its nonce now and reveals
 * the nonce later (after the primary's identity arrives) so the primary cannot
 * grind the verification code.
 */
export async function generateCompanionEphemeralIdentity(args: {
    readonly ref: string
    readonly deviceType: proto.DeviceProps.PlatformType
}): Promise<ShortcakeCompanionEphemeralIdentity> {
    const [keyPair, companionNonce] = await Promise.all([
        X25519.generateKeyPair(),
        randomBytesAsync(NONCE_BYTES)
    ])

    const companionEphemeralIdentityBytes = proto.CompanionEphemeralIdentity.encode({
        publicKey: keyPair.pubKey,
        deviceType: args.deviceType,
        ref: args.ref
    }).finish()

    const commitmentHash = sha256(concatBytes([companionEphemeralIdentityBytes, companionNonce]))

    const prologuePayloadBytes = proto.ProloguePayload.encode({
        companionEphemeralIdentity: companionEphemeralIdentityBytes,
        commitment: { hash: commitmentHash }
    }).finish()

    return {
        keyPair,
        companionNonce,
        companionEphemeralIdentityBytes,
        commitmentHash,
        prologuePayloadBytes
    }
}

/** Parses + validates a `PrimaryEphemeralIdentity` proto from the primary. */
export function decodePrimaryEphemeralIdentity(
    bytes: Uint8Array
): ShortcakePrimaryEphemeralIdentity {
    const decoded = proto.PrimaryEphemeralIdentity.decode(bytes)
    const publicKey = decoded.publicKey
    const nonce = decoded.nonce
    if (!publicKey || publicKey.length !== EPHEMERAL_PUBLIC_KEY_BYTES) {
        throw new Error('shortcake: PrimaryEphemeralIdentity.publicKey must be 32 bytes')
    }
    if (!nonce || nonce.length !== NONCE_BYTES) {
        throw new Error('shortcake: PrimaryEphemeralIdentity.nonce must be 32 bytes')
    }
    return { publicKey, nonce }
}

/**
 * Derives the short verification code shown on both devices:
 * `Crockford32( primaryNonce[0..5] XOR SHA-256(companionNonce ‖ primaryPubKey)[0..5] )`.
 */
export function deriveVerificationCode(
    companionNonce: Uint8Array,
    primary: ShortcakePrimaryEphemeralIdentity
): string {
    const digest = sha256(concatBytes([companionNonce, primary.publicKey]))
    const code = new Uint8Array(VERIFICATION_CODE_BYTES)
    for (let i = 0; i < VERIFICATION_CODE_BYTES; i += 1) {
        code[i] = primary.nonce[i] ^ digest[i]
    }
    return encodeBytesToCrockford(code)
}

/**
 * Derives the AES-GCM key that protects the pairing request:
 * `HKDF( X25519(companionPriv, primaryPub), salt="Companion Pairing <deviceType> with ref <ref>", info="Pairing Information Encryption Key" )`.
 */
export async function deriveEncryptionKey(args: {
    readonly companionPrivKey: Uint8Array
    readonly primaryPublicKey: Uint8Array
    readonly deviceType: proto.DeviceProps.PlatformType
    readonly ref: string
}): Promise<Uint8Array> {
    const shared = await X25519.scalarMult(args.companionPrivKey, args.primaryPublicKey)
    const salt = TEXT_ENCODER.encode(
        `Companion Pairing ${String(args.deviceType)} with ref ${args.ref}`
    )
    return hkdf(shared, salt, ENCRYPTION_KEY_INFO, ENCRYPTION_KEY_BYTES)
}

/**
 * Encrypts the pairing request plaintext under the derived key and returns the
 * encoded `EncryptedPairingRequest` proto (random 12-byte IV).
 */
export async function encryptPairingRequest(
    encryptionKey: Uint8Array,
    plaintext: Uint8Array
): Promise<Uint8Array> {
    if (encryptionKey.length !== ENCRYPTION_KEY_BYTES) {
        throw new Error('shortcake: encryption key must be 32 bytes')
    }
    const iv = await randomBytesAsync(GCM_IV_BYTES)
    const encryptedPayload = aesGcmEncrypt(encryptionKey, iv, plaintext)
    return proto.EncryptedPairingRequest.encode({ encryptedPayload, iv }).finish()
}
