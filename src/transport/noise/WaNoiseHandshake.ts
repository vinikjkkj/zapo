import { aesGcmDecrypt, aesGcmEncrypt, buildNonce, hkdfSplit, sha256 } from '@crypto'
import { WaNoiseSocket } from '@transport/noise/WaNoiseSocket'
import { EMPTY_BYTES } from '@util/bytes'

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

    public start(protocolName: Uint8Array, prologue: Uint8Array): void {
        const hashInput = protocolName.length === 32 ? protocolName : sha256(protocolName)
        this.handshakeHash = hashInput
        this.chainingKey = hashInput
        this.cipherKey = this.handshakeHash
        this.authenticate(prologue)
    }

    public authenticate(data: Uint8Array): void {
        this.handshakeHash = sha256([this.handshakeHash, data])
    }

    public mixIntoKey(keyMaterial: Uint8Array): void {
        this.nonce = 0
        const [newChainingKey, nextCipherKey] = hkdfSplit(keyMaterial, this.chainingKey, '')
        this.chainingKey = newChainingKey
        this.cipherKey = nextCipherKey
    }

    public encrypt(plaintext: Uint8Array): Uint8Array {
        if (!this.cipherKey) {
            throw new Error('noise handshake cipher key is not initialized')
        }
        const nonce = buildNonce(this.nonce++)
        const ciphertext = aesGcmEncrypt(this.cipherKey, nonce, plaintext, this.handshakeHash)
        this.authenticate(ciphertext)
        return ciphertext
    }

    public decrypt(ciphertext: Uint8Array): Uint8Array {
        if (!this.cipherKey) {
            throw new Error('noise handshake cipher key is not initialized')
        }
        const nonce = buildNonce(this.nonce++)
        const plaintext = aesGcmDecrypt(this.cipherKey, nonce, ciphertext, this.handshakeHash)
        this.authenticate(ciphertext)
        return plaintext
    }

    public finish(): WaNoiseSocket {
        const [writeKey, readKey] = hkdfSplit(EMPTY_BYTES, this.chainingKey, '')
        this.handshakeHash = EMPTY_BYTES
        this.chainingKey = EMPTY_BYTES
        this.cipherKey = null
        this.nonce = 0
        return new WaNoiseSocket(writeKey, readKey)
    }
}
