import { webcrypto } from 'node:crypto'

import { hkdf, randomBytesAsync } from '../../crypto'
import type { SignalKeyPair } from '../../crypto/curves/types'
import { X25519 } from '../../crypto/curves/X25519'
import { WA_PAIRING_KDF_INFO } from '../../protocol/constants'
import { concatBytes, toBytesView } from '../../util/bytes'

import {
    CROCKFORD_ALPHABET,
    PAIRING_TEXT_ENCODER,
    PBKDF2_ITERATIONS
} from './constants'

interface CompanionHelloState {
    readonly pairingCode: string
    readonly companionEphemeralKeyPair: SignalKeyPair
    readonly wrappedCompanionEphemeralPub: Uint8Array
}

interface CompanionFinishResult {
    readonly wrappedKeyBundle: Uint8Array
    readonly companionIdentityPublic: Uint8Array
    readonly advSecret: Uint8Array
}

function bytesToCrockford(bytes: Uint8Array): string {
    let bitCount = 0
    let value = 0
    let out = ''
    for (let i = 0; i < bytes.length; i += 1) {
        value = (value << 8) | bytes[i]
        bitCount += 8
        while (bitCount >= 5) {
            out += CROCKFORD_ALPHABET[(value >>> (bitCount - 5)) & 31]
            bitCount -= 5
        }
    }
    if (bitCount > 0) {
        out += CROCKFORD_ALPHABET[(value << (5 - bitCount)) & 31]
    }
    return out
}

async function derivePairingCipher(code: string, salt: Uint8Array): Promise<webcrypto.CryptoKey> {
    const imported = await webcrypto.subtle.importKey(
        'raw',
        PAIRING_TEXT_ENCODER.encode(code),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    )
    return webcrypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            hash: 'SHA-256',
            salt,
            iterations: PBKDF2_ITERATIONS
        },
        imported,
        {
            name: 'AES-CTR',
            length: 256
        },
        false,
        ['encrypt', 'decrypt']
    )
}

function splitWrappedPrimaryPayload(payload: Uint8Array): {
    readonly salt: Uint8Array
    readonly counter: Uint8Array
    readonly ciphertext: Uint8Array
} {
    if (payload.length <= 48) {
        throw new Error('invalid wrapped primary payload')
    }
    return {
        salt: payload.subarray(0, 32),
        counter: payload.subarray(32, 48),
        ciphertext: payload.subarray(48)
    }
}

export async function createCompanionHello(): Promise<CompanionHelloState> {
    const codeBytes = await randomBytesAsync(5)
    const pairingCode = bytesToCrockford(codeBytes)
    const companionEphemeralKeyPair = await X25519.generateKeyPair()
    const salt = await randomBytesAsync(32)
    const counter = await randomBytesAsync(16)
    const cipher = await derivePairingCipher(pairingCode, salt)
    const encrypted = await webcrypto.subtle.encrypt(
        {
            name: 'AES-CTR',
            counter,
            length: 64
        },
        cipher,
        companionEphemeralKeyPair.pubKey
    )

    return {
        pairingCode,
        companionEphemeralKeyPair,
        wrappedCompanionEphemeralPub: concatBytes([salt, counter, toBytesView(encrypted)])
    }
}

export async function completeCompanionFinish(args: {
    readonly pairingCode: string
    readonly wrappedPrimaryEphemeralPub: Uint8Array
    readonly primaryIdentityPub: Uint8Array
    readonly companionEphemeralPrivKey: Uint8Array
    readonly registrationIdentityKeyPair: SignalKeyPair
}): Promise<CompanionFinishResult> {
    const wrapped = splitWrappedPrimaryPayload(args.wrappedPrimaryEphemeralPub)
    const pairingCipher = await derivePairingCipher(args.pairingCode, wrapped.salt)
    const decryptedPrimary = await webcrypto.subtle.decrypt(
        {
            name: 'AES-CTR',
            counter: wrapped.counter,
            length: 64
        },
        pairingCipher,
        wrapped.ciphertext
    )

    const primaryEphemeralPub = toBytesView(decryptedPrimary)
    if (primaryEphemeralPub.length === 0) {
        throw new Error('empty primary ephemeral public key')
    }

    const sharedEphemeral = await X25519.scalarMult(
        args.companionEphemeralPrivKey,
        primaryEphemeralPub
    )

    const bundleSalt = await randomBytesAsync(32)
    const bundleSecret = await randomBytesAsync(32)
    const bundleIv = await randomBytesAsync(12)

    const bundleEncryptionKeyRaw = await hkdf(
        sharedEphemeral,
        bundleSalt,
        WA_PAIRING_KDF_INFO.LINK_CODE_BUNDLE,
        32
    )
    const bundleEncryptionKey = await webcrypto.subtle.importKey(
        'raw',
        bundleEncryptionKeyRaw,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    )

    const plaintextBundle = concatBytes([
        args.registrationIdentityKeyPair.pubKey,
        args.primaryIdentityPub,
        bundleSecret
    ])
    const encryptedBundle = await webcrypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: bundleIv
        },
        bundleEncryptionKey,
        plaintextBundle
    )

    const wrappedKeyBundle = concatBytes([
        bundleSalt,
        bundleIv,
        toBytesView(encryptedBundle)
    ])

    const sharedIdentity = await X25519.scalarMult(
        args.registrationIdentityKeyPair.privKey,
        args.primaryIdentityPub
    )
    const advMaterial = concatBytes([sharedEphemeral, sharedIdentity, bundleSecret])
    const advSecret = await hkdf(advMaterial, null, WA_PAIRING_KDF_INFO.ADV_SECRET, 32)

    return {
        wrappedKeyBundle,
        companionIdentityPublic: args.registrationIdentityKeyPair.pubKey,
        advSecret
    }
}
