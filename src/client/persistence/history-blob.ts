import { pipeline, Readable } from 'node:stream'
import { createUnzip } from 'node:zlib'

import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import type { MediaCryptoType } from '@media/types'
import { decodeProtoBytes } from '@util/bytes'

/**
 * Encrypted-blob fields shared by the history-sync notification and the
 * group-history bundle: both point at a CDN object plus the key and hashes
 * needed to decrypt and verify it.
 */
export interface WaHistoryBlobSource {
    readonly directPath?: string | null
    readonly mediaKey?: Uint8Array | string | null
    readonly fileSha256?: Uint8Array | string | null
    readonly fileEncSha256?: Uint8Array | string | null
}

/**
 * Fetches and decrypts a history blob. `label` prefixes the field errors so a
 * failure names which payload was malformed.
 *
 * @throws when `directPath` is absent or a key/hash field is missing.
 */
export async function downloadHistoryBlob(
    mediaTransfer: WaMediaTransferClient,
    source: WaHistoryBlobSource,
    mediaType: MediaCryptoType,
    label: string
): Promise<Uint8Array> {
    if (!source.directPath) {
        throw new Error(`${label} missing directPath`)
    }
    const mediaKey = decodeProtoBytes(source.mediaKey, `${label} mediaKey`)
    const fileSha256 = decodeProtoBytes(source.fileSha256, `${label} fileSha256`)
    const fileEncSha256 = decodeProtoBytes(source.fileEncSha256, `${label} fileEncSha256`)
    return mediaTransfer.downloadAndDecrypt({
        directPath: source.directPath,
        mediaType,
        mediaKey,
        fileSha256,
        fileEncSha256
    })
}

export interface WaHistoryBlobStream {
    /** Decrypted and decompressed bytes. Consume fully, then await `verified`. */
    readonly inflated: Readable
    /**
     * Settles once the transfer ended and its MAC checked out. Verification can
     * only finish with the last byte, so anything read from `inflated` is
     * unauthenticated until this resolves - await it before treating the chunk
     * as applied.
     */
    readonly verified: Promise<unknown>
}

/**
 * Streaming counterpart of {@link downloadHistoryBlob}, so a multi-megabyte chunk
 * is never held whole. Uses `inlinePayload` when the notification carried the
 * blob inline instead of pointing at a CDN object.
 *
 * @throws when neither an inline payload nor a `directPath` is present, or when
 * a key/hash field is missing.
 */
export async function openHistoryBlobStream(
    mediaTransfer: WaMediaTransferClient,
    source: WaHistoryBlobSource,
    mediaType: MediaCryptoType,
    label: string,
    inlinePayload?: Uint8Array | string | null
): Promise<WaHistoryBlobStream> {
    if (inlinePayload) {
        const bytes = decodeProtoBytes(inlinePayload, `${label} inline payload`)
        return inflateHistoryStream(Readable.from([bytes]), Promise.resolve(null))
    }
    if (!source.directPath) {
        throw new Error(`${label} missing directPath`)
    }
    const decrypted = await mediaTransfer.downloadAndDecryptStream({
        directPath: source.directPath,
        mediaType,
        mediaKey: decodeProtoBytes(source.mediaKey, `${label} mediaKey`),
        fileSha256: decodeProtoBytes(source.fileSha256, `${label} fileSha256`),
        fileEncSha256: decodeProtoBytes(source.fileEncSha256, `${label} fileEncSha256`)
    })
    return inflateHistoryStream(decrypted.plaintext, decrypted.metadata)
}

/**
 * `createUnzip` detects the framing. `pipeline` rather than `pipe` so failure
 * closes both directions: a consumer that destroys `inflated` mid-chunk also
 * tears down the decryption pump and its socket, which `pipe` would leave
 * draining. Also parks a handler on `verified` so an early rejection is never
 * unobserved.
 */
function inflateHistoryStream(
    plaintext: Readable,
    verified: Promise<unknown>
): WaHistoryBlobStream {
    const unzip = createUnzip()
    pipeline(plaintext, unzip, () => undefined)
    verified.catch(() => undefined)
    return { inflated: unzip, verified }
}

/**
 * Awaits an accumulating write batch and empties it in place, so the caller can
 * keep filling the same array instead of allocating a new one per chunk.
 */
export async function flushPendingWrites(pendingWrites: Promise<void>[]): Promise<void> {
    if (pendingWrites.length === 0) {
        return
    }
    const settled = Promise.all(pendingWrites)
    pendingWrites.length = 0
    await settled
}
