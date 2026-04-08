/**
 * Fake-peer-side Sender Key state for group messages.
 *
 * Source:
 *   /deobfuscated/WASignalGroup/WASignalGroupCipher.js
 *   /deobfuscated/WASignal/WASignalWhitepaper.js (deriveSenderKeyMsgKey)
 *
 * Wire format of a SenderKeyMessage (`<enc type="skmsg"/>`):
 *
 *     versionByte (0x33)            // (3<<4)|3
 *     proto.SenderKeyMessage {       // bytes
 *         id: uint32                 // sender key id
 *         iteration: uint32
 *         ciphertext: bytes          // AES-CBC(plaintext)
 *     }
 *     XEdDSA signature (64 bytes)   // signSignalMessage(signingKey.priv,
 *                                   //                   versionByte || proto)
 *
 * Wire format of a SenderKeyDistributionMessage (sent inside a pairwise
 * Message proto's `senderKeyDistributionMessage.axolotlSenderKeyDistributionMessage`
 * field — never on its own as a top-level stanza):
 *
 *     versionByte (0x33)
 *     proto.SenderKeyDistributionMessage {
 *         id: uint32
 *         iteration: uint32
 *         chainKey: bytes (32)
 *         signingKey: bytes (33, with 0x05 prefix)
 *     }
 *
 * Cross-checked against the lib's `SenderKeyManager.prepareGroupEncryption`
 * (`src/signal/group/SenderKeyManager.ts`).
 */

import {
    aesCbcEncrypt,
    hkdf,
    hmacSign,
    importAesCbcKey,
    importHmacKey,
    prependVersion,
    randomBytesAsync,
    type SignalKeyPair,
    signSignalMessage,
    toSerializedPubKey,
    X25519
} from '../../transport/crypto'
import { proto } from '../../transport/protos'

const SIGNAL_GROUP_VERSION = 3
const WHISPER_GROUP_INFO = new TextEncoder().encode('WhisperGroup')
const MESSAGE_KEY_LABEL = new Uint8Array([1])
const CHAIN_KEY_LABEL = new Uint8Array([2])

interface SenderKeyState {
    /** 32-bit sender key id (random per peer/group). */
    readonly id: number
    /** Current chain key (32 bytes). */
    readonly chainKey: Uint8Array
    /** Current iteration (advances on each encrypted message). */
    readonly iteration: number
    /** Long-lived signing keypair for this sender. */
    readonly signingKeyPair: SignalKeyPair
}

export interface FakeSenderKeyEncryptionResult {
    /** Bytes for `<enc type="skmsg"/>`. */
    readonly ciphertext: Uint8Array
    /** Bytes to put inside `Message.senderKeyDistributionMessage.axolotlSenderKeyDistributionMessage`. */
    readonly distributionMessage: Uint8Array
    /** Sender key id (caller may need to track distribution). */
    readonly keyId: number
}

export class FakeSenderKey {
    private state: SenderKeyState

    private constructor(state: SenderKeyState) {
        this.state = state
    }

    public static async generate(): Promise<FakeSenderKey> {
        const [chainKey, signingKeyPair, idBytes] = await Promise.all([
            randomBytesAsync(32),
            X25519.generateKeyPair(),
            randomBytesAsync(4)
        ])
        const id = ((idBytes[0] << 24) | (idBytes[1] << 16) | (idBytes[2] << 8) | idBytes[3]) >>> 0
        return new FakeSenderKey({
            id,
            chainKey,
            iteration: 0,
            signingKeyPair
        })
    }

    public get id(): number {
        return this.state.id
    }

    /**
     * Encrypts a plaintext, advances the chain, and returns both:
     *   - The `<enc type="skmsg"/>` ciphertext bytes.
     *   - The SenderKeyDistributionMessage bytes (always — even on
     *     subsequent calls — so callers that haven't yet distributed the
     *     sender key to a particular recipient can attach it to a pairwise
     *     bootstrap message).
     */
    public async encrypt(plaintext: Uint8Array): Promise<FakeSenderKeyEncryptionResult> {
        const distributionMessage = this.buildDistributionMessage()

        const { messageKey, nextChainKey } = await deriveSenderKeyMessageKey(
            this.state.iteration,
            this.state.chainKey
        )

        const { iv, cipherKey } = splitSenderKeyMessageSeed(messageKey.seed)
        const cipherKeyHandle = await importAesCbcKey(cipherKey)
        const ciphertext = await aesCbcEncrypt(cipherKeyHandle, iv, plaintext)

        const senderKeyMessage = proto.SenderKeyMessage.encode({
            id: this.state.id,
            iteration: messageKey.iteration,
            ciphertext
        }).finish()
        const versioned = prependVersion(senderKeyMessage, SIGNAL_GROUP_VERSION)

        const signature = await signSignalMessage(this.state.signingKeyPair.privKey, versioned)

        const finalCiphertext = new Uint8Array(versioned.byteLength + signature.byteLength)
        finalCiphertext.set(versioned, 0)
        finalCiphertext.set(signature, versioned.byteLength)

        this.state = {
            ...this.state,
            chainKey: nextChainKey,
            iteration: messageKey.iteration + 1
        }

        return {
            ciphertext: finalCiphertext,
            distributionMessage,
            keyId: this.state.id
        }
    }

    private buildDistributionMessage(): Uint8Array {
        const proto1 = proto.SenderKeyDistributionMessage.encode({
            id: this.state.id,
            iteration: this.state.iteration,
            chainKey: this.state.chainKey,
            signingKey: toSerializedPubKey(this.state.signingKeyPair.pubKey)
        }).finish()
        return prependVersion(proto1, SIGNAL_GROUP_VERSION)
    }
}

interface DerivedSenderKeyMessage {
    readonly iteration: number
    /** 50-byte expanded HKDF output: bytes 0..16 = iv, bytes 16..48 = cipherKey. */
    readonly seed: Uint8Array
}

async function deriveSenderKeyMessageKey(
    iteration: number,
    chainKey: Uint8Array
): Promise<{
    readonly messageKey: DerivedSenderKeyMessage
    readonly nextChainKey: Uint8Array
}> {
    const hmacKey = await importHmacKey(chainKey)
    const [messageInputKey, nextChainRaw] = await Promise.all([
        hmacSign(hmacKey, MESSAGE_KEY_LABEL),
        hmacSign(hmacKey, CHAIN_KEY_LABEL)
    ])
    const seed = await hkdf(messageInputKey, null, WHISPER_GROUP_INFO, 50)
    return {
        messageKey: { iteration, seed },
        nextChainKey: nextChainRaw.subarray(0, 32)
    }
}

function splitSenderKeyMessageSeed(seed: Uint8Array): {
    readonly iv: Uint8Array
    readonly cipherKey: Uint8Array
} {
    if (seed.byteLength < 48) {
        throw new Error(`sender key message seed too short: ${seed.byteLength}`)
    }
    return {
        iv: seed.subarray(0, 16),
        cipherKey: seed.subarray(16, 48)
    }
}
