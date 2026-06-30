import {
    base64ToBytes,
    bytesToBase64,
    bytesToHex,
    concatBytes,
    EMPTY_BYTES,
    TEXT_DECODER,
    TEXT_ENCODER,
    toBytesView
} from 'zapo-js/util'

export {
    base64ToBytes,
    bytesToBase64,
    bytesToHex,
    concatBytes,
    EMPTY_BYTES,
    TEXT_DECODER,
    TEXT_ENCODER,
    toBytesView
}

function ensureBounds(buf: Uint8Array, offset: number, size: number): void {
    if (!Number.isInteger(offset) || offset < 0 || offset + size > buf.length) {
        throw new RangeError(
            `byte access out of range: offset ${offset}, size ${size}, length ${buf.length}`
        )
    }
}

export function readUInt16BE(buf: Uint8Array, offset: number): number {
    ensureBounds(buf, offset, 2)
    return (buf[offset] << 8) | buf[offset + 1]
}

export function readUInt32BE(buf: Uint8Array, offset: number): number {
    ensureBounds(buf, offset, 4)
    return (
        ((buf[offset] << 24) |
            (buf[offset + 1] << 16) |
            (buf[offset + 2] << 8) |
            buf[offset + 3]) >>>
        0
    )
}

export function readUInt32LE(buf: Uint8Array, offset: number): number {
    ensureBounds(buf, offset, 4)
    return (
        (buf[offset] |
            (buf[offset + 1] << 8) |
            (buf[offset + 2] << 16) |
            (buf[offset + 3] << 24)) >>>
        0
    )
}

export function readBigUInt64BE(buf: Uint8Array, offset: number): bigint {
    const hi = readUInt32BE(buf, offset)
    const lo = readUInt32BE(buf, offset + 4)
    return (BigInt(hi) << 32n) | BigInt(lo)
}

export function writeUInt16BE(buf: Uint8Array, value: number, offset: number): void {
    ensureBounds(buf, offset, 2)
    buf[offset] = (value >> 8) & 0xff
    buf[offset + 1] = value & 0xff
}

export function writeUInt32BE(buf: Uint8Array, value: number, offset: number): void {
    ensureBounds(buf, offset, 4)
    buf[offset] = (value >> 24) & 0xff
    buf[offset + 1] = (value >> 16) & 0xff
    buf[offset + 2] = (value >> 8) & 0xff
    buf[offset + 3] = value & 0xff
}

export function writeUInt32LE(buf: Uint8Array, value: number, offset: number): void {
    ensureBounds(buf, offset, 4)
    buf[offset] = value & 0xff
    buf[offset + 1] = (value >> 8) & 0xff
    buf[offset + 2] = (value >> 16) & 0xff
    buf[offset + 3] = (value >> 24) & 0xff
}

export function writeBigUInt64BE(buf: Uint8Array, value: bigint, offset: number): void {
    writeUInt32BE(buf, Number((value >> 32n) & 0xffffffffn), offset)
    writeUInt32BE(buf, Number(value & 0xffffffffn), offset + 4)
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    if (
        bytes.byteOffset === 0 &&
        bytes.byteLength === bytes.buffer.byteLength &&
        bytes.buffer instanceof ArrayBuffer
    ) {
        return bytes.buffer
    }
    return bytes.slice().buffer
}
