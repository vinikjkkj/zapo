import { hkdfSync } from 'node:crypto'

import { EMPTY_BYTES, TEXT_ENCODER, toBytesView } from '@util/bytes'

export function hkdf(
    ikm: Uint8Array,
    salt: Uint8Array | null,
    info: Uint8Array | string,
    outLength: number
): Promise<Uint8Array> {
    const infoBytes =
        typeof info === 'string' ? (info === '' ? EMPTY_BYTES : TEXT_ENCODER.encode(info)) : info
    return Promise.resolve(
        toBytesView(hkdfSync('sha256', ikm, salt ?? EMPTY_BYTES, infoBytes, outLength))
    )
}

export async function hkdfSplit(
    ikm: Uint8Array,
    salt: Uint8Array | null,
    info: string
): Promise<readonly [Uint8Array, Uint8Array]> {
    const out = await hkdf(ikm, salt, info, 64)
    return [out.subarray(0, 32), out.subarray(32)]
}
