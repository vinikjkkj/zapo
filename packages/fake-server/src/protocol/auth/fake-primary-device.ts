/** Fake primary-device identity/signature helpers for pairing. */

import {
    hmacSign,
    importHmacKey,
    type SignalKeyPair,
    X25519,
    xeddsaSign
} from '../../transport/crypto'
import { proto } from '../../transport/protos'

const ADV_PREFIX_ACCOUNT_SIGNATURE = new Uint8Array([0x06, 0x00])

export interface FakePrimaryDevice {
    readonly identityKeyPair: SignalKeyPair
}

export async function generateFakePrimaryDevice(): Promise<FakePrimaryDevice> {
    return {
        identityKeyPair: await X25519.generateKeyPair()
    }
}

export interface BuildAdvIdentityInput {
    readonly primary: FakePrimaryDevice
    readonly advSecretKey: Uint8Array
    readonly companionIdentityPublicKey: Uint8Array
    readonly companionDeviceId: number
    readonly timestampSeconds?: number
    readonly keyIndex?: number
}

export interface BuildAdvIdentityResult {
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

    // Sign exactly: prefix || details || companionIdentityPublicKey.
    const accountSignatureKey = input.primary.identityKeyPair.pubKey
    const messageToSign = concatBytes([
        ADV_PREFIX_ACCOUNT_SIGNATURE,
        advDeviceIdentity,
        input.companionIdentityPublicKey
    ])
    const accountSignature = await xeddsaSign(input.primary.identityKeyPair.privKey, messageToSign)

    const signedIdentity = proto.ADVSignedDeviceIdentity.encode({
        details: advDeviceIdentity,
        accountSignatureKey,
        accountSignature
    }).finish()

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
