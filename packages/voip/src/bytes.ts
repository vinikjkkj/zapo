import {
    base64ToBytes,
    bytesToBase64,
    bytesToHex,
    TEXT_DECODER,
    toBytesView
} from 'zapo-js/util'

export { bytesToBase64, bytesToHex, base64ToBytes, TEXT_DECODER, toBytesView }

export const EMPTY_BYTES = new Uint8Array(0)

export const TEXT_ENCODER = new TextEncoder()

export function concatBytes(arrays: Uint8Array[]): Uint8Array {
    let totalLength = 0
    for (const arr of arrays) totalLength += arr.length
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of arrays) {
        result.set(arr, offset)
        offset += arr.length
    }
    return result
}

export function readUInt16BE(buf: Uint8Array, offset: number): number {
    return (buf[offset] << 8) | buf[offset + 1]
}

export function readUInt32BE(buf: Uint8Array, offset: number): number {
    return (
        ((buf[offset] << 24) |
            (buf[offset + 1] << 16) |
            (buf[offset + 2] << 8) |
            buf[offset + 3]) >>>
        0
    )
}

export function readUInt32LE(buf: Uint8Array, offset: number): number {
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
    buf[offset] = (value >> 8) & 0xff
    buf[offset + 1] = value & 0xff
}

export function writeUInt32BE(buf: Uint8Array, value: number, offset: number): void {
    buf[offset] = (value >> 24) & 0xff
    buf[offset + 1] = (value >> 16) & 0xff
    buf[offset + 2] = (value >> 8) & 0xff
    buf[offset + 3] = value & 0xff
}

export function writeUInt32LE(buf: Uint8Array, value: number, offset: number): void {
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

export function encodeAscii(text: string): Uint8Array {
    return TEXT_ENCODER.encode(text)
}

export function decodeUtf8(bytes: Uint8Array): string {
    return TEXT_DECODER.decode(bytes)
}
