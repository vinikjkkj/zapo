/** Byte helpers of the media plane, kept here because the package runs without `zapo-js`. */

export const TEXT_ENCODER = new TextEncoder()
export const TEXT_DECODER = new TextDecoder()
export const EMPTY_BYTES = Object.freeze(new Uint8Array(0))

const HEX_TABLE = /* @__PURE__ */ (() => {
    const table = new Array<string>(256)
    for (let i = 0; i < 256; i += 1) {
        table[i] = i.toString(16).padStart(2, '0')
    }
    return table
})()

export function bytesToHex(value: Uint8Array): string {
    let out = ''
    for (let i = 0; i < value.length; i += 1) {
        out += HEX_TABLE[value[i]]
    }
    return out
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
    let total = 0
    for (let i = 0; i < parts.length; i += 1) {
        total += parts[i].length
    }
    const out = new Uint8Array(total)
    let offset = 0
    for (let i = 0; i < parts.length; i += 1) {
        out.set(parts[i], offset)
        offset += parts[i].length
    }
    return out
}

/** A plain `Uint8Array` over the same memory, whatever view or buffer came in. */
export function toBytesView(value: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
    if (value instanceof Uint8Array) {
        return value.constructor === Uint8Array
            ? value
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value)
    }
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
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

export function writeBigUInt64BE(buf: Uint8Array, value: bigint, offset: number): void {
    writeUInt32BE(buf, Number((value >> 32n) & 0xffffffffn), offset)
    writeUInt32BE(buf, Number(value & 0xffffffffn), offset + 4)
}
