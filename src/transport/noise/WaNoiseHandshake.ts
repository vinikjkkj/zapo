import { aesGcmDecrypt, aesGcmEncrypt, buildNonce, hkdfSplit, sha256 } from '@crypto'
import { WaNoiseSocket } from '@transport/noise/WaNoiseSocket'
import { concatBytes, EMPTY_BYTES } from '@util/bytes'

export class WaNoiseHandshake {
    private handshakeHash: Uint8Array
    private chainingKey: Uint8Array
    private cipherKey: Uint8Array | null
    private nonce: number

    public constructor() {
        this.handshakeHash = EMPTY_BYTES
        this.chainingKey = EMPTY_BYTES
        this.cipherKey = null
        this.nonce = 0
    }

    public async start(protocolName: Uint8Array, prologue: Uint8Array): Promise<void> {
        const hashInput = protocolName.length === 32 ? protocolName : await sha256(protocolName)
        this.handshakeHash = hashInput
        this.chainingKey = hashInput
        this.cipherKey = this.handshakeHash
        await this.authenticate(prologue)
    }

    public async authenticate(data: Uint8Array): Promise<void> {
        this.handshakeHash = await sha256(concatBytes([this.handshakeHash, data]))
    }

    public async mixIntoKey(keyMaterial: Uint8Array): Promise<void> {
        this.nonce = 0
        const [newChainingKey, nextCipherKey] = await hkdfSplit(keyMaterial, this.chainingKey, '')
        this.chainingKey = newChainingKey
        this.cipherKey = nextCipherKey
    }

    public async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
        if (!this.cipherKey) {
            throw new Error('noise handshake cipher key is not initialized')
        }
        const nonce = buildNonce(this.nonce++)
        const ciphertext = await aesGcmEncrypt(this.cipherKey, nonce, plaintext, this.handshakeHash)
        await this.authenticate(ciphertext)
        return ciphertext
    }

    public async decrypt(ciphertext: Uint8Array): Promise<Uint8Array> {
        if (!this.cipherKey) {
            throw new Error('noise handshake cipher key is not initialized')
        }
        const nonce = buildNonce(this.nonce++)
        const plaintext = await aesGcmDecrypt(this.cipherKey, nonce, ciphertext, this.handshakeHash)
        await this.authenticate(ciphertext)
        return plaintext
    }

    public async finish(): Promise<WaNoiseSocket> {
        const [writeKey, readKey] = await hkdfSplit(EMPTY_BYTES, this.chainingKey, '')
        this.handshakeHash = EMPTY_BYTES
        this.chainingKey = EMPTY_BYTES
        this.cipherKey = null
        this.nonce = 0
        return new WaNoiseSocket(writeKey, readKey)
    }
}
