/**
 * In-memory media blob store served over the fake server's HTTP listener.
 *
 * Source:
 *   /deobfuscated/WAWebMediaCryptoUtil.js
 *   /deobfuscated/WAWebMediaConn.js
 *
 * The lib's `WaMediaTransferClient.downloadAndDecrypt` accepts an
 * absolute `directPath` (`http://...` or `https://...`) and downloads
 * the bytes verbatim before running its real
 * `WaMediaCrypto.decryptBytes` against them. By minting a fresh random
 * media key here, encrypting the plaintext via the lib's own
 * `WaMediaCrypto.encryptBytes`, and serving the resulting bytes via the
 * fake server's HTTP listener, the round-trip exercises the lib's full
 * media crypto path with no stubbing.
 */

import { randomBytes } from 'node:crypto'

import { WaMediaCrypto } from '../transport/crypto'

export type FakeMediaType =
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'sticker'
    | 'gif'
    | 'ptt'
    | 'history'
    | 'md-app-state'

export interface PublishMediaInput {
    /** Plaintext bytes the lib will receive after decryption. */
    readonly plaintext: Uint8Array
    /** HKDF info bucket — `image`, `video`, `history`, `md-app-state`, ... */
    readonly mediaType: FakeMediaType
    /**
     * Optional override for the URL path. If omitted, a random
     * `/mms/<type>/<hex>` path is generated. Tests can pass a fixed
     * path to make assertions easier.
     */
    readonly path?: string
    /**
     * Optional pre-existing media key. If omitted, a fresh 32-byte key
     * is generated.
     */
    readonly mediaKey?: Uint8Array
}

export interface PublishedMediaBlob {
    /** Random URL path the lib will GET (no leading host). */
    readonly path: string
    /** 32-byte media key the lib will need to derive the AES/IV/HMAC. */
    readonly mediaKey: Uint8Array
    /** SHA-256 of the plaintext (used for integrity check after decrypt). */
    readonly fileSha256: Uint8Array
    /** SHA-256 of the encrypted blob (used for integrity check before decrypt). */
    readonly fileEncSha256: Uint8Array
    /** Length of the encrypted blob in bytes. */
    readonly fileLength: number
    readonly mediaType: FakeMediaType
}

interface StoredBlob {
    readonly mediaType: FakeMediaType
    readonly encryptedBytes: Uint8Array
    readonly mediaKey: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
}

export class FakeMediaStore {
    private readonly blobs = new Map<string, StoredBlob>()

    public async publish(input: PublishMediaInput): Promise<PublishedMediaBlob> {
        const mediaKey = input.mediaKey ?? new Uint8Array(randomBytes(32))
        const encrypted = await WaMediaCrypto.encryptBytes(input.mediaType, mediaKey, input.plaintext)
        const path = input.path ?? this.randomPath(input.mediaType)
        const stored: StoredBlob = {
            mediaType: input.mediaType,
            encryptedBytes: encrypted.ciphertextHmac,
            mediaKey,
            fileSha256: encrypted.fileSha256,
            fileEncSha256: encrypted.fileEncSha256
        }
        this.blobs.set(path, stored)
        return {
            path,
            mediaKey,
            fileSha256: encrypted.fileSha256,
            fileEncSha256: encrypted.fileEncSha256,
            fileLength: encrypted.ciphertextHmac.byteLength,
            mediaType: input.mediaType
        }
    }

    public get(path: string): StoredBlob | undefined {
        return this.blobs.get(path)
    }

    public delete(path: string): boolean {
        return this.blobs.delete(path)
    }

    public clear(): void {
        this.blobs.clear()
    }

    private randomPath(mediaType: FakeMediaType): string {
        const slug = randomBytes(16).toString('hex')
        return `/fake-media/${mediaType}/${slug}`
    }
}
