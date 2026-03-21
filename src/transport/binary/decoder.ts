import { promisify } from 'node:util'
import { inflateRaw, unzip } from 'node:zlib'

import { WA_DEFAULTS } from '@protocol/constants'
import {
    BINARY_20,
    BINARY_32,
    BINARY_8,
    DICTIONARY_0,
    DICTIONARY_3,
    HEX_8,
    HEX_ALPHABET,
    JID_FB,
    JID_INTEROP,
    JID_PAIR,
    JID_U,
    LIST_16,
    LIST_8,
    LIST_EMPTY,
    NIBBLE_8,
    NIBBLE_ALPHABET,
    STREAM_END
} from '@transport/binary/constants'
import { DICTIONARIES, SINGLE_BYTE_TOKENS } from '@transport/binary/tokens'
import type { BinaryNode } from '@transport/types'
import { TEXT_DECODER, TEXT_ENCODER, toBytesView } from '@util/bytes'

const unzipAsync = promisify(unzip)
const inflateRawAsync = promisify(inflateRaw)
const JID_U_DOMAIN_TYPE_LID = 0x01
const JID_U_DOMAIN_TYPE_HOSTED_LID = 0x81
const JID_U_DOMAIN_TYPE_HOSTED_MASK = 0x80
const JID_U_DOMAIN_TYPE_LID_MASK = 0x01
const JID_U_DOMAIN_LID = 'lid'
const JID_U_DOMAIN_HOSTED = 'hosted'
const JID_U_DOMAIN_HOSTED_LID = 'hosted.lid'

class ByteReader {
    private readonly data: Uint8Array
    private offset: number

    public constructor(data: Uint8Array) {
        this.data = data
        this.offset = 0
    }

    public readUint8(): number {
        this.ensure(1)
        const value = this.data[this.offset]
        this.offset += 1
        return value
    }

    public readUint16(): number {
        this.ensure(2)
        const value = (this.data[this.offset] << 8) | this.data[this.offset + 1]
        this.offset += 2
        return value
    }

    public readUint32(): number {
        this.ensure(4)
        const value =
            (this.data[this.offset] << 24) |
            (this.data[this.offset + 1] << 16) |
            (this.data[this.offset + 2] << 8) |
            this.data[this.offset + 3]
        this.offset += 4
        return value >>> 0
    }

    public readBytes(length: number): Uint8Array {
        this.ensure(length)
        const value = this.data.subarray(this.offset, this.offset + length)
        this.offset += length
        return value
    }

    public getRemaining(): number {
        return this.data.length - this.offset
    }

    private ensure(length: number): void {
        if (this.offset + length > this.data.length) {
            throw new Error('unexpected end of binary node payload')
        }
    }
}

function parsePacked(reader: ByteReader, alphabet: readonly string[]): string {
    const lengthByte = reader.readUint8()
    const odd = (lengthByte & 0x80) !== 0
    const byteCount = lengthByte & 0x7f
    const outLength = byteCount * 2 - (odd ? 1 : 0)

    const chars = new Array<string>(outLength)
    let outIndex = 0

    for (let i = 0; i < byteCount; i += 1) {
        const packed = reader.readUint8()
        const high = (packed >>> 4) & 0x0f
        const low = packed & 0x0f

        if (outIndex < outLength) {
            chars[outIndex] = alphabet[high]
            outIndex += 1
        }
        if (outIndex < outLength) {
            chars[outIndex] = alphabet[low]
            outIndex += 1
        }
    }

    return chars.join('')
}

function readBinary(reader: ByteReader, token: number): Uint8Array {
    if (token === BINARY_8) {
        return reader.readBytes(reader.readUint8())
    }
    if (token === BINARY_20) {
        const length =
            ((reader.readUint8() & 0x0f) << 16) | (reader.readUint8() << 8) | reader.readUint8()
        return reader.readBytes(length)
    }
    if (token === BINARY_32) {
        return reader.readBytes(reader.readUint32())
    }
    throw new Error(`invalid binary token ${token}`)
}

function decodeTokenString(token: number, reader: ByteReader): string {
    if (token > 0 && token <= SINGLE_BYTE_TOKENS.length) {
        return SINGLE_BYTE_TOKENS[token - 1]
    }

    if (token >= DICTIONARY_0 && token <= DICTIONARY_3) {
        const dictionaryIndex = token - DICTIONARY_0
        const index = reader.readUint8()
        const dictionary = DICTIONARIES[dictionaryIndex]
        if (!dictionary || index >= dictionary.length) {
            throw new Error(`invalid dictionary token ${dictionaryIndex}:${index}`)
        }
        return dictionary[index]
    }

    if (token === NIBBLE_8) {
        return parsePacked(reader, NIBBLE_ALPHABET)
    }

    if (token === HEX_8) {
        return parsePacked(reader, HEX_ALPHABET)
    }

    if (token === BINARY_8 || token === BINARY_20 || token === BINARY_32) {
        return TEXT_DECODER.decode(readBinary(reader, token))
    }

    throw new Error(`unsupported string token ${token}`)
}

function decodeJidPair(reader: ByteReader): string {
    const userToken = reader.readUint8()
    const user = userToken === LIST_EMPTY ? '' : decodeTokenString(userToken, reader)
    const server = decodeTokenString(reader.readUint8(), reader)
    if (!user) {
        return server
    }
    return `${user}@${server}`
}

function decodeJidU(reader: ByteReader): string {
    const domainType = reader.readUint8()
    const device = reader.readUint8()
    const user = decodeTokenString(reader.readUint8(), reader)

    let domain: string = WA_DEFAULTS.HOST_DOMAIN
    if (domainType === JID_U_DOMAIN_TYPE_LID) {
        domain = JID_U_DOMAIN_LID
    } else if (domainType === JID_U_DOMAIN_TYPE_HOSTED_LID) {
        domain = JID_U_DOMAIN_HOSTED_LID
    } else if (
        (domainType & JID_U_DOMAIN_TYPE_HOSTED_MASK) !== 0 &&
        (domainType & JID_U_DOMAIN_TYPE_LID_MASK) === 0
    ) {
        domain = JID_U_DOMAIN_HOSTED
    }

    if (device > 0) {
        return `${user}:${device}@${domain}`
    }
    return `${user}@${domain}`
}

function decodeJidInterop(reader: ByteReader): string {
    const user = decodeTokenString(reader.readUint8(), reader)
    const device = reader.readUint16()
    const integrator = reader.readUint16()
    decodeTokenString(reader.readUint8(), reader)
    return `${integrator}-${user}:${device}@interop`
}

function decodeJidFb(reader: ByteReader): string {
    const user = decodeTokenString(reader.readUint8(), reader)
    const device = reader.readUint16()
    decodeTokenString(reader.readUint8(), reader)
    return `${user}:${device}@msgr`
}

function decodeValue(
    reader: ByteReader,
    token: number,
    forAttr: boolean
): string | Uint8Array | null {
    if (token === LIST_EMPTY) {
        return null
    }

    if (token === JID_PAIR) {
        return decodeJidPair(reader)
    }
    if (token === JID_U) {
        return decodeJidU(reader)
    }
    if (token === JID_INTEROP) {
        return decodeJidInterop(reader)
    }
    if (token === JID_FB) {
        return decodeJidFb(reader)
    }

    if (token === BINARY_8 || token === BINARY_20 || token === BINARY_32) {
        const binary = readBinary(reader, token)
        return forAttr ? TEXT_DECODER.decode(binary) : binary
    }

    const value = decodeTokenString(token, reader)
    return value
}

function decodeNodeInternal(reader: ByteReader): BinaryNode {
    const listType = reader.readUint8()
    let listSize = 0

    if (listType === LIST_8) {
        listSize = reader.readUint8()
    } else if (listType === LIST_16) {
        listSize = reader.readUint16()
    } else {
        throw new Error(`invalid node list type ${listType}`)
    }

    if (listSize === 0) {
        throw new Error('invalid binary node: empty list')
    }

    const tagToken = reader.readUint8()
    const tagValue = decodeValue(reader, tagToken, true)
    if (typeof tagValue !== 'string' || tagValue.length === 0) {
        throw new Error('invalid binary node tag')
    }

    const attrs: Record<string, string> = {}
    let remaining = listSize - 1

    while (remaining > 1) {
        const keyToken = reader.readUint8()
        const key = decodeValue(reader, keyToken, true)
        const valueToken = reader.readUint8()
        const value = decodeValue(reader, valueToken, true)
        if (typeof key !== 'string' || typeof value !== 'string') {
            throw new Error('invalid binary node attribute entry')
        }
        attrs[key] = value
        remaining -= 2
    }

    let content: BinaryNode['content']
    if (remaining === 1) {
        const contentToken = reader.readUint8()
        if (contentToken === LIST_EMPTY) {
            content = undefined
        } else if (contentToken === LIST_8 || contentToken === LIST_16) {
            const childrenCount = contentToken === LIST_8 ? reader.readUint8() : reader.readUint16()
            const children: BinaryNode[] = new Array(childrenCount)
            for (let i = 0; i < childrenCount; i += 1) {
                children[i] = decodeNodeInternal(reader)
            }
            content = children
        } else {
            const value = decodeValue(reader, contentToken, false)
            if (value === null) {
                content = undefined
            } else if (typeof value === 'string') {
                content = TEXT_ENCODER.encode(value)
            } else {
                content = value
            }
        }
    }

    const node =
        content === null || content === undefined
            ? { tag: tagValue, attrs }
            : { tag: tagValue, attrs, content }
    return node
}

export function decodeBinaryNode(data: Uint8Array): BinaryNode {
    const reader = new ByteReader(data)
    return decodeNodeInternal(reader)
}

async function inflateCompressedStanza(data: Uint8Array): Promise<Uint8Array> {
    try {
        return toBytesView(await unzipAsync(data))
    } catch {
        try {
            return toBytesView(await inflateRawAsync(data))
        } catch (rawError) {
            const message = rawError instanceof Error ? rawError.message : String(rawError)
            throw new Error(`failed to inflate compressed stanza: ${message}`)
        }
    }
}

export async function decodeBinaryNodeStanza(stanza: Uint8Array): Promise<BinaryNode> {
    const reader = new ByteReader(stanza)
    const flag = reader.readUint8()
    if (flag === STREAM_END && reader.getRemaining() === 0) {
        throw new Error('stream end stanza is not a binary node')
    }
    let nodeBytes = reader.readBytes(reader.getRemaining())
    if ((flag & 0x02) !== 0) {
        nodeBytes = await inflateCompressedStanza(nodeBytes)
    }
    return decodeBinaryNode(nodeBytes)
}
