import type { WaStoredPrivacyTokenRecord } from 'zapo-js/store'

import { toNumber } from './numeric'
import type { WhatsmeowPrivacyTokenRow } from './types'

export function convertWhatsmeowPrivacyToken(
    row: WhatsmeowPrivacyTokenRow,
    options: { readonly nowMs?: number } = {}
): WaStoredPrivacyTokenRecord {
    return {
        jid: row.their_jid,
        tcToken: row.token,
        tcTokenTimestamp: toNumber(row.timestamp, 'privacy_tokens.timestamp'),
        tcTokenSenderTimestamp:
            row.sender_timestamp !== null && row.sender_timestamp !== undefined
                ? toNumber(row.sender_timestamp, 'privacy_tokens.sender_timestamp')
                : undefined,
        updatedAtMs: options.nowMs ?? Date.now()
    }
}
