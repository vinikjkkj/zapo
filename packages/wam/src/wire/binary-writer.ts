import { TEXT_ENCODER } from 'zapo-js/util'

/**
 * Minimal growable big-endian byte writer used by the WAM TLV encoder.
 *
 * Mirrors the subset of WA Web's `WABinary.Binary` the WAM buffer relies on
 * (`writeUint8/16/32`, `writeInt8/16/32/64`, `writeFloat64`, `writeString`).
 * Integers are written network order (big-endian), strings as raw UTF-8 with
 * no length prefix (the caller writes the length itself). `Uint8Array`-only so
 * the plugin never pulls in `Buffer`.
 */
export class BinaryWriter {
    private buffer: Uint8Array
    private offset = 0
    private readonly scratch = new DataView(new ArrayBuffer(8))

    constructor(initialCapacity = 256) {
        this.buffer = new Uint8Array(Math.max(1, initialCapacity))
    }

    private ensure(extra: number): void {
        const needed = this.offset + extra
        if (needed <= this.buffer.length) return
        let next = this.buffer.length * 2
        while (next < needed) next *= 2
        const grown = new Uint8Array(next)
        grown.set(this.buffer.subarray(0, this.offset))
        this.buffer = grown
    }

    writeUint8(value: number): void {
        this.ensure(1)
        this.buffer[this.offset++] = value & 0xff
    }

    writeInt8(value: number): void {
        this.writeUint8(value)
    }

    writeUint16(value: number): void {
        this.ensure(2)
        this.buffer[this.offset++] = (value >>> 8) & 0xff
        this.buffer[this.offset++] = value & 0xff
    }

    writeInt16(value: number): void {
        this.writeUint16(value)
    }

    writeUint32(value: number): void {
        this.ensure(4)
        this.buffer[this.offset++] = (value >>> 24) & 0xff
        this.buffer[this.offset++] = (value >>> 16) & 0xff
        this.buffer[this.offset++] = (value >>> 8) & 0xff
        this.buffer[this.offset++] = value & 0xff
    }

    writeInt32(value: number): void {
        this.writeUint32(value >>> 0)
    }

    writeInt64(value: number): void {
        this.ensure(8)
        this.scratch.setBigInt64(0, BigInt(value), false)
        for (let i = 0; i < 8; i += 1) this.buffer[this.offset++] = this.scratch.getUint8(i)
    }

    writeFloat64(value: number): void {
        this.ensure(8)
        this.scratch.setFloat64(0, value, false)
        for (let i = 0; i < 8; i += 1) this.buffer[this.offset++] = this.scratch.getUint8(i)
    }

    writeBytes(bytes: Uint8Array): void {
        this.ensure(bytes.length)
        this.buffer.set(bytes, this.offset)
        this.offset += bytes.length
    }

    /** Writes `value` as raw UTF-8 bytes (no length prefix). */
    writeString(value: string): void {
        this.writeBytes(TEXT_ENCODER.encode(value))
    }

    size(): number {
        return this.offset
    }

    toBytes(): Uint8Array {
        return this.buffer.slice(0, this.offset)
    }
}
