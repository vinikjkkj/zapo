import { concatBytes, EMPTY_BYTES, TEXT_DECODER, TEXT_ENCODER } from '../bytes.js'
import { encodeProtoLengthDelimited, encodeProtoVarintField } from '../protobuf.js'

/**
 * Field numbers of the `wa.voip` app-data messages, read off the protobuf descriptors
 * compiled into the official client. Field 2 of `appDataMessage` is live transcription,
 * deliberately not modelled here.
 *
 * The emoji travels as the **UTF-8 glyph** in `reaction` field 2, not as an index into a
 * reaction set, and there is **no `reaction_state` field at all**.
 */
const APP_DATA_PAYLOADS_MESSAGES = 1
const APP_DATA_MESSAGE_REACTION_INFO = 1
const APP_DATA_MESSAGE_AR_EFFECT_INFO = 3
const REACTION_INFO_TRANSACTION_ID = 1
const REACTION_INFO_REACTION = 2
const AR_EFFECT_INFO_TRANSACTION_ID = 1
const AR_EFFECT_INFO_AR_EFFECT_ID = 2

const WIRE_TYPE_VARINT = 0
const WIRE_TYPE_FIXED64 = 1
const WIRE_TYPE_LENGTH_DELIMITED = 2
const WIRE_TYPE_FIXED32 = 5

const VARINT_CONTINUATION = 0x80
const VARINT_PAYLOAD_MASK = 0x7f
const VARINT_SHIFT = 7n

/**
 * Ceiling on the messages one app-data payload may carry: a local guard, not a protocol
 * constant - the official client bounds the same list at an unrecorded limit.
 */
const MAX_MESSAGES_PER_PAYLOAD = 32

/** One emoji reaction of one participant, as it travels in `reactionInfo`. */
export interface WaCallReaction {
    /** Dedup key of the retransmission burst that carries this reaction. */
    readonly transactionId: bigint
    /** The emoji itself, as a UTF-8 glyph. Never an index into a set. */
    readonly reaction: string
}

/** One AR effect attribution, which shares the reaction's envelope. */
export interface WaCallArEffect {
    readonly transactionId: bigint
    readonly arEffectId: string
}

/** Everything one `appDataMessage` may carry that this package understands. */
export interface WaAppDataItem {
    readonly reaction?: WaCallReaction
    readonly arEffect?: WaCallArEffect
}

/**
 * Result of reading one app-data RTP payload. `shape` reports which of the two nestings
 * matched, because the official client's receive path reads a list and its send path
 * writes a bare message: one inbound reaction settles which this package must emit.
 */
export interface WaAppDataPayload {
    readonly shape: 'payloads' | 'message'
    readonly items: readonly WaAppDataItem[]
}

interface VarintRead {
    readonly value: bigint
    readonly next: number
}

function readVarint(data: Uint8Array, offset: number): VarintRead {
    let value = 0n
    let shift = 0n
    let cursor = offset
    while (cursor < data.length) {
        const byte = data[cursor++]
        value |= BigInt(byte & VARINT_PAYLOAD_MASK) << shift
        if ((byte & VARINT_CONTINUATION) === 0) return { value, next: cursor }
        shift += VARINT_SHIFT
        if (shift > 63n) break
    }
    throw new Error('truncated protobuf varint')
}

interface ProtobufField {
    readonly fieldNumber: number
    readonly wireType: number
    readonly varint: bigint
    readonly bytes: Uint8Array
}

/**
 * Walks the fields of one protobuf message. Unknown fields are skipped rather than
 * rejected: an unmodelled message kind must not cost the reaction beside it.
 */
function* readFields(data: Uint8Array): Generator<ProtobufField> {
    let offset = 0
    while (offset < data.length) {
        const tag = readVarint(data, offset)
        offset = tag.next
        const fieldNumber = Number(tag.value >> 3n)
        const wireType = Number(tag.value & 0x7n)
        if (fieldNumber === 0) throw new Error('invalid protobuf field number 0')

        if (wireType === WIRE_TYPE_VARINT) {
            const read = readVarint(data, offset)
            offset = read.next
            yield { fieldNumber, wireType, varint: read.value, bytes: EMPTY_BYTES }
            continue
        }

        if (wireType === WIRE_TYPE_LENGTH_DELIMITED) {
            const length = readVarint(data, offset)
            const start = length.next
            const end = start + Number(length.value)
            if (end > data.length) throw new Error('truncated protobuf length-delimited field')
            offset = end
            yield { fieldNumber, wireType, varint: 0n, bytes: data.subarray(start, end) }
            continue
        }

        if (wireType === WIRE_TYPE_FIXED64) {
            offset += 8
        } else if (wireType === WIRE_TYPE_FIXED32) {
            offset += 4
        } else {
            throw new Error(`unsupported protobuf wire type ${wireType}`)
        }
        if (offset > data.length) throw new Error('truncated protobuf fixed-width field')
    }
}

/**
 * Serializes one emoji reaction into an app-data RTP payload, in the list nesting the
 * official receive path parses. No sender, recipient or routing mode: the relay routes app
 * data by the SSRC it arrives on, and routing fields belong to `dataChannelMessage`, a
 * different transport.
 */
export function encodeReactionPayload(reaction: WaCallReaction): Uint8Array {
    const reactionInfo = concatBytes([
        encodeProtoVarintField(REACTION_INFO_TRANSACTION_ID, reaction.transactionId),
        encodeProtoLengthDelimited(REACTION_INFO_REACTION, TEXT_ENCODER.encode(reaction.reaction))
    ])
    const message = encodeProtoLengthDelimited(APP_DATA_MESSAGE_REACTION_INFO, reactionInfo)
    return encodeProtoLengthDelimited(APP_DATA_PAYLOADS_MESSAGES, message)
}

function decodeReactionInfo(
    data: Uint8Array,
    requireTransactionId: boolean
): WaCallReaction | null {
    let transactionId: bigint | null = null
    let reaction: string | null = null

    for (const field of readFields(data)) {
        if (field.fieldNumber === REACTION_INFO_TRANSACTION_ID && field.wireType === 0) {
            transactionId = field.varint
        } else if (field.fieldNumber === REACTION_INFO_REACTION && field.wireType === 2) {
            reaction = TEXT_DECODER.decode(field.bytes)
        }
    }

    if (reaction === null) return null
    if (transactionId === null && requireTransactionId) return null
    return { transactionId: transactionId ?? 0n, reaction }
}

function decodeArEffectInfo(
    data: Uint8Array,
    requireTransactionId: boolean
): WaCallArEffect | null {
    let transactionId: bigint | null = null
    let arEffectId: string | null = null

    for (const field of readFields(data)) {
        if (field.fieldNumber === AR_EFFECT_INFO_TRANSACTION_ID && field.wireType === 0) {
            transactionId = field.varint
        } else if (field.fieldNumber === AR_EFFECT_INFO_AR_EFFECT_ID && field.wireType === 2) {
            arEffectId = TEXT_DECODER.decode(field.bytes)
        }
    }

    if (arEffectId === null) return null
    if (transactionId === null && requireTransactionId) return null
    return { transactionId: transactionId ?? 0n, arEffectId }
}

/**
 * Reads one `appDataMessage`. `strict` keeps the fallback reading of
 * {@link decodeAppDataPayload} from inventing a reaction: the two nestings overlap, so a
 * list holding an unmodelled message kind read as a bare message turns its inner bytes
 * into an emoji nobody sent. Demanding the transaction id, which every real sender fills,
 * separates them.
 */
function decodeAppDataMessage(data: Uint8Array, strict: boolean): WaAppDataItem | null {
    let reaction: WaCallReaction | null = null
    let arEffect: WaCallArEffect | null = null

    for (const field of readFields(data)) {
        if (field.wireType !== WIRE_TYPE_LENGTH_DELIMITED) continue
        if (field.fieldNumber === APP_DATA_MESSAGE_REACTION_INFO) {
            reaction = decodeReactionInfo(field.bytes, strict)
        } else if (field.fieldNumber === APP_DATA_MESSAGE_AR_EFFECT_INFO) {
            arEffect = decodeArEffectInfo(field.bytes, strict)
        }
    }

    if (reaction) return arEffect ? { reaction, arEffect } : { reaction }
    return arEffect ? { arEffect } : null
}

function decodeAsPayloads(data: Uint8Array): WaAppDataItem[] {
    const items: WaAppDataItem[] = []
    for (const field of readFields(data)) {
        if (field.fieldNumber !== APP_DATA_PAYLOADS_MESSAGES) continue
        if (field.wireType !== WIRE_TYPE_LENGTH_DELIMITED) continue
        if (items.length >= MAX_MESSAGES_PER_PAYLOAD) break
        const item = decodeAppDataMessage(field.bytes, false)
        if (item) items.push(item)
    }
    return items
}

/**
 * Reads the payload of one inbound app-data RTP packet. Returns `null` when the bytes
 * carry nothing this package models, including a well-formed payload holding only unread
 * kinds such as live transcription. The list nesting is tried first because the two shapes
 * are only told apart by which one yields a message.
 */
export function decodeAppDataPayload(data: Uint8Array): WaAppDataPayload | null {
    try {
        const nested = decodeAsPayloads(data)
        if (nested.length > 0) return { shape: 'payloads', items: nested }
    } catch {
        // A payload that is not a valid list is not thereby an invalid message.
    }

    try {
        const flat = decodeAppDataMessage(data, true)
        if (flat) return { shape: 'message', items: [flat] }
    } catch {
        return null
    }

    return null
}
