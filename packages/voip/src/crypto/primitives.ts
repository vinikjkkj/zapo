import {
    createCipheriv,
    createHmac,
    randomBytes as nodeRandomBytes,
    randomInt as nodeRandomInt
} from 'node:crypto'

import { toBytesView } from 'zapo-js/util'

export function randomBytes(length: number): Uint8Array {
    return toBytesView(nodeRandomBytes(length))
}

export function randomInt(min: number, max: number): number {
    return nodeRandomInt(min, max)
}

export function hmacSha1(key: Uint8Array, ...parts: readonly Uint8Array[]): Uint8Array {
    const hmac = createHmac('sha1', key)
    for (const part of parts) {
        hmac.update(part)
    }
    return toBytesView(hmac.digest())
}

export function aesCtr128(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
    const cipher = createCipheriv('aes-128-ctr', key, iv)
    const output = toBytesView(cipher.update(data))
    cipher.final()
    return output
}
