import { assertByteLength } from '@util/bytes'

const SERIALIZED_PUB_KEY_PREFIX = 5

/**
 * Converts a 32-byte raw public key to 33-byte serialized format (with 0x05 prefix)
 */
export function toSerializedPubKey(key: Uint8Array): Uint8Array {
    if (key.length === 33) {
        if (key[0] !== SERIALIZED_PUB_KEY_PREFIX) {
            throw new Error('invalid serialized signal public key prefix')
        }
        return key
    }
    assertByteLength(key, 32, `invalid signal public key length ${key.length}`)
    const out = new Uint8Array(33)
    out[0] = SERIALIZED_PUB_KEY_PREFIX
    out.set(key, 1)
    return out
}

/**
 * Converts a 33-byte serialized public key to 32-byte raw format
 */
export function toRawPubKey(key: Uint8Array): Uint8Array {
    if (key.length === 32) {
        return key
    }
    if (key.length === 33 && key[0] === SERIALIZED_PUB_KEY_PREFIX) {
        return key.subarray(1)
    }
    throw new Error(`invalid signal public key length ${key.length}`)
}

/**
 * Creates a version byte from high and low nibbles
 */
export function versionByte(high: number, low: number): number {
    return ((high << 4) | low) & 0xff
}

/**
 * Prepends a version byte to content
 */
export function prependVersion(content: Uint8Array, version: number): Uint8Array {
    const out = new Uint8Array(1 + content.length)
    out[0] = versionByte(version, version)
    out.set(content, 1)
    return out
}

/**
 * Reads versioned content, validating the version and extracting the body
 */
export function readVersionedContent(
    versionContent: Uint8Array,
    expectedVersion: number,
    suffixLength: number
): Uint8Array {
    if (versionContent.length < 1) {
        throw new Error('signal versioned content is empty')
    }
    const version = versionContent[0] >>> 4
    if (version !== expectedVersion) {
        if (version < expectedVersion) {
            throw new Error('legacy signal version')
        }
        throw new Error(`unsupported signal version ${version}`)
    }

    const bodyEnd = versionContent.length - suffixLength
    if (bodyEnd <= 1) {
        throw new Error('invalid signal content length')
    }
    return versionContent.subarray(1, bodyEnd)
}
