import { randomBytes } from 'node:crypto'

import { hkdf } from 'zapo-js/crypto'
import { TEXT_ENCODER } from 'zapo-js/util'

import type { SrtpKeyingMaterial } from './types.js'

export async function derivePerJidSrtpKey(
    callKey: Uint8Array,
    deviceJid: string
): Promise<SrtpKeyingMaterial> {
    const output = hkdf(callKey, null, TEXT_ENCODER.encode(deviceJid), 46)
    return {
        masterKey: output.slice(0, 16),
        masterSalt: output.slice(16, 30)
    }
}

export function generateCallKey(): Uint8Array {
    return randomBytes(32)
}
