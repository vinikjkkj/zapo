/**
 * Fake "primary device" identity used by the fake server to drive the
 * QR-pairing flow with a real `WaClient`.
 *
 * In real WhatsApp, the primary device is the user's phone — it owns the
 * `accountSignatureKey` and signs new linked devices' identities. The
 * fake server doesn't have a phone, so it generates an ephemeral primary
 * keypair on startup and uses it to sign the `ADVSignedDeviceIdentity`
 * payload that goes into a `pair-success` IQ.
 *
 * Sources:
 *   /deobfuscated/WAWebAdvSignature/WAWebAdvSignatureConstants.js
 *   /deobfuscated/WAWebAdvSignature/WAWebAdvSignatureApi.js
 *   /deobfuscated/WAWebHandlePairSuccess.js
 *   /deobfuscated/pb/WAWebProtobufsAdv_pb.js
 *
 * Cross-checked against the lib's `verifyDeviceIdentityAccountSignature`
 * (`src/signal/crypto/WaAdvSignature.ts`) — the fake primary signs the
 * exact message the lib expects to verify.
 */

import {
    hmacSign,
    importHmacKey,
    type SignalKeyPair,
    signSignalMessage,
    X25519
} from '../../transport/crypto'
import { proto } from '../../transport/protos'

/** `[0x06, 0x00]` per `ADV_PREFIX_DEVICE_IDENTITY_ACCOUNT_SIGNATURE`. */
const ADV_PREFIX_ACCOUNT_SIGNATURE = new Uint8Array([0x06, 0x00])

export interface FakePrimaryDevice {
    /** Long-term primary identity keypair (the "phone" identity). */
    readonly identityKeyPair: SignalKeyPair
}

export async function generateFakePrimaryDevice(): Promise<FakePrimaryDevice> {
    return {
        identityKeyPair: await X25519.generateKeyPair()
    }
}

export interface BuildAdvIdentityInput {
    readonly primary: FakePrimaryDevice
    /**
     * The companion's `advSecretKey` (32 bytes random) — captured by the
     * fake server from the QR string the lib emits via the `auth_qr`
     * event.
     */
    readonly advSecretKey: Uint8Array
    /**
     * The companion's identity public key — also captured from the QR
     * string. The lib's `verifyDeviceIdentityAccountSignature` builds
     * the signed message as `[prefix, details, identityPublicKey]` where
     * `identityPublicKey` is the COMPANION'S key (not the primary).
     */
    readonly companionIdentityPublicKey: Uint8Array
    /** Companion device id (e.g. `1` for the first linked device). */
    readonly companionDeviceId: number
    /** Pairing timestamp in unix seconds (default: now). */
    readonly timestampSeconds?: number
    /** Optional key index (default: 0). */
    readonly keyIndex?: number
}

export interface BuildAdvIdentityResult {
    /** The serialized `ADVSignedDeviceIdentityHMAC` to put in the pair-success IQ. */
    readonly deviceIdentityBytes: Uint8Array
}

export async function buildAdvSignedDeviceIdentity(
    input: BuildAdvIdentityInput
): Promise<BuildAdvIdentityResult> {
    const advDeviceIdentity = proto.ADVDeviceIdentity.encode({
        rawId: input.companionDeviceId,
        timestamp: input.timestampSeconds ?? Math.floor(Date.now() / 1_000),
        keyIndex: input.keyIndex ?? 0
    }).finish()

    // accountSignature = signSignalMessage(primary.identity.priv,
    //                                      [0x06, 0x00] || details || companionIdentityPublicKey)
    // The lib verifies via:
    //   verifySignalSignature(accountSignatureKey,
    //                         [prefix, details, companionIdentityPublicKey],
    //                         accountSignature)
    // where `accountSignatureKey` is the primary's pubkey we put in the
    // ADVSignedDeviceIdentity proto and `identityPublicKey` is the
    // local (companion) identity pubkey from `WaPairingFlow`.
    const accountSignatureKey = input.primary.identityKeyPair.pubKey
    const messageToSign = concatBytes([
        ADV_PREFIX_ACCOUNT_SIGNATURE,
        advDeviceIdentity,
        input.companionIdentityPublicKey
    ])
    const accountSignature = await signSignalMessage(
        input.primary.identityKeyPair.privKey,
        messageToSign
    )

    const signedIdentity = proto.ADVSignedDeviceIdentity.encode({
        details: advDeviceIdentity,
        accountSignatureKey,
        accountSignature
    }).finish()

    // hmac = HMAC-SHA256(advSecretKey, signedIdentity)
    const hmacKey = await importHmacKey(input.advSecretKey)
    const hmac = await hmacSign(hmacKey, signedIdentity)

    const wrapped = proto.ADVSignedDeviceIdentityHMAC.encode({
        details: signedIdentity,
        hmac
    }).finish()

    return { deviceIdentityBytes: wrapped }
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
    let total = 0
    for (const p of parts) total += p.byteLength
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of parts) {
        out.set(p, offset)
        offset += p.byteLength
    }
    return out
}
