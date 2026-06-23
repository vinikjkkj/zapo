import { randomBytes } from 'node:crypto'

import { hkdf } from 'zapo-js/crypto'

import type { SrtpKeyingMaterial } from './types.js'

const textEncoder = new TextEncoder()

export async function derivePerJidSrtpKey(
    callKey: Buffer,
    deviceJid: string
): Promise<SrtpKeyingMaterial> {
    // zapo's hkdf is sync with signature (ikm, salt, info, outLength) and an
    // empty salt when null — matching baileys' hkdf(key, 46, { info }).
    const output = hkdf(callKey, null, textEncoder.encode(deviceJid), 46)
    return {
        masterKey: Buffer.from(output.subarray(0, 16)),
        masterSalt: Buffer.from(output.subarray(16, 30))
    }
}

export function generateCallKey(): Buffer {
    return randomBytes(32)
}
