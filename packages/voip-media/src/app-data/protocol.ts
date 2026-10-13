import { concatBytes, TEXT_DECODER, TEXT_ENCODER } from '../bytes.js'
import {
    encodeProtoLengthDelimited,
    encodeProtoVarintField,
    PROTO_WIRE_LENGTH_DELIMITED,
    PROTO_WIRE_VARINT,
    readProtoFields
} from '../protobuf.js'

/**
 * Field numbers of the `wa.voip` app-data messages. Field 2 of `appDataMessage`, live
 * transcription, is not modelled. The emoji travels as a UTF-8 glyph, never an index.
 */
const APP_DATA_PAYLOADS_MESSAGES = 1
const APP_DATA_MESSAGE_REACTION_INFO = 1
const APP_DATA_MESSAGE_AR_EFFECT_INFO = 3
/** `reactionInfo` and `arEffectInfo` share one shape: a transaction id, then a string. */
const INFO_TRANSACTION_ID = 1
const INFO_TEXT = 2

/** Ceiling on the messages one app-data payload may carry: a local guard, not a protocol limit. */
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
interface WaAppDataItem {
    readonly reaction?: WaCallReaction
    readonly arEffect?: WaCallArEffect
}

/**
 * One app-data RTP payload read. `shape` is the nesting that matched: the official receive
 * path reads a list and its send path writes a bare message.
 */
export interface WaAppDataPayload {
    readonly shape: 'payloads' | 'message'
    readonly items: readonly WaAppDataItem[]
    /** Whether the local {@link MAX_MESSAGES_PER_PAYLOAD} guard cut the list short. */
    readonly truncated: boolean
}

/**
 * Serializes one emoji reaction into an app-data RTP payload, in the list nesting the
 * official receive path parses. No sender, recipient or routing mode: the relay routes app
 * data by the SSRC it arrives on, and routing fields belong to `dataChannelMessage`, a
 * different transport.
 */
export function encodeReactionPayload(reaction: WaCallReaction): Uint8Array {
    const reactionInfo = concatBytes([
        encodeProtoVarintField(INFO_TRANSACTION_ID, reaction.transactionId),
        encodeProtoLengthDelimited(INFO_TEXT, TEXT_ENCODER.encode(reaction.reaction))
    ])
    const message = encodeProtoLengthDelimited(APP_DATA_MESSAGE_REACTION_INFO, reactionInfo)
    return encodeProtoLengthDelimited(APP_DATA_PAYLOADS_MESSAGES, message)
}

/** The transaction id and string of a `reactionInfo` or `arEffectInfo`; null without the string. */
function decodeInfo(
    data: Uint8Array,
    requireTransactionId: boolean
): { readonly transactionId: bigint; readonly text: string } | null {
    let transactionId: bigint | null = null
    let text: string | null = null

    for (const field of readProtoFields(data)) {
        if (field.fieldNumber === INFO_TRANSACTION_ID && field.wireType === PROTO_WIRE_VARINT) {
            transactionId = field.varint
        } else if (
            field.fieldNumber === INFO_TEXT &&
            field.wireType === PROTO_WIRE_LENGTH_DELIMITED
        ) {
            text = TEXT_DECODER.decode(field.bytes)
        }
    }

    if (text === null) return null
    if (transactionId === null && requireTransactionId) return null
    return { transactionId: transactionId ?? 0n, text }
}

/**
 * Reads one `appDataMessage`. `strict` demands the transaction id every real sender fills, so
 * the bare-message fallback does not read a list's inner bytes as an emoji nobody sent.
 */
function decodeAppDataMessage(data: Uint8Array, strict: boolean): WaAppDataItem | null {
    let reaction: WaCallReaction | null = null
    let arEffect: WaCallArEffect | null = null

    for (const field of readProtoFields(data)) {
        if (field.wireType !== PROTO_WIRE_LENGTH_DELIMITED) continue
        if (field.fieldNumber === APP_DATA_MESSAGE_REACTION_INFO) {
            const info = decodeInfo(field.bytes, strict)
            reaction = info && { transactionId: info.transactionId, reaction: info.text }
        } else if (field.fieldNumber === APP_DATA_MESSAGE_AR_EFFECT_INFO) {
            const info = decodeInfo(field.bytes, strict)
            arEffect = info && { transactionId: info.transactionId, arEffectId: info.text }
        }
    }

    if (reaction) return arEffect ? { reaction, arEffect } : { reaction }
    return arEffect ? { arEffect } : null
}

function decodeAsPayloads(data: Uint8Array): { items: WaAppDataItem[]; truncated: boolean } {
    const items: WaAppDataItem[] = []
    let truncated = false
    for (const field of readProtoFields(data)) {
        if (field.fieldNumber !== APP_DATA_PAYLOADS_MESSAGES) continue
        if (field.wireType !== PROTO_WIRE_LENGTH_DELIMITED) continue
        if (items.length >= MAX_MESSAGES_PER_PAYLOAD) {
            truncated = true
            break
        }
        const item = decodeAppDataMessage(field.bytes, false)
        if (item) items.push(item)
    }
    return { items, truncated }
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
        if (nested.items.length > 0) {
            return { shape: 'payloads', items: nested.items, truncated: nested.truncated }
        }
    } catch {
        // A payload that is not a valid list is not thereby an invalid message.
    }

    try {
        const flat = decodeAppDataMessage(data, true)
        if (flat) return { shape: 'message', items: [flat], truncated: false }
    } catch {
        return null
    }

    return null
}
