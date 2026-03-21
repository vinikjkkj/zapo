import type { AppStateCollectionName, WaAppStateSyncKey } from '@appstate/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import type { Proto } from '@proto'
import { WA_APP_STATE_COLLECTIONS, WA_APP_STATE_KEY_TYPES } from '@protocol/constants'
import { decodeProtoBytes, intToBytes } from '@util/bytes'

const APP_STATE_COLLECTION_NAMES = new Set<string>(Object.values(WA_APP_STATE_COLLECTIONS))

export function parseCollectionName(value: string | undefined): AppStateCollectionName | null {
    return value && APP_STATE_COLLECTION_NAMES.has(value) ? (value as AppStateCollectionName) : null
}

export function keyDeviceId(keyId: Uint8Array): number | null {
    return keyId.byteLength < 6 ? null : (keyId[0] << 8) | keyId[1]
}

export function keyEpoch(keyId: Uint8Array): number {
    return keyId.byteLength < 6
        ? -1
        : keyId[2] * 16_777_216 + keyId[3] * 65_536 + keyId[4] * 256 + keyId[5]
}

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

export function toNetworkOrder64(value: number): Uint8Array {
    return intToBytes(8, value)
}

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
