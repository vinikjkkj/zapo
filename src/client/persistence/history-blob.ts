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
