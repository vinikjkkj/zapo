import { hkdf } from 'zapo-js/crypto'

import { TEXT_ENCODER } from '../bytes.js'
import type { SrtpKeyingMaterial } from '../types.js'

import { randomBytes } from './primitives.js'

export function derivePerJidSrtpKey(callKey: Uint8Array, deviceJid: string): SrtpKeyingMaterial {
    const output = hkdf(callKey, null, TEXT_ENCODER.encode(deviceJid), 46)
    return {
        masterKey: output.subarray(0, 16),
        masterSalt: output.subarray(16, 30)
    }
}

export function generateCallKey(): Uint8Array {
    return randomBytes(32)
}
