import type { AppStateCollectionName, WaAppStateSyncKey } from '@appstate/types'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import type { Proto } from '@proto'
import { WA_APP_STATE_COLLECTIONS, WA_APP_STATE_KEY_TYPES } from '@protocol/constants'
import { decodeProtoBytes } from '@util/bytes'

const APP_STATE_COLLECTION_NAMES = new Set<string>(Object.values(WA_APP_STATE_COLLECTIONS))

/**
 * Returns `value` typed as a known {@link AppStateCollectionName}, or `null`
 * when the string is unrecognized.
 */
export function parseCollectionName(value: string | undefined): AppStateCollectionName | null {
    return value && APP_STATE_COLLECTION_NAMES.has(value) ? (value as AppStateCollectionName) : null
}

function keyDeviceId(keyId: Uint8Array): number | null {
    return keyId.byteLength < 6 ? null : (keyId[0] << 8) | keyId[1]
}

/**
 * Reads the 32-bit big-endian epoch encoded in bytes 2..5 of an app-state key id.
 * Returns `-1` when the key id is too short.
 */
export function keyEpoch(keyId: Uint8Array): number {
    return keyId.byteLength < 6
        ? -1
        : keyId[2] * 16_777_216 + keyId[3] * 65_536 + keyId[4] * 256 + keyId[5]
}

/**
 * Picks the highest-epoch app-state sync key from `keys`. Ties are broken by
 * the lower device id. Returns `null` when the iterable is empty.
 */
export function pickActiveSyncKey(keys: Iterable<WaAppStateSyncKey>): WaAppStateSyncKey | null {
    let active: WaAppStateSyncKey | null = null
    for (const key of keys) {
        if (!active) {
            active = key
            continue
        }
        const currentEpoch = keyEpoch(active.keyId)
        const nextEpoch = keyEpoch(key.keyId)
        if (nextEpoch > currentEpoch) {
            active = key
            continue
        }
        if (nextEpoch < currentEpoch) {
            continue
        }
        const nextDeviceId = keyDeviceId(key.keyId)
        const currentDeviceId = keyDeviceId(active.keyId)
        if (nextDeviceId !== null && currentDeviceId !== null && nextDeviceId < currentDeviceId) {
            active = key
        }
    }
    return active
}

/**
 * Downloads and decrypts an external app-state blob via the media transfer
 * client. Throws when the reference is missing required fields.
 */
export async function downloadExternalBlobReference(
    mediaTransfer: WaMediaTransferClient,
    reference: Proto.IExternalBlobReference
): Promise<Uint8Array> {
    if (!reference.directPath) {
        throw new Error('external blob reference is missing directPath')
    }
    const mediaKey = decodeProtoBytes(reference.mediaKey, 'external blob mediaKey')
    const fileSha256 = decodeProtoBytes(reference.fileSha256, 'external blob fileSha256')
    const fileEncSha256 = decodeProtoBytes(reference.fileEncSha256, 'external blob fileEncSha256')
    return mediaTransfer.downloadAndDecrypt({
        directPath: reference.directPath,
        mediaType: WA_APP_STATE_KEY_TYPES.MD_APP_STATE,
        mediaKey,
        fileSha256,
        fileEncSha256
    })
}
