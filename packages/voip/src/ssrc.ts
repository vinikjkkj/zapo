import { hkdfSync } from 'node:crypto'

import { TEXT_ENCODER } from 'zapo-js/util'

export function generateSecureSsrc(callId: string, selfJid: string, counter = 0): number {
    const key = TEXT_ENCODER.encode(callId)
    const salt = new Uint8Array(4)
    new DataView(salt.buffer).setUint32(0, counter, true)
    const info = TEXT_ENCODER.encode(selfJid)

    const result = hkdfSync('sha256', key, salt, info, 4)
    return new DataView(result).getUint32(0, true)
}
