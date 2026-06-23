import { hkdfSync } from 'node:crypto'

export function generateSecureSsrc(callId: string, selfJid: string, counter = 0): number {
    const key = Buffer.from(callId, 'ascii')
    const salt = Buffer.alloc(4)
    salt.writeUInt32LE(counter, 0)
    const info = Buffer.from(selfJid, 'ascii')

    const result = hkdfSync('sha256', key, salt, info, 4)
    const buf = Buffer.from(result)
    return buf.readUInt32LE(0)
}
