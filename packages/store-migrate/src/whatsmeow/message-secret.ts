import type { WaMessageSecretEntry } from 'zapo-js/store'

import type { WhatsmeowMessageSecretRow } from './types'

export function convertWhatsmeowMessageSecret(row: WhatsmeowMessageSecretRow): {
    readonly messageId: string
    readonly entry: WaMessageSecretEntry
} {
    return {
        messageId: row.message_id,
        entry: {
            secret: row.key,
            senderJid: row.sender_jid
        }
    }
}
