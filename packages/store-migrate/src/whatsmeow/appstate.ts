import {
    type AppStateCollectionName,
    decodeAppStateFingerprint,
    type WaAppStateSyncKey
} from 'zapo-js/appstate'
import type { WaAppStateCollectionStateUpdate } from 'zapo-js/store'
import { bytesToHex } from 'zapo-js/util'

import { toNumber } from './numeric'
import type {
    WhatsmeowAppStateMutationMacRow,
    WhatsmeowAppStateSyncKeyRow,
    WhatsmeowAppStateVersionRow
} from './types'

export function convertWhatsmeowAppStateSyncKey(
    row: WhatsmeowAppStateSyncKeyRow
): WaAppStateSyncKey {
    return {
        keyId: row.key_id,
        keyData: row.key_data,
        timestamp: toNumber(row.timestamp, 'app_state_sync_keys.timestamp'),
        fingerprint: decodeAppStateFingerprint(row.fingerprint)
    }
}

/** Joins version + mutation_macs rows; zapo persists them inline keyed by hex(indexMac). */
export function convertWhatsmeowAppStateVersion(
    versionRow: WhatsmeowAppStateVersionRow,
    mutationRows: readonly WhatsmeowAppStateMutationMacRow[]
): WaAppStateCollectionStateUpdate {
    const indexValueMap = new Map<string, Uint8Array>()
    for (let i = 0; i < mutationRows.length; i += 1) {
        const mut = mutationRows[i]
        indexValueMap.set(bytesToHex(mut.index_mac), mut.value_mac)
    }
    return {
        collection: versionRow.name as AppStateCollectionName,
        version: toNumber(versionRow.version, 'app_state_version.version'),
        hash: versionRow.hash,
        indexValueMap
    }
}
