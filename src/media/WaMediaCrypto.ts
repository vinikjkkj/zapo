import { createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { Readable, Writable } from 'node:stream'

import { hkdf } from '@crypto/core/hkdf'
import {
    aesCbcDecrypt,
    aesCbcEncrypt,
    hmacSign,
    importAesCbcKey,
    importHmacKey,
    sha256
} from '@crypto/core/primitives'
import { randomBytesAsync } from '@crypto/core/random'
import {
    ENC_KEY_END,
    ENC_KEY_START,
    HMAC_TRUNCATED_SIZE,
    IV_SIZE,
    MAC_KEY_END,
    MAC_KEY_START,
    MEDIA_HKDF_SIZE
} from '@media/constants'
import type {
    MediaCryptoType,
    WaMediaDecryptReadableOptions,
    WaMediaDecryptionResult,
    WaMediaDerivedKeys,
    WaMediaEncryptionResult,
    WaMediaFileEncryptionResult,
    WaMediaReadableDecryptionResult,
    WaMediaReadableEncryptionResult
} from '@media/types'
import { WA_APP_STATE_KEY_TYPES, getWaMediaHkdfInfo } from '@protocol/constants'
import {
    assertByteLength,
    concatBytes,
    EMPTY_BYTES,
    toChunkBytes,
    toBytesView,
    uint8Equal,
    uint8TimingSafeEqual
} from '@util/bytes'
import { toError } from '@util/primitives'

export class WaMediaCrypto {
    static async generateMediaKey(): Promise<Uint8Array> {
        return randomBytesAsync(32)
    }

    static async deriveKeys(
        mediaType: MediaCryptoType,
        mediaKey: Uint8Array
    ): Promise<WaMediaDerivedKeys> {
        assertByteLength(
            mediaKey,
            32,
            `invalid media key length ${mediaKey.byteLength}, expected 32`
        )
        const info = mediaTypeToHkdfInfo(mediaType)
        const expanded = await hkdf(mediaKey, null, info, MEDIA_HKDF_SIZE)
        return {
            iv: expanded.subarray(0, IV_SIZE),
            encKey: expanded.subarray(ENC_KEY_START, ENC_KEY_END),
            macKey: expanded.subarray(MAC_KEY_START, MAC_KEY_END),
            refKey: expanded.subarray(MAC_KEY_END, MEDIA_HKDF_SIZE)
        }
    }

    static async encryptBytes(
        mediaType: MediaCryptoType,
        mediaKey: Uint8Array,
        plaintext: Uint8Array
    ): Promise<WaMediaEncryptionResult> {
        const keys = await WaMediaCrypto.deriveKeys(mediaType, mediaKey)
        const [aesKey, macKey] = await Promise.all([
            importAesCbcKey(keys.encKey),
            importHmacKey(keys.macKey)
        ])
        const ciphertext = await aesCbcEncrypt(aesKey, keys.iv, plaintext)
        const ivCiphertext = concatBytes([keys.iv, ciphertext])

        const mac = await hmacSign(macKey, ivCiphertext)
        const signature = mac.subarray(0, HMAC_TRUNCATED_SIZE)
        const ciphertextHmac = concatBytes([ciphertext, signature])

        const [fileSha256, fileEncSha256] = await Promise.all([
            sha256(plaintext),
            sha256(ciphertextHmac)
        ])
        return { ciphertextHmac, fileSha256, fileEncSha256 }
    }

    static async decryptBytes(
        mediaType: MediaCryptoType,
        mediaKey: Uint8Array,
        ciphertextHmac: Uint8Array,
        expectedFileSha256?: Uint8Array,
        expectedFileEncSha256?: Uint8Array
    ): Promise<WaMediaDecryptionResult> {
        if (ciphertextHmac.byteLength < HMAC_TRUNCATED_SIZE) {
            throw new Error(`ciphertext too short: ${ciphertextHmac.byteLength}`)
        }

        if (expectedFileEncSha256) {
            const computedEncHash = await sha256(ciphertextHmac)
            if (!uint8Equal(computedEncHash, expectedFileEncSha256)) {
                throw new Error('encrypted file hash mismatch')
            }
        }

        const keys = await WaMediaCrypto.deriveKeys(mediaType, mediaKey)
        const ciphertext = ciphertextHmac.subarray(
            0,
            ciphertextHmac.byteLength - HMAC_TRUNCATED_SIZE
        )
        const expectedMac = ciphertextHmac.subarray(ciphertextHmac.byteLength - HMAC_TRUNCATED_SIZE)
        const ivCiphertext = concatBytes([keys.iv, ciphertext])

        const [macKey, aesKey] = await Promise.all([
            importHmacKey(keys.macKey),
            importAesCbcKey(keys.encKey)
        ])
        const mac = await hmacSign(macKey, ivCiphertext)
        const signature = mac.subarray(0, HMAC_TRUNCATED_SIZE)
        if (!uint8TimingSafeEqual(signature, expectedMac)) {
            throw new Error('media MAC mismatch')
        }

        const plaintext = await aesCbcDecrypt(aesKey, keys.iv, ciphertext)
        const fileSha256 = await sha256(plaintext)
        if (expectedFileSha256 && !uint8Equal(fileSha256, expectedFileSha256)) {
            throw new Error('plaintext file hash mismatch')
        }

        const fileEncSha256 = expectedFileEncSha256 ?? (await sha256(ciphertextHmac))
        return { plaintext, fileSha256, fileEncSha256 }
    }

    static async encryptReadable(
        mediaType: MediaCryptoType,
        mediaKey: Uint8Array,
        plaintext: Readable
    ): Promise<WaMediaReadableEncryptionResult> {
        const keys = await WaMediaCrypto.deriveKeys(mediaType, mediaKey)
        const encrypted = new PassThrough()
        const metadata = pumpEncryption(plaintext, encrypted, keys)
        return { encrypted, metadata }
    }

    static async encryptToFile(
        mediaType: MediaCryptoType,
        mediaKey: Uint8Array,
        plaintext: Readable
    ): Promise<WaMediaFileEncryptionResult> {
        const keys = await WaMediaCrypto.deriveKeys(mediaType, mediaKey)
        const filePath = join(
            tmpdir(),
            `zapo-enc-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )
        const output = createWriteStream(filePath)
        try {
            const metadata = await pumpEncryptionToWritable(plaintext, output, keys)
            const fileSize = (await stat(filePath)).size
            return { filePath, fileSize, ...metadata }
        } catch (error) {
            await unlink(filePath).catch(() => undefined)
            throw error
        }
    }

    static async cleanupEncryptedFile(filePath: string): Promise<void> {
        await unlink(filePath).catch(() => undefined)
    }

    static async decryptReadable(
        encrypted: Readable,
        options: WaMediaDecryptReadableOptions
    ): Promise<WaMediaReadableDecryptionResult> {
        const keys = await WaMediaCrypto.deriveKeys(options.mediaType, options.mediaKey)
        const plaintext = new PassThrough()
        const metadata = pumpDecryption(encrypted, plaintext, keys, options)
        return { plaintext, metadata }
    }

    static encryptedLength(plaintextLength: number): number {
        if (!Number.isFinite(plaintextLength) || plaintextLength < 0) {
            throw new Error(`invalid plaintext length ${plaintextLength}`)
        }
        const paddedLength = Math.ceil((plaintextLength + 1) / 16) * 16
        return paddedLength + HMAC_TRUNCATED_SIZE
    }
}

async function pumpEncryption(
    plaintext: Readable,
    encrypted: PassThrough,
    keys: WaMediaDerivedKeys
): Promise<{
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly plaintextLength: number
}> {
    const plainHash = createHash('sha256')
    const encHash = createHash('sha256')
    const hmac = createHmac('sha256', keys.macKey)
    const cipher = createCipheriv('aes-256-cbc', keys.encKey, keys.iv)
    let plaintextLength = 0

    hmac.update(keys.iv)
    try {
        for await (const chunk of plaintext) {
            const plainChunk = toChunkBytes(chunk)
            if (plainChunk.byteLength === 0) {
                continue
            }
            plaintextLength += plainChunk.byteLength
            plainHash.update(plainChunk)
            const encryptedChunk = cipher.update(plainChunk)
            if (encryptedChunk.byteLength > 0) {
                hmac.update(encryptedChunk)
                encHash.update(encryptedChunk)
                await writeChunk(encrypted, encryptedChunk)
            }
        }

        const encryptedFinal = cipher.final()
        if (encryptedFinal.byteLength > 0) {
            hmac.update(encryptedFinal)
            encHash.update(encryptedFinal)
            await writeChunk(encrypted, encryptedFinal)
        }

        const signature = hmac.digest().subarray(0, HMAC_TRUNCATED_SIZE)
        encHash.update(signature)
        await writeChunk(encrypted, signature)
        encrypted.end()

        return {
            fileSha256: toBytesView(plainHash.digest()),
            fileEncSha256: toBytesView(encHash.digest()),
            plaintextLength
        }
    } catch (error) {
        const normalized = toError(error)
        encrypted.destroy(normalized)
        throw normalized
    }
}

async function writeChunkToWritable(stream: Writable, chunk: Uint8Array): Promise<void> {
    if (chunk.byteLength === 0) {
        return
    }
    if (stream.write(chunk)) {
        return
    }
    await new Promise<void>((resolve, reject) => {
        const onDrain = (): void => {
            stream.off('error', onError)
            resolve()
        }
        const onError = (err: Error): void => {
            stream.off('drain', onDrain)
            reject(err)
        }
        stream.once('drain', onDrain)
        stream.once('error', onError)
    })
}

async function endWritable(stream: Writable): Promise<void> {
    return new Promise((resolve, reject) => {
        stream.on('error', reject)
        stream.end(() => resolve())
    })
}

async function pumpEncryptionToWritable(
    plaintext: Readable,
    output: Writable,
    keys: WaMediaDerivedKeys
): Promise<{
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly plaintextLength: number
}> {
    const plainHash = createHash('sha256')
    const encHash = createHash('sha256')
    const hmac = createHmac('sha256', keys.macKey)
    const cipher = createCipheriv('aes-256-cbc', keys.encKey, keys.iv)
    let plaintextLength = 0

    hmac.update(keys.iv)
    try {
        for await (const chunk of plaintext) {
            const plainChunk = toChunkBytes(chunk)
            if (plainChunk.byteLength === 0) {
                continue
            }
            plaintextLength += plainChunk.byteLength
            plainHash.update(plainChunk)
            const encryptedChunk = cipher.update(plainChunk)
            if (encryptedChunk.byteLength > 0) {
                hmac.update(encryptedChunk)
                encHash.update(encryptedChunk)
                await writeChunkToWritable(output, encryptedChunk)
            }
        }

        const encryptedFinal = cipher.final()
        if (encryptedFinal.byteLength > 0) {
            hmac.update(encryptedFinal)
            encHash.update(encryptedFinal)
            await writeChunkToWritable(output, encryptedFinal)
        }

        const signature = hmac.digest().subarray(0, HMAC_TRUNCATED_SIZE)
        encHash.update(signature)
        await writeChunkToWritable(output, signature)
        await endWritable(output)

        return {
            fileSha256: toBytesView(plainHash.digest()),
            fileEncSha256: toBytesView(encHash.digest()),
            plaintextLength
        }
    } catch (error) {
        const normalized = toError(error)
        output.destroy(normalized)
        throw normalized
    }
}

async function pumpDecryption(
    encrypted: Readable,
    plaintext: PassThrough,
    keys: WaMediaDerivedKeys,
    options: WaMediaDecryptReadableOptions
): Promise<{ readonly fileSha256: Uint8Array; readonly fileEncSha256: Uint8Array }> {
    const plainHash = createHash('sha256')
    const encHash = createHash('sha256')
    const hmac = createHmac('sha256', keys.macKey)
    const decipher = createDecipheriv('aes-256-cbc', keys.encKey, keys.iv)

    hmac.update(keys.iv)
    try {
        let trailing: Uint8Array = EMPTY_BYTES
        for await (const chunk of encrypted) {
            const bytes = toChunkBytes(chunk)
            if (bytes.byteLength === 0) {
                continue
            }
            encHash.update(bytes)
            const merged = trailing.byteLength === 0 ? bytes : concatBytes([trailing, bytes])
            if (merged.byteLength <= HMAC_TRUNCATED_SIZE) {
                trailing = merged
                continue
            }

            const ciphertextChunk = merged.subarray(0, merged.byteLength - HMAC_TRUNCATED_SIZE)
            trailing = merged.subarray(merged.byteLength - HMAC_TRUNCATED_SIZE)
            hmac.update(ciphertextChunk)
            const plainChunk = decipher.update(ciphertextChunk)
            if (plainChunk.byteLength > 0) {
                plainHash.update(plainChunk)
                await writeChunk(plaintext, plainChunk)
            }
        }

        if (trailing.byteLength !== HMAC_TRUNCATED_SIZE) {
            throw new Error(`ciphertext too short: ${trailing.byteLength}`)
        }

        const signature = hmac.digest().subarray(0, HMAC_TRUNCATED_SIZE)
        if (!uint8TimingSafeEqual(signature, trailing)) {
            throw new Error('media MAC mismatch')
        }

        const plainFinal = decipher.final()
        if (plainFinal.byteLength > 0) {
            plainHash.update(plainFinal)
            await writeChunk(plaintext, plainFinal)
        }

        const fileSha256 = toBytesView(plainHash.digest())
        const fileEncSha256 = toBytesView(encHash.digest())
        if (
            options.expectedFileEncSha256 &&
            !uint8Equal(fileEncSha256, options.expectedFileEncSha256)
        ) {
            throw new Error('encrypted file hash mismatch')
        }
        if (options.expectedFileSha256 && !uint8Equal(fileSha256, options.expectedFileSha256)) {
            throw new Error('plaintext file hash mismatch')
        }

        plaintext.end()
        return { fileSha256, fileEncSha256 }
    } catch (error) {
        const normalized = toError(error)
        plaintext.destroy(normalized)
        throw normalized
    }
}

function mediaTypeToHkdfInfo(mediaType: MediaCryptoType): string {
    if (mediaType === 'ptv') {
        return getWaMediaHkdfInfo('video')
    }
    if (mediaType === 'history') {
        return getWaMediaHkdfInfo(WA_APP_STATE_KEY_TYPES.MD_MSG_HIST)
    }
    return getWaMediaHkdfInfo(mediaType)
}

async function writeChunk(stream: PassThrough, chunk: Uint8Array): Promise<void> {
    if (chunk.byteLength === 0) {
        return
    }
    if (stream.write(chunk)) {
        return
    }
    await once(stream, 'drain')
}
