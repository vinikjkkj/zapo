import {
    aesCtrDecrypt,
    aesCtrEncrypt,
    aesGcmDecrypt,
    hkdf,
    pbkdf2Sha256,
    randomBytesAsync,
    type SignalKeyPair,
    toRawPubKey,
    X25519
} from '@crypto'
import { proto } from '@proto'
import { WA_PAIRING_KDF_INFO } from '@protocol'
import {
    computeAdvIdentityHmac,
    generateDeviceIdentityAccountSignature,
    signKeyIndexList
} from '@signal'
import { concatBytes, decodeBase64Url, TEXT_ENCODER, uint8Equal } from '@util/bytes'

const PEM_HKDF_INFO = TEXT_ENCODER.encode('Canonical Ent Companion Nonce Encrypt')

const PBKDF2_ITERATIONS = 131_072
const PAIRING_AES_KEY_BYTES = 32

/**
 * `@sensitive` `advSecretKey` is companion secret material; consumers must not
 * persist it without encryption at rest.
 *
 * Fields decoded from a companion pairing QR string. The companion (the device
 * being linked) generates these; the primary consumes them to sign the device
 * identity. `advSecretKey` is the companion's secret, not the primary's.
 */
export interface ParsedCompanionQr {
    readonly ref: string
    readonly noisePublicKey: Uint8Array
    readonly identityPublicKey: Uint8Array
    readonly advSecretKey: Uint8Array
    readonly platform: string
}

/**
 * Parses a companion pairing QR of the form
 * `ref,noisePubB64,identityPubB64,advSecretB64,platform`. The `ref` may itself
 * contain commas, so the four trailing fields are taken from the end.
 *
 * @throws when fewer than 5 comma-separated fields are present.
 */
export function parseCompanionQr(qr: string): ParsedCompanionQr {
    const parts = qr.split(',')
    if (parts.length < 5) {
        throw new Error(
            `companion qr must have at least 5 comma-separated parts, got ${parts.length}`
        )
    }
    const platform = parts[parts.length - 1]
    const advSecretB64 = parts[parts.length - 2]
    const identityPubB64 = parts[parts.length - 3]
    const noisePubB64 = parts[parts.length - 4]
    const ref = parts.slice(0, parts.length - 4).join(',')
    return {
        ref,
        noisePublicKey: decodeBase64Url(noisePubB64, 'companionQr.noisePublicKey'),
        identityPublicKey: decodeBase64Url(identityPubB64, 'companionQr.identityPublicKey'),
        advSecretKey: decodeBase64Url(advSecretB64, 'companionQr.advSecretKey'),
        platform
    }
}

/** `@sensitive` Carries the primary's `accountIdentityKeyPair` private key. */
export interface BuildSignedKeyIndexListInput {
    readonly accountIdentityKeyPair: SignalKeyPair
    readonly rawId: number
    readonly currentIndex: number
    readonly timestampSeconds: number
    readonly validIndexes: readonly number[]
}

/**
 * Builds the account-signed `ADVSignedKeyIndexList` bytes for the current device
 * set. The zero-valued `accountType` enum is omitted to match the phone's byte
 * layout.
 */
export async function buildSignedKeyIndexList(
    input: BuildSignedKeyIndexListInput
): Promise<Uint8Array> {
    const details = proto.ADVKeyIndexList.encode({
        rawId: input.rawId,
        timestamp: input.timestampSeconds,
        currentIndex: input.currentIndex,
        validIndexes: [...input.validIndexes]
    }).finish()
    const accountSignature = await signKeyIndexList(details, input.accountIdentityKeyPair)
    return proto.ADVSignedKeyIndexList.encode({ details, accountSignature }).finish()
}

/**
 * `@sensitive` Carries the primary's `accountIdentityKeyPair` private key and the
 * companion's `advSecretKey`; do not persist unencrypted.
 */
export interface BuildSignedCompanionIdentityInput {
    readonly accountIdentityKeyPair: SignalKeyPair
    readonly companionIdentityPublicKey: Uint8Array
    readonly advSecretKey: Uint8Array
    readonly rawId: number
    readonly keyIndex: number
    readonly timestampSeconds: number
    readonly validIndexes: readonly number[]
}

export interface SignedCompanionIdentity {
    /** `ADVSignedDeviceIdentityHMAC` bytes for the `<device-identity>` node. */
    readonly deviceIdentityBytes: Uint8Array
    /** `ADVSignedKeyIndexList` bytes for the `<key-index-list>` node. */
    readonly keyIndexListBytes: Uint8Array
}

/**
 * Builds the signed device identity and key-index list for a linking companion.
 * The byte layout mirrors WhatsApp's phone (and the in-repo fake-server
 * reference): the zero-valued `accountType`/`deviceType` enum fields are omitted
 * so the signed `details` match what the companion verifies.
 */
export async function buildSignedCompanionIdentity(
    input: BuildSignedCompanionIdentityInput
): Promise<SignedCompanionIdentity> {
    const accountSignatureKey = toRawPubKey(input.accountIdentityKeyPair.pubKey)

    const details = proto.ADVDeviceIdentity.encode({
        rawId: input.rawId,
        timestamp: input.timestampSeconds,
        keyIndex: input.keyIndex
    }).finish()

    const accountSignature = await generateDeviceIdentityAccountSignature(
        details,
        input.companionIdentityPublicKey,
        input.accountIdentityKeyPair
    )

    const signedIdentity = proto.ADVSignedDeviceIdentity.encode({
        details,
        accountSignatureKey,
        accountSignature
    }).finish()

    const hmac = computeAdvIdentityHmac(input.advSecretKey, signedIdentity)
    const deviceIdentityBytes = proto.ADVSignedDeviceIdentityHMAC.encode({
        details: signedIdentity,
        hmac
    }).finish()

    const keyIndexListBytes = await buildSignedKeyIndexList({
        accountIdentityKeyPair: input.accountIdentityKeyPair,
        rawId: input.rawId,
        currentIndex: input.keyIndex,
        timestampSeconds: input.timestampSeconds,
        validIndexes: input.validIndexes
    })

    return { deviceIdentityBytes, keyIndexListBytes }
}

/**
 * Derives the `<pem>` AES-GCM key the phone ships in the pair-device upload:
 * `HKDF-SHA256(ikm = advSecret, salt = companionNoisePublicKey, info)`. Not yet
 * verified against a live server from this implementation; see
 * `CompanionHostOptions.includePem`.
 */
export function derivePemKey(
    advSecretKey: Uint8Array,
    companionNoisePublicKey: Uint8Array
): Uint8Array {
    return hkdf(advSecretKey, companionNoisePublicKey, PEM_HKDF_INFO, 32)
}

/**
 * `@sensitive` Holds the `primaryEphemeralKeyPair` private key and the derived
 * `sharedEphemeral`; keep in memory only, never persist unencrypted.
 */
export interface LinkCodePrimaryHello {
    readonly primaryEphemeralKeyPair: SignalKeyPair
    /** `salt(32) || counter(16) || AES-CTR(primaryEphemeralPub)` for `primary_hello`. */
    readonly wrappedPrimaryEphemeralPub: Uint8Array
    /** ECDH(primaryEphemeralPriv, companionEphemeralPub); stashed for the finish step. */
    readonly sharedEphemeral: Uint8Array
}

/**
 * Link-code handshake, primary step 1: unwrap the companion ephemeral with the
 * pairing code, generate the primary ephemeral, compute the shared ECDH secret,
 * and wrap the primary ephemeral for the `primary_hello` stanza. Mirror of the
 * companion's `createCompanionHello` + primary-ephemeral unwrap.
 */
export async function preparePrimaryHello(args: {
    readonly pairingCode: string
    readonly wrappedCompanionEphemeralPub: Uint8Array
}): Promise<LinkCodePrimaryHello> {
    if (args.wrappedCompanionEphemeralPub.length < 48) {
        throw new Error(
            `wrapped companion ephemeral pub too short: ${args.wrappedCompanionEphemeralPub.length} bytes (need >= 48)`
        )
    }
    const codeBytes = TEXT_ENCODER.encode(args.pairingCode)
    const companionCipherKey = await pbkdf2Sha256(
        codeBytes,
        args.wrappedCompanionEphemeralPub.subarray(0, 32),
        PBKDF2_ITERATIONS,
        PAIRING_AES_KEY_BYTES
    )
    const companionEphemeralPub = aesCtrDecrypt(
        companionCipherKey,
        args.wrappedCompanionEphemeralPub.subarray(32, 48),
        args.wrappedCompanionEphemeralPub.subarray(48)
    )

    const [primaryEphemeralKeyPair, salt, counter] = await Promise.all([
        X25519.generateKeyPair(),
        randomBytesAsync(32),
        randomBytesAsync(16)
    ])
    const primaryCipherKey = await pbkdf2Sha256(
        codeBytes,
        salt,
        PBKDF2_ITERATIONS,
        PAIRING_AES_KEY_BYTES
    )
    const encrypted = aesCtrEncrypt(primaryCipherKey, counter, primaryEphemeralKeyPair.pubKey)
    const sharedEphemeral = await X25519.scalarMult(
        primaryEphemeralKeyPair.privKey,
        companionEphemeralPub
    )

    return {
        primaryEphemeralKeyPair,
        wrappedPrimaryEphemeralPub: concatBytes([salt, counter, encrypted]),
        sharedEphemeral
    }
}

/**
 * Link-code handshake, primary step 2: decrypt the `companion_finish` key bundle
 * and derive the shared `advSecret` (byte-identical to what the companion
 * derives). Validates that the bundle binds both identities.
 *
 * @throws when the bundle's embedded identities do not match.
 */
export async function completePrimaryHandshake(args: {
    readonly sharedEphemeral: Uint8Array
    readonly wrappedKeyBundle: Uint8Array
    readonly companionIdentityPub: Uint8Array
    readonly primaryIdentityKeyPair: SignalKeyPair
}): Promise<Uint8Array> {
    const bundleEncryptionKey = hkdf(
        args.sharedEphemeral,
        args.wrappedKeyBundle.subarray(0, 32),
        WA_PAIRING_KDF_INFO.LINK_CODE_BUNDLE,
        32
    )
    const plaintextBundle = aesGcmDecrypt(
        bundleEncryptionKey,
        args.wrappedKeyBundle.subarray(32, 44),
        args.wrappedKeyBundle.subarray(44)
    )
    const bundleCompanionIdentity = plaintextBundle.subarray(0, 32)
    const bundlePrimaryIdentity = plaintextBundle.subarray(32, 64)
    const bundleSecret = plaintextBundle.subarray(64)

    const rawCompanionIdentity = toRawPubKey(args.companionIdentityPub)
    if (!uint8Equal(bundlePrimaryIdentity, toRawPubKey(args.primaryIdentityKeyPair.pubKey))) {
        throw new Error('link-code bundle primary identity mismatch')
    }
    if (!uint8Equal(bundleCompanionIdentity, rawCompanionIdentity)) {
        throw new Error('link-code bundle companion identity mismatch')
    }

    const sharedIdentity = await X25519.scalarMult(
        args.primaryIdentityKeyPair.privKey,
        rawCompanionIdentity
    )
    return hkdf(
        concatBytes([args.sharedEphemeral, sharedIdentity, bundleSecret]),
        null,
        WA_PAIRING_KDF_INFO.ADV_SECRET,
        32
    )
}
