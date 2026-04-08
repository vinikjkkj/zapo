/**
 * Server-side noise handshake for the WhatsApp Web XX pattern.
 *
 * Source: /deobfuscated/WANoise/WANoiseHandshake.js
 *         /deobfuscated/WAWebOpenC/WAWebOpenChatSocket.js (functions W and H — client side)
 *
 * State machine
 * -------------
 * Implements the same primitives the WhatsApp Web client uses (start /
 * authenticate / mixIntoKey / encrypt / decrypt / finish), mirroring the
 * deobfuscated `WANoiseHandshake` class. The fake server uses these
 * primitives in the responder role of the Noise XX pattern:
 *
 *     -> e
 *     <- e, ee, s, es
 *     -> s, se
 *
 * Server flow:
 *   1. start(NoiseXXName, prologue)             // h := name; ck := h; authenticate(prologue)
 *   2. receive ClientHello { ephemeral }
 *      authenticate(client_e_pub)
 *   3. generate server_e
 *      authenticate(server_e_pub)
 *      mixIntoKey(DH(server_e_priv, client_e_pub))     // ee
 *      ct_static  = encrypt(server_s_pub)              // s
 *      mixIntoKey(DH(server_s_priv, client_e_pub))     // es
 *      ct_payload = encrypt(certChain)                 // payload
 *      send ServerHello { ephemeral, static: ct_static, payload: ct_payload }
 *   4. receive ClientFinish { static: ct_cs, payload: ct_cp }
 *      client_s_pub = decrypt(ct_cs)
 *      mixIntoKey(DH(server_e_priv, client_s_pub))     // se
 *      client_payload = decrypt(ct_cp)
 *   5. finish() → { recvKey, sendKey }
 *      For the responder role: recvKey is the first 32 bytes of HKDF(ck, ""),
 *      sendKey is the second 32. This is the inverse of the initiator order.
 *
 * AEAD details (per /deobfuscated/WANoise/WANoiseHandshake.js f / h / y):
 *   - AES-GCM with 12-byte IV: bytes 0-7 = 0, bytes 8-11 = u32 BE counter
 *   - Counter is reset to 0 on every mixIntoKey
 *   - The current handshake hash `h` is used as additional authenticated data
 *   - After every encrypt/decrypt the ciphertext is appended to `h` via authenticate()
 */

import {
    aesGcmDecrypt,
    aesGcmEncrypt,
    type CryptoKey,
    hkdfSplit,
    importAesGcmKey,
    sha256
} from '../transport/crypto'

const EMPTY = new Uint8Array(0)

export interface WaFakeNoiseHandshakeFinishKeys {
    readonly recvKey: CryptoKey
    readonly sendKey: CryptoKey
    readonly recvKeyBytes: Uint8Array
    readonly sendKeyBytes: Uint8Array
}

export class WaFakeNoiseHandshake {
    private hash: Uint8Array = EMPTY
    private chainingKey: Uint8Array = EMPTY
    private cipherKey: CryptoKey | null = null
    private nonceCounter = 0

    public async start(name: Uint8Array, prologue: Uint8Array): Promise<void> {
        const initialHash = name.byteLength === 32 ? name : await sha256(name)
        this.hash = initialHash
        this.chainingKey = initialHash
        this.cipherKey = await importAesGcmKey(initialHash, ['encrypt', 'decrypt'])
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
        this.cipherKey = await importAesGcmKey(nextCipherMaterial, ['encrypt', 'decrypt'])
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

    /**
     * Derives the post-handshake transport keys.
     *
     * The Noise XX pattern uses a salt-based HKDF on an empty IKM at the end
     * of the handshake; the first 32 bytes go to the initiator's send (= our
     * recv), the second 32 go to the responder's send.
     */
    public async finish(): Promise<WaFakeNoiseHandshakeFinishKeys> {
        const [first, second] = await hkdfSplit(EMPTY, this.chainingKey, '')
        const [recvKey, sendKey] = await Promise.all([
            importAesGcmKey(first, ['decrypt']),
            importAesGcmKey(second, ['encrypt'])
        ])
        return {
            recvKey,
            sendKey,
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
