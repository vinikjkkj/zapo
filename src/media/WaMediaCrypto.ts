import { createHash, createHmac } from 'node:crypto'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, type Readable, type Writable } from 'node:stream'

import { hkdf } from '@crypto/core/hkdf'
import { aesCbcDecrypt, aesCbcEncrypt, hmacSha256Sign, sha256 } from '@crypto/core/primitives'
import { randomBytesAsync } from '@crypto/core/random'
import {
    ENC_KEY_END,
    ENC_KEY_START,
    HMAC_TRUNCATED_SIZE,
    IV_SIZE,
    MAC_KEY_END,
    MAC_KEY_START,
    MEDIA_HKDF_SIZE,
    SIDECAR_CHUNK_SIZE,
    SIDECAR_HMAC_SIZE
} from '@media/constants'
import type {
    MediaCryptoType,
    WaMediaDecryptionResult,
    WaMediaDecryptReadableOptions,
    WaMediaDerivedKeys,
    WaMediaEncryptionResult,
    WaMediaFileEncryptionResult,
    WaMediaReadableDecryptionResult,
    WaMediaReadableEncryptionResult
} from '@media/types'
import { getWaMediaHkdfInfo, WA_APP_STATE_KEY_TYPES } from '@protocol/constants'
import {
    assertByteLength,
    concatBytes,
    EMPTY_BYTES,
    toBytesView,
    toChunkBytes,
    uint8Equal,
    uint8TimingSafeEqual
} from '@util/bytes'
import { toError } from '@util/primitives'

const AES_BLOCK_SIZE = 16
const PKCS7_FULL_BLOCK = new Uint8Array(AES_BLOCK_SIZE).fill(AES_BLOCK_SIZE)

async function aesCbcEncryptChunk(
    key: Uint8Array,
    iv: Uint8Array,
    chunk: Uint8Array,
    isFinal: boolean
): Promise<{ ciphertext: Uint8Array; nextIv: Uint8Array }> {
    const encrypted = await aesCbcEncrypt(key, iv, chunk)
    if (isFinal) {
        return {
            ciphertext: encrypted,
            nextIv: encrypted.subarray(encrypted.byteLength - AES_BLOCK_SIZE)
        }
    }
    const ciphertext = encrypted.subarray(0, encrypted.byteLength - AES_BLOCK_SIZE)
    return {
        ciphertext,
        nextIv: ciphertext.subarray(ciphertext.byteLength - AES_BLOCK_SIZE)
    }
}

async function aesCbcDecryptChunk(
    key: Uint8Array,
    iv: Uint8Array,
    ciphertext: Uint8Array,
    isFinal: boolean
): Promise<{ plaintext: Uint8Array; nextIv: Uint8Array }> {
    const nextIv = toBytesView(ciphertext.subarray(ciphertext.byteLength - AES_BLOCK_SIZE))
    if (isFinal) {
        return { plaintext: await aesCbcDecrypt(key, iv, ciphertext), nextIv }
    }
    const padBlock = (await aesCbcEncrypt(key, nextIv, PKCS7_FULL_BLOCK)).subarray(
        0,
        AES_BLOCK_SIZE
    )
    const withPad = concatBytes([ciphertext, padBlock])
    return { plaintext: await aesCbcDecrypt(key, iv, withPad), nextIv }
}

async function computeFirstFrameSidecar(
    macKey: Uint8Array,
    iv: Uint8Array,
    ciphertext: Uint8Array,
    firstFrameLength: number
): Promise<Uint8Array> {
    const aligned = Math.ceil(firstFrameLength / AES_BLOCK_SIZE) * AES_BLOCK_SIZE
    const digest = await hmacSha256Sign(macKey, [iv, ciphertext.subarray(0, aligned)])
    return digest.subarray(0, SIDECAR_HMAC_SIZE)
}

class SidecarAccumulator {
    private readonly macKey: Uint8Array
    private result: Uint8Array
    private resultOffset = 0
    private totalPushed = 0
    private readonly window: Uint8Array
    private windowOffset = 0
    private nextChunkStart = 0

    constructor(macKey: Uint8Array, estimatedSize = 0) {
        this.macKey = macKey
        this.window = new Uint8Array(IV_SIZE + SIDECAR_CHUNK_SIZE)
        const estimated = Math.max(Math.ceil(estimatedSize / SIDECAR_CHUNK_SIZE) + 1, 16)
        this.result = new Uint8Array(estimated * SIDECAR_HMAC_SIZE)
    }

    push(data: Uint8Array): void {
        let srcOffset = 0
        while (srcOffset < data.byteLength) {
            const windowEnd = this.nextChunkStart + IV_SIZE + SIDECAR_CHUNK_SIZE
            const remaining = windowEnd - this.totalPushed
            const toCopy = Math.min(remaining, data.byteLength - srcOffset)
            this.window.set(data.subarray(srcOffset, srcOffset + toCopy), this.windowOffset)
            this.windowOffset += toCopy
            this.totalPushed += toCopy
            srcOffset += toCopy
            if (this.totalPushed === windowEnd) {
                this.flushChunk()
            }
        }
    }

    finish(): Uint8Array {
        if (this.windowOffset > 0) {
            this.flushChunk()
        }
        return this.result.subarray(0, this.resultOffset)
    }

    private flushChunk(): void {
        const digest = createHmac('sha256', this.macKey)
            .update(this.window.subarray(0, this.windowOffset))
            .digest()
        if (this.resultOffset + SIDECAR_HMAC_SIZE > this.result.byteLength) {
            const grown = new Uint8Array(this.result.byteLength * 2)
            grown.set(this.result)
            this.result = grown
        }
        this.result.set(digest.subarray(0, SIDECAR_HMAC_SIZE), this.resultOffset)
        this.resultOffset += SIDECAR_HMAC_SIZE

        this.nextChunkStart += SIDECAR_CHUNK_SIZE
        const overlapSrc = this.window.subarray(this.windowOffset - IV_SIZE, this.windowOffset)
        this.window.set(overlapSrc, 0)
        this.windowOffset = IV_SIZE
    }
}

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
        plaintext: Uint8Array,
        options?: { readonly sidecar?: boolean; readonly firstFrameLength?: number }
    ): Promise<WaMediaEncryptionResult> {
        const keys = await WaMediaCrypto.deriveKeys(mediaType, mediaKey)
        const ciphertext = await aesCbcEncrypt(keys.encKey, keys.iv, plaintext)

        const mac = await hmacSha256Sign(keys.macKey, [keys.iv, ciphertext])
        const signature = mac.subarray(0, HMAC_TRUNCATED_SIZE)
        const ciphertextHmac = concatBytes([ciphertext, signature])

        let streamingSidecar: Uint8Array | undefined
        if (options?.sidecar !== false) {
            const acc = new SidecarAccumulator(keys.macKey)
            acc.push(keys.iv)
            acc.push(ciphertext)
            acc.push(signature)
            streamingSidecar = acc.finish()
        }

        const firstFrameSidecar =
            options?.firstFrameLength !== undefined
                ? await computeFirstFrameSidecar(
                      keys.macKey,
                      keys.iv,
                      ciphertext,
                      options.firstFrameLength
                  )
                : undefined

        const [fileSha256, fileEncSha256] = await Promise.all([
            sha256(plaintext),
            sha256(ciphertextHmac)
        ])
        return {
            ciphertextHmac,
            fileSha256,
            fileEncSha256,
            streamingSidecar,
            firstFrameSidecar
        }
    }

    static async decryptBytes(
        mediaType: MediaCryptoType,
        mediaKey: Uint8Array,
        ciphertextHmac: Uint8Array,
        expectedFileSha256?: Uint8Array,
        expectedFileEncSha256?: Uint8Array,
        skipMacVerification = false
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

        if (!skipMacVerification) {
            const mac = await hmacSha256Sign(keys.macKey, [keys.iv, ciphertext])
            const signature = mac.subarray(0, HMAC_TRUNCATED_SIZE)
            if (!uint8TimingSafeEqual(signature, expectedMac)) {
                throw new Error('media MAC mismatch')
            }
        }

        const plaintext = await aesCbcDecrypt(keys.encKey, keys.iv, ciphertext)
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
        plaintext: Readable,
        options?: { readonly sidecar?: boolean; readonly firstFrameLength?: number }
    ): Promise<WaMediaReadableEncryptionResult> {
        const keys = await WaMediaCrypto.deriveKeys(mediaType, mediaKey)
        const encrypted = new PassThrough()
        const metadata = pumpEncryption(
            plaintext,
            encrypted,
            keys,
            options?.sidecar !== false,
            options?.firstFrameLength
        )
        return { encrypted, metadata }
    }

    static async encryptToFile(
        mediaType: MediaCryptoType,
        mediaKey: Uint8Array,
        plaintext: Readable,
        options?: { readonly sidecar?: boolean; readonly firstFrameLength?: number }
    ): Promise<WaMediaFileEncryptionResult> {
        const keys = await WaMediaCrypto.deriveKeys(mediaType, mediaKey)
        const filePath = join(
            tmpdir(),
            `zapo-enc-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )
        const output = createWriteStream(filePath)
        try {
            const metadata = await pumpEncryptionToWritable(
                plaintext,
                output,
                keys,
                options?.sidecar !== false,
                options?.firstFrameLength
            )
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
    keys: WaMediaDerivedKeys,
    computeSidecar: boolean,
    firstFrameLength?: number
): Promise<{
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly plaintextLength: number
    readonly streamingSidecar?: Uint8Array
    readonly firstFrameSidecar?: Uint8Array
}> {
    const aesKey = keys.encKey
    const plainHash = createHash('sha256')
    const encHash = createHash('sha256')
    const hmac = createHmac('sha256', keys.macKey)
    const sidecar = computeSidecar ? new SidecarAccumulator(keys.macKey) : null
    const ffTarget =
        firstFrameLength !== undefined
            ? IV_SIZE + Math.ceil(firstFrameLength / AES_BLOCK_SIZE) * AES_BLOCK_SIZE
            : 0
    let ffCollected = 0
    const ffChunks: Uint8Array[] = ffTarget > 0 ? [keys.iv] : []
    if (ffTarget > 0) ffCollected = IV_SIZE
    let plaintextLength = 0
    let currentIv = keys.iv
    let pending: Uint8Array = EMPTY_BYTES

    hmac.update(keys.iv)
    sidecar?.push(keys.iv)
    try {
        for await (const chunk of plaintext) {
            const plainChunk = toChunkBytes(chunk)
            if (plainChunk.byteLength === 0) continue
            plaintextLength += plainChunk.byteLength
            plainHash.update(plainChunk)

            const combined =
                pending.byteLength > 0
                    ? concatBytes([pending, plainChunk])
                    : toBytesView(plainChunk)
            const aligned = combined.byteLength - (combined.byteLength % AES_BLOCK_SIZE)
            if (aligned === 0) {
                pending = combined
                continue
            }

            const toEncrypt = toBytesView(combined.subarray(0, aligned))
            pending = toBytesView(combined.subarray(aligned))

            const { ciphertext, nextIv } = await aesCbcEncryptChunk(
                aesKey,
                currentIv,
                toEncrypt,
                false
            )
            currentIv = nextIv
            hmac.update(ciphertext)
            encHash.update(ciphertext)
            sidecar?.push(ciphertext)
            if (ffCollected < ffTarget) {
                const need = ffTarget - ffCollected
                ffChunks.push(ciphertext.subarray(0, Math.min(need, ciphertext.byteLength)))
                ffCollected += ciphertext.byteLength
            }
            await writeChunk(encrypted, ciphertext)
        }

        const { ciphertext: finalCiphertext } = await aesCbcEncryptChunk(
            aesKey,
            currentIv,
            pending,
            true
        )
        hmac.update(finalCiphertext)
        encHash.update(finalCiphertext)
        sidecar?.push(finalCiphertext)
        if (ffCollected < ffTarget) {
            const need = ffTarget - ffCollected
            ffChunks.push(finalCiphertext.subarray(0, Math.min(need, finalCiphertext.byteLength)))
        }
        await writeChunk(encrypted, finalCiphertext)

        const signature = toBytesView(hmac.digest().subarray(0, HMAC_TRUNCATED_SIZE))
        encHash.update(signature)
        sidecar?.push(signature)
        await writeChunk(encrypted, signature)
        encrypted.end()

        let firstFrameSidecar: Uint8Array | undefined
        if (ffTarget > 0) {
            const ffDigest = await hmacSha256Sign(keys.macKey, ffChunks)
            firstFrameSidecar = ffDigest.subarray(0, SIDECAR_HMAC_SIZE)
        }

        return {
            fileSha256: toBytesView(plainHash.digest()),
            fileEncSha256: toBytesView(encHash.digest()),
            plaintextLength,
            streamingSidecar: sidecar?.finish(),
            firstFrameSidecar
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
    keys: WaMediaDerivedKeys,
    computeSidecar: boolean,
    firstFrameLength?: number
): Promise<{
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly plaintextLength: number
    readonly streamingSidecar?: Uint8Array
    readonly firstFrameSidecar?: Uint8Array
}> {
    const aesKey = keys.encKey
    const plainHash = createHash('sha256')
    const encHash = createHash('sha256')
    const hmac = createHmac('sha256', keys.macKey)
    const sidecar = computeSidecar ? new SidecarAccumulator(keys.macKey) : null
    const ffTarget =
        firstFrameLength !== undefined
            ? IV_SIZE + Math.ceil(firstFrameLength / AES_BLOCK_SIZE) * AES_BLOCK_SIZE
            : 0
    let ffCollected = 0
    const ffChunks: Uint8Array[] = ffTarget > 0 ? [keys.iv] : []
    if (ffTarget > 0) ffCollected = IV_SIZE
    let plaintextLength = 0
    let currentIv = keys.iv
    let pending: Uint8Array = EMPTY_BYTES

    hmac.update(keys.iv)
    sidecar?.push(keys.iv)
    try {
        for await (const chunk of plaintext) {
            const plainChunk = toChunkBytes(chunk)
            if (plainChunk.byteLength === 0) continue
            plaintextLength += plainChunk.byteLength
            plainHash.update(plainChunk)

            const combined =
                pending.byteLength > 0
                    ? concatBytes([pending, plainChunk])
                    : toBytesView(plainChunk)
            const aligned = combined.byteLength - (combined.byteLength % AES_BLOCK_SIZE)
            if (aligned === 0) {
                pending = combined
                continue
            }

            const toEncrypt = toBytesView(combined.subarray(0, aligned))
            pending = toBytesView(combined.subarray(aligned))

            const { ciphertext, nextIv } = await aesCbcEncryptChunk(
                aesKey,
                currentIv,
                toEncrypt,
                false
            )
            currentIv = nextIv
            hmac.update(ciphertext)
            encHash.update(ciphertext)
            sidecar?.push(ciphertext)
            if (ffCollected < ffTarget) {
                const need = ffTarget - ffCollected
                ffChunks.push(ciphertext.subarray(0, Math.min(need, ciphertext.byteLength)))
                ffCollected += ciphertext.byteLength
            }
            await writeChunkToWritable(output, ciphertext)
        }

        const { ciphertext: finalCiphertext } = await aesCbcEncryptChunk(
            aesKey,
            currentIv,
            pending,
            true
        )
        hmac.update(finalCiphertext)
        encHash.update(finalCiphertext)
        sidecar?.push(finalCiphertext)
        if (ffCollected < ffTarget) {
            const need = ffTarget - ffCollected
            ffChunks.push(finalCiphertext.subarray(0, Math.min(need, finalCiphertext.byteLength)))
        }
        await writeChunkToWritable(output, finalCiphertext)

        const signature = toBytesView(hmac.digest().subarray(0, HMAC_TRUNCATED_SIZE))
        encHash.update(signature)
        sidecar?.push(signature)
        await writeChunkToWritable(output, signature)
        await endWritable(output)

        let firstFrameSidecar: Uint8Array | undefined
        if (ffTarget > 0) {
            const ffDigest = await hmacSha256Sign(keys.macKey, ffChunks)
            firstFrameSidecar = ffDigest.subarray(0, SIDECAR_HMAC_SIZE)
        }

        return {
            fileSha256: toBytesView(plainHash.digest()),
            fileEncSha256: toBytesView(encHash.digest()),
            plaintextLength,
            streamingSidecar: sidecar?.finish(),
            firstFrameSidecar
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
    const aesKey = keys.encKey
    const plainHash = createHash('sha256')
    const encHash = createHash('sha256')
    const hmac = createHmac('sha256', keys.macKey)
    let currentIv = keys.iv
    let pending: Uint8Array = EMPTY_BYTES

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

            const combined =
                pending.byteLength > 0
                    ? concatBytes([pending, ciphertextChunk])
                    : toBytesView(ciphertextChunk)
            const aligned = combined.byteLength - (combined.byteLength % AES_BLOCK_SIZE)
            if (aligned > AES_BLOCK_SIZE) {
                const toDecrypt = combined.subarray(0, aligned - AES_BLOCK_SIZE)
                const { plaintext: plainChunk, nextIv } = await aesCbcDecryptChunk(
                    aesKey,
                    currentIv,
                    toDecrypt,
                    false
                )
                currentIv = nextIv
                if (plainChunk.byteLength > 0) {
                    plainHash.update(plainChunk)
                    await writeChunk(plaintext, plainChunk)
                }
                pending = toBytesView(combined.subarray(aligned - AES_BLOCK_SIZE))
            } else {
                pending = combined
            }
        }

        if (trailing.byteLength !== HMAC_TRUNCATED_SIZE) {
            throw new Error(`ciphertext too short: ${trailing.byteLength}`)
        }

        if (!options.skipMacVerification) {
            const signature = hmac.digest().subarray(0, HMAC_TRUNCATED_SIZE)
            if (!uint8TimingSafeEqual(signature, trailing)) {
                throw new Error('media MAC mismatch')
            }
        }

        if (pending.byteLength < AES_BLOCK_SIZE || pending.byteLength % AES_BLOCK_SIZE !== 0) {
            throw new Error(`invalid ciphertext length: ${pending.byteLength}`)
        }
        const { plaintext: plainFinal } = await aesCbcDecryptChunk(aesKey, currentIv, pending, true)
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
