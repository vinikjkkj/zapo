import { type CryptoKey, aesGcmDecrypt, aesGcmEncrypt, buildNonce } from '@crypto'

export class WaNoiseSocket {
    private readonly encryptKey: CryptoKey
    private readonly decryptKey: CryptoKey
    private writeCounter: number
    private readCounter: number

    public constructor(encryptKey: CryptoKey, decryptKey: CryptoKey) {
        this.encryptKey = encryptKey
        this.decryptKey = decryptKey
        this.writeCounter = 0
        this.readCounter = 0
    }

    public reserveWriteNonce(): Uint8Array {
        return buildNonce(this.writeCounter++)
    }

    public encrypt(
        nonce: Uint8Array,
        frame: Uint8Array,
        additionalData?: Uint8Array
    ): Promise<Uint8Array> {
        return aesGcmEncrypt(this.encryptKey, nonce, frame, additionalData)
    }

    public reserveReadNonce(): Uint8Array {
        return buildNonce(this.readCounter++)
    }

    public decrypt(
        nonce: Uint8Array,
        frame: Uint8Array,
        additionalData?: Uint8Array
    ): Promise<Uint8Array> {
        return aesGcmDecrypt(this.decryptKey, nonce, frame, additionalData)
    }
}
