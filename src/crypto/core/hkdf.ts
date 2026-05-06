import { hkdfSync } from 'node:crypto'

import { EMPTY_BYTES, TEXT_ENCODER, toBytesView } from '@util/bytes'

export function hkdf(
    ikm: Uint8Array,
    salt: Uint8Array | null,
    info: Uint8Array | string,
    outLength: number
): Uint8Array {
    const infoBytes =
        typeof info === 'string' ? (info === '' ? EMPTY_BYTES : TEXT_ENCODER.encode(info)) : info
    return toBytesView(hkdfSync('sha256', ikm, salt ?? EMPTY_BYTES, infoBytes, outLength))
}

export function hkdfSplit(
    ikm: Uint8Array,
    salt: Uint8Array | null,
    info: string
): readonly [Uint8Array, Uint8Array] {
    const out = hkdf(ikm, salt, info, 64)
    return [out.subarray(0, 32), out.subarray(32)]
}
