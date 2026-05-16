import { hkdfSync } from 'node:crypto'

import { EMPTY_BYTES, toBytesView } from '@util/bytes'

export function hkdf(
    ikm: Uint8Array,
    salt: Uint8Array | null,
    info: Uint8Array,
    outLength: number
): Uint8Array {
    return toBytesView(hkdfSync('sha256', ikm, salt ?? EMPTY_BYTES, info, outLength))
}

export function hkdfSplit(
    ikm: Uint8Array,
    salt: Uint8Array | null,
    info: Uint8Array
): readonly [Uint8Array, Uint8Array] {
    const out = hkdf(ikm, salt, info, 64)
    return [out.subarray(0, 32), out.subarray(32)]
}
