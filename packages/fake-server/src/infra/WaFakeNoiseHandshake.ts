/** Responder-side Noise handshake primitives for fake server pipelines. */

import { aesGcmDecrypt, aesGcmEncrypt, hkdfSplit, sha256 } from '../transport/crypto'

const EMPTY = new Uint8Array(0)

export interface WaFakeNoiseHandshakeFinishKeys {
    readonly recvKey: Uint8Array
    readonly sendKey: Uint8Array
    readonly recvKeyBytes: Uint8Array
    readonly sendKeyBytes: Uint8Array
}

export class WaFakeNoiseHandshake {
    private hash: Uint8Array = EMPTY
    private chainingKey: Uint8Array = EMPTY
    private cipherKey: Uint8Array | null = null
    private nonceCounter = 0

    public async start(name: Uint8Array, prologue: Uint8Array): Promise<void> {
        const initialHash = name.byteLength === 32 ? name : await sha256(name)
        this.hash = initialHash
        this.chainingKey = initialHash
        this.cipherKey = initialHash
        this.nonceCounter = 0
        await this.authenticate(prologue)
    }

    public async authenticate(data: Uint8Array): Promise<void> {
        const concatenated = new Uint8Array(this.hash.byteLength + data.byteLength)
        concatenated.set(this.hash, 0)
        concatenated.set(data, this.hash.byteLength)
        this.hash = await sha256(concatenated)
    }

    public async mixIntoKey(input: Uint8Array): Promise<void> {
        const [nextChainingKey, nextCipherMaterial] = await hkdfSplit(input, this.chainingKey, '')
        this.chainingKey = nextChainingKey
        this.cipherKey = nextCipherMaterial
        this.nonceCounter = 0
    }

    public async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
        if (!this.cipherKey) {
            throw new Error('noise handshake encrypt called before key was derived')
        }
        const iv = this.buildNonceIv()
        this.nonceCounter += 1
        const ciphertext = await aesGcmEncrypt(this.cipherKey, iv, plaintext, this.hash)
        await this.authenticate(ciphertext)
        return ciphertext
    }

    public async decrypt(ciphertext: Uint8Array): Promise<Uint8Array> {
        if (!this.cipherKey) {
            throw new Error('noise handshake decrypt called before key was derived')
        }
        const iv = this.buildNonceIv()
        this.nonceCounter += 1
        const plaintext = await aesGcmDecrypt(this.cipherKey, iv, ciphertext, this.hash)
        await this.authenticate(ciphertext)
        return plaintext
    }

    /** Derives transport keys (`first -> recv`, `second -> send` for responder role). */
    public async finish(): Promise<WaFakeNoiseHandshakeFinishKeys> {
        const [first, second] = await hkdfSplit(EMPTY, this.chainingKey, '')
        return {
            recvKey: first,
            sendKey: second,
            recvKeyBytes: first,
            sendKeyBytes: second
        }
    }

    private buildNonceIv(): Uint8Array {
        const iv = new Uint8Array(12)
        const view = new DataView(iv.buffer)
        view.setUint32(8, this.nonceCounter, false)
        return iv
    }
}
