import { hkdf } from 'zapo-js/crypto'

import { TEXT_ENCODER } from '../bytes.js'
import type { SrtpKeyingMaterial } from '../types.js'

import { randomBytes } from './primitives.js'

/**
 * Derives the end-to-end SRTP keying material of one device from the call key.
 *
 * The whole 32-byte call key is the HKDF input, the salt is empty, and the
 * device jid is the info string. The 46 bytes out split into a 16-byte master
 * key and a 14-byte master salt.
 *
 * The call key is **not** split into a 16-byte input plus a 16-byte salt. That
 * split belongs to the SFrame key derivation, which is a different function,
 * and applying it here yields a key no WhatsApp peer agrees with: this
 * derivation is what decrypts real media today.
 */
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
