import {
    BINARY_20,
    BINARY_32,
    BINARY_8,
    DICTIONARY_0,
    DICTIONARY_TOKEN_MAPS,
    HEX_8,
    LIST_16,
    LIST_8,
    NIBBLE_8,
    SINGLE_BYTE_TOKEN_MAP
} from '@transport/binary/constants'
import type { BinaryNode } from '@transport/types'
import { TEXT_ENCODER } from '@util/bytes'

class ByteWriter {
    private buffer: Uint8Array
    private offset: number

    public constructor(initialCapacity = 256) {
        this.buffer = new Uint8Array(initialCapacity)
        this.offset = 0
    }

    public writeUint8(value: number): void {
        this.ensure(1)
        this.buffer[this.offset] = value & 0xff
        this.offset += 1
    }

    public writeUint16(value: number): void {
        this.ensure(2)
        this.buffer[this.offset] = (value >>> 8) & 0xff
        this.buffer[this.offset + 1] = value & 0xff
        this.offset += 2
    }

    public writeUint32(value: number): void {
        this.ensure(4)
        this.buffer[this.offset] = (value >>> 24) & 0xff
        this.buffer[this.offset + 1] = (value >>> 16) & 0xff
        this.buffer[this.offset + 2] = (value >>> 8) & 0xff
        this.buffer[this.offset + 3] = value & 0xff
        this.offset += 4
    }

    public writeBytes(value: Uint8Array): void {
        this.ensure(value.length)
        this.buffer.set(value, this.offset)
        this.offset += value.length
    }

    public toUint8Array(): Uint8Array {
        return this.buffer.subarray(0, this.offset)
    }

    private ensure(extra: number): void {
        const needed = this.offset + extra
        if (needed <= this.buffer.length) {
            return
        }
        let size = this.buffer.length
        while (size < needed) {
            size *= 2
        }
        const next = new Uint8Array(size)
        next.set(this.buffer)
        this.buffer = next
    }
}

function isNibbleString(value: string): boolean {
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i)
        const isDigit = code >= 48 && code <= 57
        const isSpecial = code === 45 || code === 46
        if (!isDigit && !isSpecial) {
            return false
        }
    }
    return value.length > 0
}

function isHexString(value: string): boolean {
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i)
        const isDigit = code >= 48 && code <= 57
        const isHex = code >= 65 && code <= 70
        if (!isDigit && !isHex) {
            return false
        }
    }
    return value.length > 0
}

function toNibble(value: string, index: number, packedType: number): number {
    const code = value.charCodeAt(index)
    if (code >= 48 && code <= 57) {
        return code - 48
    }
    if (packedType === NIBBLE_8) {
        if (code === 45) {
            return 10
        }
        if (code === 46) {
            return 11
        }
    }
    if (packedType === HEX_8 && code >= 65 && code <= 70) {
        return code - 55
    }
    throw new Error(`cannot nibble encode char code ${code}`)
}

function writePackedString(value: string, packedType: number, writer: ByteWriter): void {
    const odd = value.length % 2 === 1
    writer.writeUint8(packedType)
    let length = Math.ceil(value.length / 2)
    if (odd) {
        length |= 0x80
    }
    writer.writeUint8(length)

    for (let i = 0; i < value.length; i += 2) {
        const high = toNibble(value, i, packedType)
        let low = 0x0f
        if (i + 1 < value.length) {
            low = toNibble(value, i + 1, packedType)
        }
        writer.writeUint8((high << 4) | low)
    }
}

function writeBinaryLength(length: number, writer: ByteWriter): void {
    if (!Number.isSafeInteger(length) || length < 0) {
        throw new Error(`invalid binary length ${length}`)
    }
    if (length < 256) {
        writer.writeUint8(BINARY_8)
        writer.writeUint8(length)
        return
    }
    if (length < 1 << 20) {
        writer.writeUint8(BINARY_20)
        writer.writeUint8((length >>> 16) & 0xff)
        writer.writeUint8((length >>> 8) & 0xff)
        writer.writeUint8(length & 0xff)
        return
    }
    if (!(length < 0x1_0000_0000)) {
        throw new Error(`binary with length ${length} is too big for WAP protocol`)
    }
    writer.writeUint8(BINARY_32)
    writer.writeUint32(length)
}

function writeString(value: string, writer: ByteWriter): void {
    const singleToken = SINGLE_BYTE_TOKEN_MAP.get(value)
    if (singleToken !== undefined) {
        writer.writeUint8(singleToken)
        return
    }

    for (
        let dictionaryIndex = 0;
        dictionaryIndex < DICTIONARY_TOKEN_MAPS.length;
        dictionaryIndex += 1
    ) {
        const dictToken = DICTIONARY_TOKEN_MAPS[dictionaryIndex].get(value)
        if (dictToken !== undefined) {
            writer.writeUint8(DICTIONARY_0 + dictionaryIndex)
            writer.writeUint8(dictToken)
            return
        }
    }

    if (value.length < 128 && isNibbleString(value)) {
        writePackedString(value, NIBBLE_8, writer)
        return
    }
    if (value.length < 128 && isHexString(value)) {
        writePackedString(value, HEX_8, writer)
        return
    }

    const encoded = TEXT_ENCODER.encode(value)
    writeBinaryLength(encoded.length, writer)
    writer.writeBytes(encoded)
}

function writeListSize(size: number, writer: ByteWriter): void {
    if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(`invalid list size ${size}`)
    }
    if (size < 256) {
        writer.writeUint8(LIST_8)
        writer.writeUint8(size)
        return
    }
    if (!(size < 1 << 16)) {
        throw new Error(`list with size ${size} is too large for WAP protocol`)
    }
    writer.writeUint8(LIST_16)
    writer.writeUint16(size)
}

function writeNodeInternal(node: BinaryNode, writer: ByteWriter): void {
    let attrsLen = 0
    for (const key in node.attrs) {
        if (Object.prototype.hasOwnProperty.call(node.attrs, key)) {
            attrsLen += 1
        }
    }
    const hasContent = node.content !== null && node.content !== undefined
    const listSize = 1 + attrsLen * 2 + (hasContent ? 1 : 0)

    writeListSize(listSize, writer)
    writeString(node.tag, writer)

    for (const key in node.attrs) {
        if (!Object.prototype.hasOwnProperty.call(node.attrs, key)) {
            continue
        }
        writeString(key, writer)
        writeString(node.attrs[key], writer)
    }

    if (!hasContent) {
        return
    }

    const content = node.content
    if (typeof content === 'string') {
        const encoded = TEXT_ENCODER.encode(content)
        writeBinaryLength(encoded.length, writer)
        writer.writeBytes(encoded)
        return
    }
    if (content instanceof Uint8Array) {
        writeBinaryLength(content.length, writer)
        writer.writeBytes(content)
        return
    }

    writeListSize(content.length, writer)
    for (const child of content) {
        writeNodeInternal(child, writer)
    }
}

export function encodeBinaryNode(node: BinaryNode): Uint8Array {
    const writer = new ByteWriter()
    writeNodeInternal(node, writer)
    return writer.toUint8Array()
}

export function encodeBinaryNodeStanza(node: BinaryNode): Uint8Array {
    const encoded = encodeBinaryNode(node)
    const out = new Uint8Array(1 + encoded.length)
    out[0] = 0
    out.set(encoded, 1)
    return out
}
