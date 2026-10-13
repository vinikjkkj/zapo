import { concatBytes } from '../bytes.js'
import { encodeProtoLengthDelimited, encodeProtoVarintField } from '../protobuf.js'

/** Every subscription field is a `uint32`; `>>> 0` keeps the coercion this file always did. */
function encodeProtoUint32Field(fieldNumber: number, value: number): Uint8Array {
    return encodeProtoVarintField(fieldNumber, BigInt(value >>> 0))
}

export function buildSenderSubscriptions(ssrc: number): Uint8Array {
    const inner = concatBytes([
        encodeProtoUint32Field(3, ssrc),
        encodeProtoUint32Field(5, 0),
        encodeProtoUint32Field(6, 0)
    ])

    return encodeProtoLengthDelimited(1, inner)
}

/** One stream this side sends: its layer and its SSRCs in payload order (media, FEC, NACK). */
export interface StreamLayerSsrcs {
    readonly layer: number
    readonly ssrcs: readonly number[]
}

/** Field 2 of a descriptor entry, read off the SSRC's position in its stream. */
const STREAM_PAYLOAD_TYPE_BY_POSITION = [0, 1, 2] as const

/** The app-data layer has one stream, declared under payload type 4 rather than by position. */
const STREAM_LAYER_APP_DATA = 5
const APP_DATA_PAYLOAD_TYPES = [4] as const

/**
 * Builds the self-only `0x4024` stream descriptor: one `{1: layer, 2: payload type, 3: ssrc}`
 * entry per SSRC, fields at their default omitted and field 4 never written. A zero SSRC drops
 * its entry without shifting the rest, and positions past NACK are dropped (past the first on
 * the app-data layer).
 */
export function buildStreamDescriptor(layers: readonly StreamLayerSsrcs[]): Uint8Array {
    const entries: Uint8Array[] = []

    for (const { layer, ssrcs } of layers) {
        const payloadTypes =
            layer === STREAM_LAYER_APP_DATA
                ? APP_DATA_PAYLOAD_TYPES
                : STREAM_PAYLOAD_TYPE_BY_POSITION
        const count = Math.min(ssrcs.length, payloadTypes.length)
        for (let position = 0; position < count; position++) {
            const ssrc = ssrcs[position]
            if (!ssrc) continue
            const payloadType = payloadTypes[position]
            const fields: Uint8Array[] = []
            if (layer !== 0) fields.push(encodeProtoUint32Field(1, layer))
            if (payloadType !== 0) fields.push(encodeProtoUint32Field(2, payloadType))
            fields.push(encodeProtoUint32Field(3, ssrc))
            entries.push(encodeProtoLengthDelimited(1, concatBytes(fields)))
        }
    }

    return concatBytes(entries)
}

/** One participant whose video this side asks the relay for, at a `VideoQuality` value. */
export interface RxVideoSubscription {
    readonly pid: number
    readonly quality: number
}

/**
 * Builds the `0x4021` `RxSubscriptions`: one field-2 `{1: pid, 2: quality}` entry per
 * participant, fields at their default omitted. Field 1 (`vid_rx_pids`) is never written.
 */
export function buildRxSubscriptions(infos: readonly RxVideoSubscription[]): Uint8Array {
    const entries: Uint8Array[] = []
    for (const { pid, quality } of infos) {
        const fields: Uint8Array[] = []
        if (pid !== 0) fields.push(encodeProtoUint32Field(1, pid))
        if (quality !== 0) fields.push(encodeProtoUint32Field(2, quality))
        entries.push(encodeProtoLengthDelimited(2, concatBytes(fields)))
    }
    return concatBytes(entries)
}

/** The 1:1 `0x4024`: every self and peer SSRC under its participant id, payload type 1. */
export function buildSSRCSubscriptionList(
    selfSsrcs: number[],
    peerSsrcs: number[],
    selfPid: number,
    peerPid: number
): Uint8Array {
    const entries: Uint8Array[] = []

    for (const ssrc of selfSsrcs) {
        if (ssrc === 0) continue
        const inner = concatBytes([
            encodeProtoUint32Field(1, selfPid),
            encodeProtoUint32Field(2, 1),
            encodeProtoUint32Field(3, ssrc)
        ])
        entries.push(encodeProtoLengthDelimited(1, inner))
    }

    for (const peerSsrc of peerSsrcs) {
        if (peerSsrc === 0) continue
        const inner = concatBytes([
            encodeProtoUint32Field(1, peerPid),
            encodeProtoUint32Field(2, 1),
            encodeProtoUint32Field(3, peerSsrc)
        ])
        entries.push(encodeProtoLengthDelimited(1, inner))
    }

    return concatBytes(entries)
}
