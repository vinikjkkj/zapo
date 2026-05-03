import { decodeSenderKeyRecord, type SenderKeyRecord } from 'zapo-js/signal'

import { signalAddressFromLibsignalString } from '../util/address'

import type { WhatsmeowSenderKeyRow } from './types'

export function convertWhatsmeowSenderKey(
    row: WhatsmeowSenderKeyRow,
    options: { readonly server?: string } = {}
): SenderKeyRecord {
    const sender = signalAddressFromLibsignalString(row.sender_id, options)
    return decodeSenderKeyRecord(row.sender_key, row.chat_id, sender)
}
