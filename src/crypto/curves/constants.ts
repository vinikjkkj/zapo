import { hexToBytes } from '@util/bytes'

export const X25519_PKCS8_PREFIX: Readonly<Uint8Array> = hexToBytes(
    '302e020100300506032b656e04220420'
)
export const X25519_SPKI_PREFIX: Readonly<Uint8Array> = hexToBytes('302a300506032b656e032100')
export const ED25519_PKCS8_PREFIX: Readonly<Uint8Array> = hexToBytes(
    '302e020100300506032b657004220420'
)
export const ED25519_SPKI_PREFIX: Readonly<Uint8Array> = hexToBytes('302a300506032b6570032100')
