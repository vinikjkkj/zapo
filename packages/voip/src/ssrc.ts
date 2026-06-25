import { hkdfSync } from 'node:crypto'

import { toBytesView } from 'zapo-js/util'

import { encodeAscii, readUInt32LE, writeUInt32LE } from './bytes.js'

export function generateSecureSsrc(callId: string, selfJid: string, counter = 0): number {
    const key = encodeAscii(callId)
    const salt = new Uint8Array(4)
    writeUInt32LE(salt, counter, 0)
    const info = encodeAscii(selfJid)

    const result = toBytesView(hkdfSync('sha256', key, salt, info, 4))
    return readUInt32LE(result, 0)
}
