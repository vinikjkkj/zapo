import { createSecretKey, type KeyObject } from 'node:crypto'

import { aesGcmDecrypt, aesGcmEncrypt, writeNonceCounter } from '@crypto'

/**
 * Post-handshake symmetric channel: applies AES-GCM with per-direction
 * 12-byte nonces (counter in the trailing 4 bytes) using a per-instance
 * scratch buffer to avoid allocations on the hot path.
 */
export class WaNoiseSocket {
    private readonly encryptKey: KeyObject
    private readonly decryptKey: KeyObject
    private writeCounter: number
    private readCounter: number
    private readonly writeNonceScratch: Uint8Array = new Uint8Array(12)
    private readonly readNonceScratch: Uint8Array = new Uint8Array(12)

    public constructor(encryptKey: Uint8Array, decryptKey: Uint8Array) {
        this.encryptKey = createSecretKey(encryptKey)
        this.decryptKey = createSecretKey(decryptKey)
        this.writeCounter = 0
        this.readCounter = 0
    }

    /** Encrypts an outgoing `frame` with the next write nonce; advances the write counter. */
    public encrypt(frame: Uint8Array, additionalData?: Uint8Array): Uint8Array {
        writeNonceCounter(this.writeNonceScratch, this.writeCounter++)
        return aesGcmEncrypt(this.encryptKey, this.writeNonceScratch, frame, additionalData)
    }

    /** Decrypts an incoming `frame` with the next read nonce; advances the read counter. */
    public decrypt(frame: Uint8Array, additionalData?: Uint8Array): Uint8Array {
        writeNonceCounter(this.readNonceScratch, this.readCounter++)
        return aesGcmDecrypt(this.decryptKey, this.readNonceScratch, frame, additionalData)
    }
}
