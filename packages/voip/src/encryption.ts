import { randomBytes } from 'node:crypto'

import { hkdf } from 'zapo-js/crypto'
import { toBytesView } from 'zapo-js/util'

import type { SrtpKeyingMaterial } from './types.js'

const textEncoder = new TextEncoder()

export async function derivePerJidSrtpKey(
    callKey: Uint8Array,
    deviceJid: string
): Promise<SrtpKeyingMaterial> {
    const output = hkdf(callKey, null, textEncoder.encode(deviceJid), 46)
    return {
        masterKey: output.subarray(0, 16),
        masterSalt: output.subarray(16, 30)
    }
}

export function generateCallKey(): Uint8Array {
    return toBytesView(randomBytes(32))
}
