import type { Readable } from 'node:stream'

import { EMPTY_BYTES, toChunkBytes } from '@util/bytes'
import { PROTO_WIRE_TYPES } from '@util/protoscan'

const PROTO_STREAM_INITIAL_BUFFER_BYTES = 64 * 1024
const PROTO_STREAM_VARINT_MAX_BYTES = 10
const PROTO_STREAM_DEFAULT_MAX_FIELD_BYTES = 32 * 1024 * 1024
const PROTO_STREAM_GROUP_MAX_DEPTH = 64
const PROTO_STREAM_MAX_DESCENT_DEPTH = 32

export const PROTO_STREAM_EVENT_KINDS = Object.freeze({
    FIELD: 'field',
    ENTER: 'enter',
    LEAVE: 'leave'
} as const)

export type ProtoStreamEventKind =
    (typeof PROTO_STREAM_EVENT_KINDS)[keyof typeof PROTO_STREAM_EVENT_KINDS]

export interface ProtoStreamFieldEvent {
    readonly kind: typeof PROTO_STREAM_EVENT_KINDS.FIELD
    readonly fieldNumber: number
    readonly wireType: number
    readonly depth: number
    /** `LEN` payload, empty otherwise. Aliases the reader buffer: copy to retain. */
    readonly value: Uint8Array
    /** The field as it was on the wire, tag included, for re-emitting a subset. */
    readonly raw: Uint8Array
    readonly varintValue: number
}

export interface ProtoStreamEnterEvent {
    readonly kind: typeof PROTO_STREAM_EVENT_KINDS.ENTER
    readonly fieldNumber: number
    readonly depth: number
    readonly byteLength: number
}

export interface ProtoStreamLeaveEvent {
    readonly kind: typeof PROTO_STREAM_EVENT_KINDS.LEAVE
    readonly fieldNumber: number
    readonly depth: number
}

export type ProtoStreamEvent = ProtoStreamFieldEvent | ProtoStreamEnterEvent | ProtoStreamLeaveEvent

/** Return nothing to keep the walk synchronous; return a promise only to make it wait. */
export type ProtoStreamHandler = (event: ProtoStreamEvent) => void | Promise<void>

export interface ProtoStreamOptions {
    /** Recurse into a `LEN` field instead of materializing it; subfields arrive at `depth + 1`. */
    readonly shouldDescend?: (fieldNumber: number, depth: number, byteLength: number) => boolean
    /** Cap on one materialized payload. Descended fields are exempt. Defaults to 32 MiB. */
    readonly maxFieldBytes?: number
}

interface DescentFrame {
    readonly fieldNumber: number
    readonly endOffset: number
}

class ProtoStreamReader {
    private readonly iterator: AsyncIterator<unknown>
    private buffer: Uint8Array
    private readPos = 0
    private writePos = 0
    private markPos = -1
    public consumed = 0

    public constructor(source: Readable) {
        this.iterator = source[Symbol.asyncIterator]() as AsyncIterator<unknown>
        this.buffer = new Uint8Array(PROTO_STREAM_INITIAL_BUFFER_BYTES)
    }

    public get buffered(): number {
        return this.writePos - this.readPos
    }

    public mark(): void {
        this.markPos = this.readPos
    }

    public takeMarked(): Uint8Array {
        const start = this.markPos
        this.markPos = -1
        if (start < 0) {
            return EMPTY_BYTES
        }
        return this.buffer.subarray(start, this.readPos)
    }

    public async ensure(byteLength: number): Promise<boolean> {
        while (this.buffered < byteLength) {
            const next = await this.iterator.next()
            if (next.done === true) {
                return false
            }
            const chunk = toChunkBytes(next.value)
            if (chunk.byteLength === 0) {
                continue
            }
            this.reserve(chunk.byteLength)
            this.buffer.set(chunk, this.writePos)
            this.writePos += chunk.byteLength
        }
        return true
    }

    public tryReadVarint(): number | null {
        let value = 0
        let factor = 1
        let cursor = this.readPos
        const limit = Math.min(this.writePos, this.readPos + PROTO_STREAM_VARINT_MAX_BYTES)
        while (cursor < limit) {
            const byte = this.buffer[cursor]
            cursor += 1
            value += (byte & 0x7f) * factor
            if ((byte & 0x80) === 0) {
                this.consumed += cursor - this.readPos
                this.readPos = cursor
                return value
            }
            factor *= 128
        }
        if (cursor - this.readPos >= PROTO_STREAM_VARINT_MAX_BYTES) {
            throw new Error('varint exceeds the 10 byte protobuf limit')
        }
        return null
    }

    public async readVarint(): Promise<number> {
        let value = 0
        let factor = 1
        for (let index = 0; index < PROTO_STREAM_VARINT_MAX_BYTES; index += 1) {
            if (this.buffered === 0 && !(await this.ensure(1))) {
                throw new Error('unexpected end of protobuf stream while reading varint')
            }
            const byte = this.buffer[this.readPos]
            this.readPos += 1
            this.consumed += 1
            value += (byte & 0x7f) * factor
            if ((byte & 0x80) === 0) {
                return value
            }
            factor *= 128
        }
        throw new Error('varint exceeds the 10 byte protobuf limit')
    }

    public tryReadExact(byteLength: number): Uint8Array | null {
        if (this.buffered < byteLength) {
            return null
        }
        const start = this.readPos
        this.readPos += byteLength
        this.consumed += byteLength
        return this.buffer.subarray(start, start + byteLength)
    }

    public async readExact(byteLength: number): Promise<Uint8Array> {
        if (byteLength === 0) {
            return this.buffer.subarray(this.readPos, this.readPos)
        }
        if (!(await this.ensure(byteLength))) {
            throw new Error('unexpected end of protobuf stream')
        }
        const start = this.readPos
        this.readPos += byteLength
        this.consumed += byteLength
        return this.buffer.subarray(start, start + byteLength)
    }

    public trySkip(byteLength: number): boolean {
        if (this.buffered < byteLength) {
            return false
        }
        this.readPos += byteLength
        this.consumed += byteLength
        return true
    }

    public async skip(byteLength: number): Promise<void> {
        let remaining = byteLength
        while (remaining > 0) {
            if (this.buffered === 0 && !(await this.ensure(1))) {
                throw new Error('unexpected end of protobuf stream')
            }
            const step = Math.min(remaining, this.buffered)
            this.readPos += step
            this.consumed += step
            remaining -= step
        }
    }

    private reserve(incomingBytes: number): void {
        if (this.writePos + incomingBytes <= this.buffer.byteLength) {
            return
        }
        const retainFrom = this.markPos >= 0 ? Math.min(this.markPos, this.readPos) : this.readPos
        const live = this.writePos - retainFrom
        if (retainFrom > 0 && live + incomingBytes <= this.buffer.byteLength) {
            this.buffer.copyWithin(0, retainFrom, this.writePos)
            this.readPos -= retainFrom
            this.writePos -= retainFrom
            if (this.markPos >= 0) {
                this.markPos -= retainFrom
            }
            return
        }
        let grown = this.buffer.byteLength
        while (grown < live + incomingBytes) {
            grown *= 2
        }
        const next = new Uint8Array(grown)
        next.set(this.buffer.subarray(retainFrom, this.writePos))
        this.readPos -= retainFrom
        this.writePos -= retainFrom
        if (this.markPos >= 0) {
            this.markPos -= retainFrom
        }
        this.buffer = next
    }
}

/**
 * Streaming counterpart of `scanProtoFields`: walks a protobuf message as it
 * arrives, calling `onEvent` per field in wire order. Fields chosen by
 * `shouldDescend` are recursed into instead of buffered, so peak memory tracks
 * the largest materialized leaf rather than the message. Unknown fields are
 * skipped by wire type.
 *
 * @throws on a truncated stream, an invalid length, or a payload over `maxFieldBytes`.
 */
export async function streamProtoFields(
    source: Readable,
    onEvent: ProtoStreamHandler,
    options: ProtoStreamOptions = {}
): Promise<void> {
    const maxFieldBytes = options.maxFieldBytes ?? PROTO_STREAM_DEFAULT_MAX_FIELD_BYTES
    if (!Number.isSafeInteger(maxFieldBytes) || maxFieldBytes <= 0) {
        throw new Error(`invalid max field bytes limit: ${maxFieldBytes}`)
    }
    const shouldDescend = options.shouldDescend
    const reader = new ProtoStreamReader(source)
    const stack: DescentFrame[] = []
    let value: Uint8Array = EMPTY_BYTES
    let varintValue = 0

    while (true) {
        while (stack.length > 0 && reader.consumed >= stack[stack.length - 1].endOffset) {
            const frame = stack[stack.length - 1]
            if (reader.consumed > frame.endOffset) {
                throw new Error('protobuf field overran its declared length')
            }
            stack.length -= 1
            const pending = onEvent({
                kind: PROTO_STREAM_EVENT_KINDS.LEAVE,
                fieldNumber: frame.fieldNumber,
                depth: stack.length
            })
            if (pending) {
                await pending
            }
        }

        if (reader.buffered === 0 && !(await reader.ensure(1))) {
            if (stack.length > 0) {
                throw new Error('unexpected end of protobuf stream inside a nested field')
            }
            return
        }

        const depth = stack.length
        const parentEnd = stack.length > 0 ? stack[stack.length - 1].endOffset : null
        reader.mark()
        const tag = reader.tryReadVarint() ?? (await reader.readVarint())
        assertWithinFrame(reader.consumed, parentEnd)
        const fieldNumber = Math.floor(tag / 8)
        const wireType = tag & 0x07
        if (fieldNumber < 1) {
            throw new Error(`invalid protobuf field number ${fieldNumber}`)
        }

        if (wireType === PROTO_WIRE_TYPES.LEN) {
            const byteLength = reader.tryReadVarint() ?? (await reader.readVarint())
            assertWithinFrame(reader.consumed, parentEnd)
            if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
                throw new Error(`invalid protobuf length-delimited field length ${byteLength}`)
            }
            if (parentEnd !== null && reader.consumed + byteLength > parentEnd) {
                throw new Error('protobuf field length exceeds its parent field')
            }
            if (shouldDescend?.(fieldNumber, depth, byteLength) === true) {
                if (stack.length >= PROTO_STREAM_MAX_DESCENT_DEPTH) {
                    throw new Error(
                        `protobuf descent exceeds the ${PROTO_STREAM_MAX_DESCENT_DEPTH} level limit`
                    )
                }
                reader.takeMarked()
                stack[stack.length] = { fieldNumber, endOffset: reader.consumed + byteLength }
                const pending = onEvent({
                    kind: PROTO_STREAM_EVENT_KINDS.ENTER,
                    fieldNumber,
                    depth,
                    byteLength
                })
                if (pending) {
                    await pending
                }
                continue
            }
            if (byteLength > maxFieldBytes) {
                throw new Error(
                    `protobuf field ${fieldNumber} of ${byteLength} bytes exceeds the ${maxFieldBytes} byte limit`
                )
            }
            value = reader.tryReadExact(byteLength) ?? (await reader.readExact(byteLength))
            varintValue = 0
        } else if (wireType === PROTO_WIRE_TYPES.VARINT) {
            value = EMPTY_BYTES
            varintValue = reader.tryReadVarint() ?? (await reader.readVarint())
            assertWithinFrame(reader.consumed, parentEnd)
        } else if (wireType === PROTO_WIRE_TYPES.FIXED64 || wireType === PROTO_WIRE_TYPES.FIXED32) {
            const width = wireType === PROTO_WIRE_TYPES.FIXED64 ? 8 : 4
            assertWithinFrame(reader.consumed + width, parentEnd)
            if (!reader.trySkip(width)) {
                await reader.skip(width)
            }
            value = EMPTY_BYTES
            varintValue = 0
        } else if (wireType === PROTO_WIRE_TYPES.START_GROUP) {
            reader.takeMarked()
            await skipStreamGroup(reader)
            continue
        } else if (wireType === PROTO_WIRE_TYPES.END_GROUP) {
            throw new Error('unmatched protobuf end-group field')
        } else {
            throw new Error(`unsupported protobuf wire type ${wireType}`)
        }

        const pending = onEvent({
            kind: PROTO_STREAM_EVENT_KINDS.FIELD,
            fieldNumber,
            wireType,
            depth,
            value,
            raw: reader.takeMarked(),
            varintValue
        })
        if (pending) {
            await pending
        }
    }
}

/**
 * A field must not read past the record that contains it. Checked before the
 * handler runs, so a truncated varint or fixed-width field is rejected instead
 * of being delivered with bytes borrowed from the parent.
 */
function assertWithinFrame(consumed: number, parentEnd: number | null): void {
    if (parentEnd !== null && consumed > parentEnd) {
        throw new Error('protobuf field overran its parent field')
    }
}

async function skipStreamGroup(reader: ProtoStreamReader, depth = 0): Promise<void> {
    if (depth >= PROTO_STREAM_GROUP_MAX_DEPTH) {
        throw new Error('protobuf group nesting exceeds supported depth')
    }
    while (true) {
        if (reader.buffered === 0 && !(await reader.ensure(1))) {
            throw new Error('unexpected end of protobuf stream while skipping group')
        }
        const tag = reader.tryReadVarint() ?? (await reader.readVarint())
        const wireType = tag & 0x07
        if (wireType === PROTO_WIRE_TYPES.END_GROUP) {
            return
        }
        if (wireType === PROTO_WIRE_TYPES.VARINT) {
            reader.tryReadVarint() ?? (await reader.readVarint())
        } else if (wireType === PROTO_WIRE_TYPES.FIXED64) {
            await reader.skip(8)
        } else if (wireType === PROTO_WIRE_TYPES.FIXED32) {
            await reader.skip(4)
        } else if (wireType === PROTO_WIRE_TYPES.LEN) {
            await reader.skip(reader.tryReadVarint() ?? (await reader.readVarint()))
        } else if (wireType === PROTO_WIRE_TYPES.START_GROUP) {
            await skipStreamGroup(reader, depth + 1)
        } else {
            throw new Error(`unsupported protobuf wire type ${wireType}`)
        }
    }
}
