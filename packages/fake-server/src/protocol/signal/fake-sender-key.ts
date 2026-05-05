/** SenderKey state used by fake peers for group encryption. */

import {
    aesCbcEncrypt,
    hkdf,
    hmacSha256Sign,
    prependVersion,
    randomBytesAsync,
    type SignalKeyPair,
    toSerializedPubKey,
    X25519,
    xeddsaSign
} from '../../transport/crypto'
import { proto } from '../../transport/protos'

const SIGNAL_GROUP_VERSION = 3
const WHISPER_GROUP_INFO = new TextEncoder().encode('WhisperGroup')
const MESSAGE_KEY_LABEL = new Uint8Array([1])
const CHAIN_KEY_LABEL = new Uint8Array([2])

interface SenderKeyState {
    readonly id: number
    readonly chainKey: Uint8Array
    readonly iteration: number
    readonly signingKeyPair: SignalKeyPair
}

export interface FakeSenderKeyEncryptionResult {
    readonly ciphertext: Uint8Array
    readonly distributionMessage: Uint8Array
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

    public async encrypt(plaintext: Uint8Array): Promise<FakeSenderKeyEncryptionResult> {
        const distributionMessage = this.buildDistributionMessage()

        const { messageKey, nextChainKey } = await deriveSenderKeyMessageKey(
            this.state.iteration,
            this.state.chainKey
        )

        const { iv, cipherKey } = splitSenderKeyMessageSeed(messageKey.seed)
        const ciphertext = aesCbcEncrypt(cipherKey, iv, plaintext)

        const senderKeyMessage = proto.SenderKeyMessage.encode({
            id: this.state.id,
            iteration: messageKey.iteration,
            ciphertext
        }).finish()
        const versioned = prependVersion(senderKeyMessage, SIGNAL_GROUP_VERSION)

        const signature = await xeddsaSign(this.state.signingKeyPair.privKey, versioned)

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
    readonly seed: Uint8Array
}

async function deriveSenderKeyMessageKey(
    iteration: number,
    chainKey: Uint8Array
): Promise<{
    readonly messageKey: DerivedSenderKeyMessage
    readonly nextChainKey: Uint8Array
}> {
    const messageInputKey = hmacSha256Sign(chainKey, MESSAGE_KEY_LABEL)
    const nextChainRaw = hmacSha256Sign(chainKey, CHAIN_KEY_LABEL)
    const seed = hkdf(messageInputKey, null, WHISPER_GROUP_INFO, 50)
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
