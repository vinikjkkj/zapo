/** Receiver-side SenderKey session for group `skmsg` decrypt. */

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
    nextIteration: number
    chainKey: Uint8Array
    signingPublicKey: Uint8Array
}

export class FakePeerGroupRecvSession {
    private readonly records = new Map<string, RecvSenderKeyRecord>()

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
        // verifySignalSignature mutates the signature buffer; isolate with copies.
        const versionedContent = skmsgBytes.subarray(0, sigStart).slice()
        const signature = skmsgBytes.subarray(sigStart).slice()
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
