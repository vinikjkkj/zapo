import { concatBytes } from './bytes.js'

/**
 * Protobuf field writing, shared by the app-data payloads and the relay's subscription
 * lists. `bigint` throughout because an app-data transaction id is a random `uint64`;
 * callers holding a `number` convert at their own boundary.
 */

const WIRE_TYPE_VARINT = 0
const WIRE_TYPE_LENGTH_DELIMITED = 2

const VARINT_CONTINUATION = 0x80
const VARINT_PAYLOAD_MASK = 0x7fn
const VARINT_SHIFT = 7n

function encodeVarint(value: bigint): Uint8Array {
    const bytes: number[] = []
    let remaining = value
    while (remaining > VARINT_PAYLOAD_MASK) {
        bytes.push(Number(remaining & VARINT_PAYLOAD_MASK) | VARINT_CONTINUATION)
        remaining >>= VARINT_SHIFT
    }
    bytes.push(Number(remaining & VARINT_PAYLOAD_MASK))
    return new Uint8Array(bytes)
}

function encodeTag(fieldNumber: number, wireType: number): Uint8Array {
    // Widened before the shift: `<<` on a `number` is a 32-bit operation and truncates a
    // field number large enough to reach the sign bit.
    return encodeVarint((BigInt(fieldNumber) << 3n) | BigInt(wireType))
}

export function encodeProtoVarintField(fieldNumber: number, value: bigint): Uint8Array {
    return concatBytes([encodeTag(fieldNumber, WIRE_TYPE_VARINT), encodeVarint(value)])
}

export function encodeProtoLengthDelimited(fieldNumber: number, data: Uint8Array): Uint8Array {
    return concatBytes([
        encodeTag(fieldNumber, WIRE_TYPE_LENGTH_DELIMITED),
        encodeVarint(BigInt(data.length)),
        data
    ])
}
