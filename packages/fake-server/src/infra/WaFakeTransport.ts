/** Post-handshake Noise transport (AES-GCM with direction-specific counters). */

import { aesGcmDecrypt, aesGcmEncrypt } from '../transport/crypto'

export class WaFakeTransport {
    private readonly recvKey: Uint8Array
    private readonly sendKey: Uint8Array
    private sendCounter = 0
    private recvCounter = 0

    public constructor(keys: { readonly recvKey: Uint8Array; readonly sendKey: Uint8Array }) {
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
