import {
    decodeSignalSessionRecord,
    type SignalAddress,
    type SignalSessionRecord
} from 'zapo-js/signal'

import { signalAddressFromLibsignalString } from '../util/address'

import type { WhatsmeowSessionRow } from './types'

export function convertWhatsmeowSession(
    row: WhatsmeowSessionRow,
    options: { readonly server?: string } = {}
): { readonly address: SignalAddress; readonly record: SignalSessionRecord } {
    return {
        address: signalAddressFromLibsignalString(row.their_id, options),
        record: decodeSignalSessionRecord(row.session)
    }
}
