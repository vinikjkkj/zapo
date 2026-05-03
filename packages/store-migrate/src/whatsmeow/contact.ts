import type { WaStoredContactRecord } from 'zapo-js/store'

import type { WhatsmeowContactRow } from './types'

export function convertWhatsmeowContact(
    row: WhatsmeowContactRow,
    options: { readonly nowMs?: number } = {}
): WaStoredContactRecord {
    const displayName =
        row.full_name ?? row.first_name ?? row.push_name ?? row.business_name ?? undefined
    return {
        jid: row.their_jid,
        displayName,
        pushName: row.push_name ?? undefined,
        phoneNumber: row.redacted_phone ?? undefined,
        lastUpdatedMs: options.nowMs ?? Date.now()
    }
}
