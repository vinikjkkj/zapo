import type { WaStoredPrivacyTokenRecord } from 'zapo-js/store'

import type { BaileysTcTokenEntry } from './types'

export function convertBaileysTcToken(
    jid: string,
    entry: BaileysTcTokenEntry,
    options: { readonly nowMs?: number } = {}
): WaStoredPrivacyTokenRecord {
    const timestampSeconds =
        entry.timestamp !== undefined ? Number.parseInt(entry.timestamp, 10) : undefined
    return {
        jid,
        tcToken: entry.token,
        tcTokenTimestamp: Number.isFinite(timestampSeconds) ? timestampSeconds : undefined,
        updatedAtMs: options.nowMs ?? Date.now()
    }
}
