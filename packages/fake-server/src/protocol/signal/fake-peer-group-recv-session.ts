/**
 * Fake-peer-side group SenderKey RECEIVE session.
 *
 * Decrypts inbound `<enc type="skmsg"/>` ciphertexts a real `WaClient`
 * sends to a group the fake peer is a member of. Pairs with the 1:1
 * `FakePeerRecvSession` (which decrypts the bootstrap pkmsg/msg
 * carrying the `senderKeyDistributionMessage`) to complete the
 * end-to-end group decrypt path.
 *
 * Sources:
 *   /deobfuscated/WASignal/WASignalSenderKeyRecord.js
 *   /deobfuscated/WASignal/WASignalSenderKeyMessage.js
 *
 * Cross-checked against the lib's `SenderKeyManager.decryptGroupMessage`
 * (`src/signal/group/SenderKeyManager.ts`) and the chain key derivation
 * in `src/signal/group/SenderKeyChain.ts`.
 *
 * Wire format (skmsg ciphertext bytes):
 *
 *     versionByte (0x33) || SenderKeyMessage proto || 64-byte XEdDSA signature
 *
 * Where the proto carries `id`, `iteration`, `ciphertext` and the
 * AES-CBC plaintext is the same PKCS-padded `Message` proto used by
 * the 1:1 path.
 */

import {
    aesCbcDecrypt,
    hkdf,
    hmacSign,
    importAesCbcKey,
    importHmacKey,
    toSerializedPubKey,
    verifySignalSignature
} from '../../transport/crypto'
import { proto } from '../../transport/protos'

const SIGNAL_GROUP_VERSION = 3
const SIGNAL_SIGNATURE_LENGTH = 64
const MESSAGE_KEY_LABEL = new Uint8Array([1])
const CHAIN_KEY_LABEL = new Uint8Array([2])
const WHISPER_GROUP_INFO = 'WhisperGroup'

export class FakePeerGroupRecvSessionError extends Error {
    public constructor(message: string) {
        super(message)
        this.name = 'FakePeerGroupRecvSessionError'
    }
}

interface RecvSenderKeyRecord {
    keyId: number
    /** Next iteration we expect to derive from `chainKey`. */
    nextIteration: number
    chainKey: Uint8Array
    /** 33-byte serialized XEdDSA verification key. */
    signingPublicKey: Uint8Array
}

/**
 * Per-(groupId, senderJid) recv state on the fake peer side. Bootstrapped
 * by `addDistribution(...)` which parses the `axolotlSenderKeyDistributionMessage`
 * bytes the fake peer pulled out of the bootstrap pkmsg, and reused for
 * subsequent skmsgs in the same chain.
 */
export class FakePeerGroupRecvSession {
    private readonly records = new Map<string, RecvSenderKeyRecord>()

    /**
     * Bootstraps a recv senderkey state from a `SenderKeyDistributionMessage`
     * payload (the inner bytes of `axolotlSenderKeyDistributionMessage`).
     */
    public addDistribution(
        groupId: string,
        senderJid: string,
        axolotlBytes: Uint8Array
    ): void {
        if (axolotlBytes.byteLength < 1) {
            throw new FakePeerGroupRecvSessionError('SKDM payload empty')
        }
        const version = axolotlBytes[0] >>> 4
        if (version !== SIGNAL_GROUP_VERSION) {
            throw new FakePeerGroupRecvSessionError(
                `unsupported SKDM version ${version}`
            )
        }
        const body = axolotlBytes.subarray(1)
        const decoded = proto.SenderKeyDistributionMessage.decode(body)
        if (
            decoded.id === null ||
            decoded.id === undefined ||
            decoded.iteration === null ||
            decoded.iteration === undefined ||
            !decoded.chainKey ||
            !decoded.signingKey
        ) {
            throw new FakePeerGroupRecvSessionError('invalid SKDM')
        }
        if (decoded.chainKey.byteLength !== 32) {
            throw new FakePeerGroupRecvSessionError(
                `SKDM chainKey must be 32 bytes, got ${decoded.chainKey.byteLength}`
            )
        }
        this.records.set(recordKey(groupId, senderJid), {
            keyId: decoded.id,
            nextIteration: decoded.iteration,
            chainKey: decoded.chainKey,
            signingPublicKey: toSerializedPubKey(decoded.signingKey)
        })
    }

    /**
     * Decrypts a group `<enc type="skmsg"/>` payload. Requires
     * `addDistribution` to have been called first for the same
     * (groupId, senderJid) pair.
     */
    public async decryptGroupMessage(
        groupId: string,
        senderJid: string,
        skmsgBytes: Uint8Array
    ): Promise<Uint8Array> {
        const record = this.records.get(recordKey(groupId, senderJid))
        if (!record) {
            throw new FakePeerGroupRecvSessionError(
                `no senderkey state for group=${groupId} sender=${senderJid}`
            )
        }
        if (skmsgBytes.byteLength < 1 + SIGNAL_SIGNATURE_LENGTH) {
            throw new FakePeerGroupRecvSessionError('skmsg too short')
        }
        const versionByte = skmsgBytes[0]
        if (versionByte >>> 4 !== SIGNAL_GROUP_VERSION) {
            throw new FakePeerGroupRecvSessionError(
                `unsupported skmsg version ${versionByte >>> 4}`
            )
        }
        const sigStart = skmsgBytes.byteLength - SIGNAL_SIGNATURE_LENGTH
        const versionedContent = skmsgBytes.subarray(0, sigStart)
        const signature = skmsgBytes.subarray(sigStart)
        const protoBody = versionedContent.subarray(1)

        const decoded = proto.SenderKeyMessage.decode(protoBody)
        if (
            decoded.id === null ||
            decoded.id === undefined ||
            decoded.iteration === null ||
            decoded.iteration === undefined ||
            !decoded.ciphertext
        ) {
            throw new FakePeerGroupRecvSessionError('invalid SenderKeyMessage')
        }
        if (decoded.id !== record.keyId) {
            throw new FakePeerGroupRecvSessionError(
                `senderKey id mismatch: got ${decoded.id}, expected ${record.keyId}`
            )
        }

        const validSignature = await verifySignalSignature(
            record.signingPublicKey,
            versionedContent,
            signature
        )
        if (!validSignature) {
            throw new FakePeerGroupRecvSessionError('invalid sender key signature')
        }

        const targetIteration = decoded.iteration
        if (targetIteration < record.nextIteration) {
            throw new FakePeerGroupRecvSessionError(
                `out-of-order skmsg iteration ${targetIteration} < ${record.nextIteration}`
            )
        }

        // Walk the chain forward to the requested iteration. Same scheme
        // as the lib: HMAC(chainKey, [1]) → seed input, HMAC(chainKey, [2])
        // → next chain key, HKDF(seed, "WhisperGroup", 50) → message seed.
        let chainKey = record.chainKey
        let seed: Uint8Array | null = null
        let iteration = record.nextIteration
        while (iteration <= targetIteration) {
            const hmacKeyHandle = await importHmacKey(chainKey)
            const [nextChainRaw, messageInputKey] = await Promise.all([
                hmacSign(hmacKeyHandle, CHAIN_KEY_LABEL),
                hmacSign(hmacKeyHandle, MESSAGE_KEY_LABEL)
            ])
            const messageSeed = await hkdf(messageInputKey, null, WHISPER_GROUP_INFO, 50)
            if (iteration === targetIteration) {
                seed = messageSeed
            }
            chainKey = nextChainRaw.subarray(0, 32)
            iteration += 1
        }
        if (!seed) {
            throw new FakePeerGroupRecvSessionError('failed to derive message seed')
        }
        record.chainKey = chainKey
        record.nextIteration = iteration

        const iv = seed.subarray(0, 16)
        const keyBytes = seed.subarray(16, 48)
        const cipherKey = await importAesCbcKey(keyBytes)
        const padded = await aesCbcDecrypt(cipherKey, iv, decoded.ciphertext)
        return unpadPkcs7(padded)
    }
}

function recordKey(groupId: string, senderJid: string): string {
    return `${groupId}\u0000${senderJid}`
}

function unpadPkcs7(padded: Uint8Array): Uint8Array {
    if (padded.byteLength === 0) return padded
    const padLen = padded[padded.byteLength - 1]
    if (padLen === 0 || padLen > 16) return padded
    if (padLen > padded.byteLength) return padded
    return padded.subarray(0, padded.byteLength - padLen)
}
