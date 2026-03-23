import type { WaRetryReplayPayload } from '@retry/types'
import { concatBytes, TEXT_DECODER, TEXT_ENCODER } from '@util/bytes'

const RETRY_PAYLOAD_CODEC_MAGIC = 0x5a
const RETRY_PAYLOAD_CODEC_VERSION = 1
const RETRY_PAYLOAD_MODE = Object.freeze({
    plaintext: 1,
    encrypted: 2,
    opaque_node: 3
} as const)
const RETRY_PAYLOAD_ENC_TYPE = Object.freeze({
    msg: 1,
    pkmsg: 2,
    skmsg: 3
} as const)

export function encodeRetryReplayPayload(payload: WaRetryReplayPayload): Uint8Array {
    const chunks: Uint8Array[] = [
        Uint8Array.from([RETRY_PAYLOAD_CODEC_MAGIC, RETRY_PAYLOAD_CODEC_VERSION])
    ]
    if (payload.mode === 'plaintext') {
        chunks.push(Uint8Array.from([RETRY_PAYLOAD_MODE.plaintext]))
        pushStringField(chunks, payload.to, 'to')
        pushStringField(chunks, payload.type, 'type')
        pushBytesField(chunks, payload.plaintext, 'plaintext')
        return concatBytes(chunks)
    }
    if (payload.mode === 'encrypted') {
        chunks.push(Uint8Array.from([RETRY_PAYLOAD_MODE.encrypted]))
        pushStringField(chunks, payload.to, 'to')
        pushStringField(chunks, payload.type, 'type')
        chunks.push(Uint8Array.from([encodeEncryptedType(payload.encType)]))
        const hasParticipant = payload.participant !== undefined
        chunks.push(Uint8Array.from([hasParticipant ? 1 : 0]))
        if (hasParticipant) {
            pushStringField(chunks, payload.participant, 'participant')
        }
        pushBytesField(chunks, payload.ciphertext, 'ciphertext')
        return concatBytes(chunks)
    }
    chunks.push(Uint8Array.from([RETRY_PAYLOAD_MODE.opaque_node]))
    pushBytesField(chunks, payload.node, 'node')
    return concatBytes(chunks)
}

export function decodeRetryReplayPayload(raw: Uint8Array): WaRetryReplayPayload {
    if (raw.byteLength < 3) {
        throw new Error('invalid retry replay payload: unsupported codec version')
    }
    if (raw[0] !== RETRY_PAYLOAD_CODEC_MAGIC || raw[1] !== RETRY_PAYLOAD_CODEC_VERSION) {
        throw new Error('invalid retry replay payload: unsupported codec version')
    }
    return decodeCompactRetryReplayPayload(raw)
}

function encodeEncryptedType(encType: 'msg' | 'pkmsg' | 'skmsg'): number {
    if (encType === 'msg') {
        return RETRY_PAYLOAD_ENC_TYPE.msg
    }
    if (encType === 'pkmsg') {
        return RETRY_PAYLOAD_ENC_TYPE.pkmsg
    }
    return RETRY_PAYLOAD_ENC_TYPE.skmsg
}

function decodeEncryptedType(value: number): 'msg' | 'pkmsg' | 'skmsg' {
    if (value === RETRY_PAYLOAD_ENC_TYPE.msg) {
        return 'msg'
    }
    if (value === RETRY_PAYLOAD_ENC_TYPE.pkmsg) {
        return 'pkmsg'
    }
    if (value === RETRY_PAYLOAD_ENC_TYPE.skmsg) {
        return 'skmsg'
    }
    throw new Error(`invalid retry encrypted encType code: ${value}`)
}

function pushUint16(chunks: Uint8Array[], value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
        throw new Error(`invalid retry replay payload ${field} length`)
    }
    chunks.push(Uint8Array.from([value >>> 8, value & 0xff]))
}

function pushUint32(chunks: Uint8Array[], value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
        throw new Error(`invalid retry replay payload ${field} length`)
    }
    chunks.push(
        Uint8Array.from([
            (value >>> 24) & 0xff,
            (value >>> 16) & 0xff,
            (value >>> 8) & 0xff,
            value & 0xff
        ])
    )
}

function pushStringField(chunks: Uint8Array[], value: string, field: string): void {
    const encoded = TEXT_ENCODER.encode(value)
    pushUint16(chunks, encoded.byteLength, field)
    chunks.push(encoded)
}

function pushBytesField(chunks: Uint8Array[], value: Uint8Array, field: string): void {
    pushUint32(chunks, value.byteLength, field)
    chunks.push(value)
}

function readUint8(raw: Uint8Array, offset: number, field: string): [number, number] {
    if (offset >= raw.byteLength) {
        throw new Error(`invalid retry replay payload field: ${field}`)
    }
    return [raw[offset], offset + 1]
}

function readUint16(raw: Uint8Array, offset: number, field: string): [number, number] {
    if (offset + 2 > raw.byteLength) {
        throw new Error(`invalid retry replay payload field: ${field}`)
    }
    return [((raw[offset] << 8) | raw[offset + 1]) >>> 0, offset + 2]
}

function readUint32(raw: Uint8Array, offset: number, field: string): [number, number] {
    if (offset + 4 > raw.byteLength) {
        throw new Error(`invalid retry replay payload field: ${field}`)
    }
    return [
        ((raw[offset] << 24) |
            (raw[offset + 1] << 16) |
            (raw[offset + 2] << 8) |
            raw[offset + 3]) >>>
            0,
        offset + 4
    ]
}

function readString(raw: Uint8Array, offset: number, field: string): [string, number] {
    const [byteLength, nextOffset] = readUint16(raw, offset, `${field}.length`)
    const endOffset = nextOffset + byteLength
    if (endOffset > raw.byteLength) {
        throw new Error(`invalid retry replay payload field: ${field}`)
    }
    return [TEXT_DECODER.decode(raw.subarray(nextOffset, endOffset)), endOffset]
}

function readBytes(raw: Uint8Array, offset: number, field: string): [Uint8Array, number] {
    const [byteLength, nextOffset] = readUint32(raw, offset, `${field}.length`)
    const endOffset = nextOffset + byteLength
    if (endOffset > raw.byteLength) {
        throw new Error(`invalid retry replay payload field: ${field}`)
    }
    return [raw.subarray(nextOffset, endOffset), endOffset]
}

function assertNoTrailingData(raw: Uint8Array, offset: number): void {
    if (offset !== raw.byteLength) {
        throw new Error('invalid retry replay payload: trailing data')
    }
}

function decodeCompactRetryReplayPayload(raw: Uint8Array): WaRetryReplayPayload {
    let offset = 0
    let magic = 0
    let version = 0
    let mode = 0
    ;[magic, offset] = readUint8(raw, offset, 'magic')
    ;[version, offset] = readUint8(raw, offset, 'version')
    ;[mode, offset] = readUint8(raw, offset, 'mode')
    if (magic !== RETRY_PAYLOAD_CODEC_MAGIC || version !== RETRY_PAYLOAD_CODEC_VERSION) {
        throw new Error('invalid retry replay payload: unsupported codec version')
    }
    if (mode === RETRY_PAYLOAD_MODE.plaintext) {
        let to = ''
        let type = ''
        let plaintext = raw
        ;[to, offset] = readString(raw, offset, 'to')
        ;[type, offset] = readString(raw, offset, 'type')
        ;[plaintext, offset] = readBytes(raw, offset, 'plaintext')
        assertNoTrailingData(raw, offset)
        return {
            mode: 'plaintext',
            to,
            type,
            plaintext
        }
    }
    if (mode === RETRY_PAYLOAD_MODE.encrypted) {
        let to = ''
        let type = ''
        let encTypeCode = 0
        let hasParticipant = 0
        let participant: string | undefined
        let ciphertext = raw
        ;[to, offset] = readString(raw, offset, 'to')
        ;[type, offset] = readString(raw, offset, 'type')
        ;[encTypeCode, offset] = readUint8(raw, offset, 'encType')
        ;[hasParticipant, offset] = readUint8(raw, offset, 'hasParticipant')
        if (hasParticipant !== 0 && hasParticipant !== 1) {
            throw new Error('invalid retry replay payload field: hasParticipant')
        }
        if (hasParticipant === 1) {
            ;[participant, offset] = readString(raw, offset, 'participant')
        }
        ;[ciphertext, offset] = readBytes(raw, offset, 'ciphertext')
        assertNoTrailingData(raw, offset)
        return {
            mode: 'encrypted',
            to,
            type,
            encType: decodeEncryptedType(encTypeCode),
            participant,
            ciphertext
        }
    }
    if (mode === RETRY_PAYLOAD_MODE.opaque_node) {
        let node = raw
        ;[node, offset] = readBytes(raw, offset, 'node')
        assertNoTrailingData(raw, offset)
        return {
            mode: 'opaque_node',
            node
        }
    }
    throw new Error(`invalid retry replay payload mode: ${mode}`)
}
