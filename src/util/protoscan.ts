export const PROTO_WIRE_TYPES = Object.freeze({
    VARINT: 0,
    FIXED64: 1,
    LEN: 2,
    START_GROUP: 3,
    END_GROUP: 4,
    FIXED32: 5
} as const)

const PROTO_VARINT_MAX_BYTES = 10

export interface ProtoScanField {
    readonly fieldNumber: number
    readonly wireType: number
    /** Offset of the field's tag byte, so callers can slice the whole field. */
    readonly headerStart: number
    /** Decoded value for VARINT fields; `0` for every other wire type. */
    readonly varintValue: number
    /** Payload bounds for LEN fields; `valueEnd` is the field end for all types. */
    readonly valueStart: number
    readonly valueEnd: number
}

interface VarintReadResult {
    readonly value: number
    readonly next: number
}

export function readProtoVarint(bytes: Uint8Array, start: number, end: number): VarintReadResult {
    let cursor = start
    let value = 0
    let factor = 1

    while (cursor < end) {
        const byte = bytes[cursor]
        value += (byte & 0x7f) * factor
        if (!Number.isSafeInteger(value)) {
            throw new Error('varint exceeds safe integer range')
        }

        cursor += 1
        if ((byte & 0x80) === 0) {
            return { value, next: cursor }
        }

        factor *= 128
        if (factor > 2 ** 56) {
            throw new Error('varint exceeds supported range')
        }
    }

    throw new Error('unexpected end of buffer while reading varint')
}

/**
 * Walks a varint of up to the 10-byte protobuf limit without rejecting
 * values above `Number.MAX_SAFE_INTEGER` (64-bit fields such as negative
 * `int64` sign-extend to 10 bytes on the wire). The returned value loses
 * precision beyond 2^53; callers that need an exact number must use
 * {@link readProtoVarint}.
 */
function walkVarint(bytes: Uint8Array, start: number, end: number): VarintReadResult {
    let cursor = start
    let value = 0
    let factor = 1

    while (cursor < end && cursor - start < PROTO_VARINT_MAX_BYTES) {
        const byte = bytes[cursor]
        value += (byte & 0x7f) * factor
        cursor += 1
        if ((byte & 0x80) === 0) {
            return { value, next: cursor }
        }
        factor *= 128
    }
    if (cursor - start >= PROTO_VARINT_MAX_BYTES) {
        throw new Error('varint exceeds the 10 byte protobuf limit')
    }
    throw new Error('unexpected end of buffer while reading varint')
}

function skipGroup(bytes: Uint8Array, start: number, end: number): number {
    let cursor = start
    while (cursor < end) {
        const tag = readProtoVarint(bytes, cursor, end)
        const wireType = tag.value & 0x07
        cursor = tag.next
        if (wireType === PROTO_WIRE_TYPES.END_GROUP) {
            return cursor
        }
        if (wireType === PROTO_WIRE_TYPES.VARINT) {
            cursor = walkVarint(bytes, cursor, end).next
        } else if (wireType === PROTO_WIRE_TYPES.FIXED64) {
            cursor += 8
        } else if (wireType === PROTO_WIRE_TYPES.LEN) {
            const length = readProtoVarint(bytes, cursor, end)
            cursor = length.next + length.value
        } else if (wireType === PROTO_WIRE_TYPES.START_GROUP) {
            cursor = skipGroup(bytes, cursor, end)
        } else if (wireType === PROTO_WIRE_TYPES.FIXED32) {
            cursor += 4
        } else {
            throw new Error(`unsupported protobuf wire type ${wireType}`)
        }
        if (cursor > end) {
            throw new Error('invalid protobuf group field length')
        }
    }
    throw new Error('unexpected end of buffer while skipping group')
}

/**
 * Walks the top-level fields of a protobuf-encoded region without decoding
 * any payload, calling `onField` once per field in wire order. LEN fields
 * report their payload bounds so callers can decode individual records
 * lazily; unknown fields (including deprecated groups) are skipped by wire
 * type, matching generated decoder behavior.
 */
export function scanProtoFields(
    bytes: Uint8Array,
    start: number,
    end: number,
    onField: (field: ProtoScanField) => void
): void {
    let cursor = start
    while (cursor < end) {
        const tag = readProtoVarint(bytes, cursor, end)
        const fieldNumber = Math.floor(tag.value / 8)
        const wireType = tag.value & 0x07
        if (fieldNumber < 1) {
            throw new Error(`invalid protobuf field number ${fieldNumber}`)
        }

        if (wireType === PROTO_WIRE_TYPES.VARINT) {
            const value = walkVarint(bytes, tag.next, end)
            onField({
                fieldNumber,
                wireType,
                headerStart: cursor,
                varintValue: value.value,
                valueStart: tag.next,
                valueEnd: value.next
            })
            cursor = value.next
            continue
        }
        if (wireType === PROTO_WIRE_TYPES.FIXED64) {
            const valueEnd = tag.next + 8
            if (valueEnd > end) {
                throw new Error('invalid protobuf fixed64 field length')
            }
            onField({
                fieldNumber,
                wireType,
                headerStart: cursor,
                varintValue: 0,
                valueStart: tag.next,
                valueEnd
            })
            cursor = valueEnd
            continue
        }
        if (wireType === PROTO_WIRE_TYPES.LEN) {
            const length = readProtoVarint(bytes, tag.next, end)
            const valueEnd = length.next + length.value
            if (valueEnd > end) {
                throw new Error('invalid protobuf length-delimited field length')
            }
            onField({
                fieldNumber,
                wireType,
                headerStart: cursor,
                varintValue: 0,
                valueStart: length.next,
                valueEnd
            })
            cursor = valueEnd
            continue
        }
        if (wireType === PROTO_WIRE_TYPES.FIXED32) {
            const valueEnd = tag.next + 4
            if (valueEnd > end) {
                throw new Error('invalid protobuf fixed32 field length')
            }
            onField({
                fieldNumber,
                wireType,
                headerStart: cursor,
                varintValue: 0,
                valueStart: tag.next,
                valueEnd
            })
            cursor = valueEnd
            continue
        }
        if (wireType === PROTO_WIRE_TYPES.START_GROUP) {
            cursor = skipGroup(bytes, tag.next, end)
            continue
        }
        if (wireType === PROTO_WIRE_TYPES.END_GROUP) {
            throw new Error('unmatched protobuf end-group field')
        }
        throw new Error(`unsupported protobuf wire type ${wireType}`)
    }
}
