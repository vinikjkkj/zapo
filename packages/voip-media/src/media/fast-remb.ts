/**
 * Id of the RTP header extension element that carries the receive bandwidth estimate inside
 * video RTP, as the official client sends it. Must stay off {3, 5, 6, 9}, the other video ids.
 */
export const WA_FAST_REMB_EXTENSION_ID = 13

/**
 * Presence bitmap opening the content: bit 0 is the estimate. The client also sets bit 3, the
 * receiver capacity, which is per-session state and is left out.
 */
const FAST_REMB_PRESENCE_BITMAP = 0x01

/** The estimate is a plain big-endian uint24 in bits per second, saturating instead of wrapping. */
const MAX_UINT24 = 0xffffff

/** Content bytes: the bitmap and the uint24 estimate. */
const FAST_REMB_PAYLOAD_LENGTH = 4

/** The whole element: the id/len byte plus the content. */
export const WA_FAST_REMB_ELEMENT_LENGTH = 1 + FAST_REMB_PAYLOAD_LENGTH

/**
 * Writes the one-byte RFC 8285 element announcing `bitsPerSecond` as the receive estimate into
 * `target` at `offset`, and returns its length. The peer takes it as its estimator's ceiling.
 */
export function writeFastRembExtension(
    target: Uint8Array,
    offset: number,
    bitsPerSecond: number
): number {
    const requested = bitsPerSecond > 0 ? Math.floor(bitsPerSecond) : 0
    const value = requested > MAX_UINT24 ? MAX_UINT24 : requested
    target[offset] = (WA_FAST_REMB_EXTENSION_ID << 4) | (FAST_REMB_PAYLOAD_LENGTH - 1)
    target[offset + 1] = FAST_REMB_PRESENCE_BITMAP
    target[offset + 2] = (value >>> 16) & 0xff
    target[offset + 3] = (value >>> 8) & 0xff
    target[offset + 4] = value & 0xff
    return WA_FAST_REMB_ELEMENT_LENGTH
}
