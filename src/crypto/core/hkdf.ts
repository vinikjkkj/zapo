import { webcrypto } from 'node:crypto'

import { EMPTY_BYTES, TEXT_ENCODER, toBytesView } from '@util/bytes'

export async function hkdf(
    ikm: Uint8Array,
    salt: Uint8Array | null,
    info: Uint8Array | string,
    outLength: number
): Promise<Uint8Array> {
    const key = await webcrypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
    const infoBytes =
        typeof info === 'string' ? (info === '' ? EMPTY_BYTES : TEXT_ENCODER.encode(info)) : info
    const bits = await webcrypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: salt ?? EMPTY_BYTES,
            info: infoBytes
        },
        key,
        outLength * 8
    )
    return toBytesView(bits)
}

export async function hkdfSplit(
    ikm: Uint8Array,
    salt: Uint8Array | null,
    info: string
): Promise<readonly [Uint8Array, Uint8Array]> {
    const out = await hkdf(ikm, salt, info, 64)
    return [out.subarray(0, 32), out.subarray(32)]
}
