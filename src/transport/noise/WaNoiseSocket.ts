import { aesGcmDecrypt, aesGcmEncrypt, buildNonce } from '@crypto'

export class WaNoiseSocket {
    private readonly encryptKey: Uint8Array
    private readonly decryptKey: Uint8Array
    private writeCounter: number
    private readCounter: number

    public constructor(encryptKey: Uint8Array, decryptKey: Uint8Array) {
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
