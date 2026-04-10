/** In-memory media blob store served by the fake media endpoint. */

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
    readonly plaintext: Uint8Array
    readonly mediaType: FakeMediaType
    readonly path?: string
    readonly mediaKey?: Uint8Array
}

export interface PublishedMediaBlob {
    readonly path: string
    readonly mediaKey: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
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
