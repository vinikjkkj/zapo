/**
 * Post-handshake transport encryption for the fake server.
 *
 * Source: /deobfuscated/WANoise/WANoiseSocket.js
 *
 * Once the noise handshake completes, every frame on the wire is AES-GCM
 * encrypted with one of the two keys derived in `finish()`. Each side
 * maintains an independent monotonically-incrementing counter for its own
 * direction:
 *
 *   - server send  → uses sendKey, counter starts at 0 (matches client recv counter)
 *   - server recv  → uses recvKey, counter starts at 0 (matches client send counter)
 *
 * The 12-byte AES-GCM nonce is the counter encoded as u32 BE in the last
 * 4 bytes; bytes 0-7 are zero. Same layout as the handshake nonces.
 *
 * No additional authenticated data is used post-handshake (the AAD slot
 * is empty).
 *
 * This file is server scaffolding plus a /deobfuscated mirror of the noise
 * transport layer.
 */

import { aesGcmDecrypt, aesGcmEncrypt, type CryptoKey } from '../transport/crypto'

export class WaFakeTransport {
    private readonly recvKey: CryptoKey
    private readonly sendKey: CryptoKey
    private sendCounter = 0
    private recvCounter = 0

    public constructor(keys: { readonly recvKey: CryptoKey; readonly sendKey: CryptoKey }) {
        this.recvKey = keys.recvKey
        this.sendKey = keys.sendKey
    }

    public async encryptFrame(plaintext: Uint8Array): Promise<Uint8Array> {
        const nonce = buildAesGcmNonce(this.sendCounter)
        this.sendCounter += 1
        return aesGcmEncrypt(this.sendKey, nonce, plaintext)
    }

    public async decryptFrame(ciphertext: Uint8Array): Promise<Uint8Array> {
        const nonce = buildAesGcmNonce(this.recvCounter)
        this.recvCounter += 1
        return aesGcmDecrypt(this.recvKey, nonce, ciphertext)
    }
}

function buildAesGcmNonce(counter: number): Uint8Array {
    if (counter > 0xffffffff) {
        throw new Error('noise transport nonce counter overflow')
    }
    const nonce = new Uint8Array(12)
    const view = new DataView(nonce.buffer)
    view.setUint32(8, counter, false)
    return nonce
}
