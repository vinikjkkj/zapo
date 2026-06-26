import { hkdf } from 'zapo-js/crypto'

import { encodeAscii, readUInt32LE, writeUInt32LE } from '../bytes.js'

export function generateSecureSsrc(callId: string, selfJid: string, counter = 0): number {
    const key = encodeAscii(callId)
    const salt = new Uint8Array(4)
    writeUInt32LE(salt, counter, 0)
    const info = encodeAscii(selfJid)

    const result = hkdf(key, salt, info, 4)
    return readUInt32LE(result, 0)
}
