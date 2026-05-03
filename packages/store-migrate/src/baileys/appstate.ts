import type { AppStateCollectionName, WaAppStateSyncKey } from 'zapo-js/appstate'
import type { WaAppStateCollectionStateUpdate } from 'zapo-js/store'
import { base64ToBytes, bytesToHex } from 'zapo-js/util'

import type { BaileysAppStateSyncKeyData, BaileysLTHashState } from './types'

export function convertBaileysAppStateSyncKey(
    id: Uint8Array | string,
    data: BaileysAppStateSyncKeyData
): WaAppStateSyncKey {
    const keyId = typeof id === 'string' ? base64ToBytes(id) : id
    const timestamp =
        typeof data.timestamp === 'string'
            ? Number.parseInt(data.timestamp, 10)
            : (data.timestamp ?? 0)
    return {
        keyId,
        keyData: data.keyData ?? new Uint8Array(0),
        timestamp,
        fingerprint: data.fingerprint
            ? {
                  rawId: data.fingerprint.rawId,
                  currentIndex: data.fingerprint.currentIndex,
                  deviceIndexes:
                      data.fingerprint.deviceIndexes !== undefined
                          ? Array.from(data.fingerprint.deviceIndexes)
                          : undefined
              }
            : undefined
    }
}

/** Baileys keys `indexValueMap` by base64(indexMac); zapo expects hex. */
export function convertBaileysAppStateVersion(
    collection: AppStateCollectionName,
    state: BaileysLTHashState
): WaAppStateCollectionStateUpdate {
    const indexValueMap = new Map<string, Uint8Array>()
    for (const indexMacBase64 of Object.keys(state.indexValueMap)) {
        const entry = state.indexValueMap[indexMacBase64]
        if (!entry) continue
        indexValueMap.set(bytesToHex(base64ToBytes(indexMacBase64)), entry.valueMac)
    }
    return {
        collection,
        version: state.version,
        hash: state.hash,
        indexValueMap
    }
}
