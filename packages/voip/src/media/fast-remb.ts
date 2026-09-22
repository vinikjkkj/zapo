/**
 * Id of the RTP header extension that carries the receive bandwidth estimate
 * inside video RTP.
 *
 * It came from observation, and it is the only part of this extension that did:
 * in a capture of 176 video packets the official client sent to this endpoint,
 * 35 carried an element of id 13, always with 9 bytes of content, and only on
 * video, the inbound audio never brought it. The id of an RFC 8285 extension is
 * dynamic, chosen by whoever offers the session and announced off the wire, so
 * reading it off the traffic was the only route, and that is why it sits
 * isolated here: if WhatsApp renumbers, changing the id is changing this line.
 *
 * The range is 1 to 14, because 0 is reserved and 15 marks the end of the list
 * in the one-byte form. A replacement has to stay outside {3, 5, 6, 9}, the ids
 * this session's video extension already occupies: a repeated id is not invalid
 * in the format, but it hands the peer two elements under the same name and
 * lets it pick which one counts.
 */
export const WA_FAST_REMB_EXTENSION_ID = 13

/**
 * How the bandwidth estimate is packed inside the content.
 *
 * `byteLength` travels together with `write` because the length reaches as far
 * as the id/len byte of the element: changing the packing changes the content
 * length, and the two cannot fall out of step.
 */
export interface FastRembBitrateEncoding {
    /** Bytes {@link FastRembBitrateEncoding.write} writes, always the same. */
    readonly byteLength: number
    /** Writes `bitsPerSecond` into `target` from `offset`, allocating nothing. */
    readonly write: (target: Uint8Array, offset: number, bitsPerSecond: number) => void
}

/**
 * Bits per second as a plain 24-bit big-endian integer, with no exponent and no
 * mantissa: `b1 << 16 | b2 << 8 | b3`.
 *
 * Confirmed in the client parser, which is the authoritative decoder of the
 * format. Two plausible readings were discarded there: the 6-plus-18 pair of
 * the RFC REMB, which occupies the same 24 bits, and the 4-byte uint. The
 * capture distinguished none of the three, because in the four samples the
 * exponent would come out zero and the three packings produce the same bytes
 * below 2^18, and the peer's estimator was stuck at 149,564, below that.
 *
 * It saturates instead of wrapping: a ceiling that overflows becomes a tiny
 * ceiling and would pin the sender exactly like the defect this extension
 * removes.
 */
const MAX_UINT24 = 0xffffff

export const WA_FAST_REMB_BITRATE_ENCODING: FastRembBitrateEncoding = {
    byteLength: 3,
    write: (target, offset, bitsPerSecond) => {
        const requested = bitsPerSecond > 0 ? Math.floor(bitsPerSecond) : 0
        const value = requested > MAX_UINT24 ? MAX_UINT24 : requested
        target[offset] = (value >>> 16) & 0xff
        target[offset + 1] = (value >>> 8) & 0xff
        target[offset + 2] = value & 0xff
    }
}

/**
 * Presence bitmap that opens the content: one bit per field, and the present
 * fields following in the order of the bits. Bit 0 is the receive bandwidth
 * estimate, bit 3 is the receiver capacity.
 *
 * **We emit `0x01`, the estimate alone, and not the `0x09` the client sends.**
 * The parser treats each bit independently, conditioned only on length: bit 0
 * requires content of 4 bytes or more, bit 3 requires 9. An element with `0x01`
 * and the estimate is accepted.
 *
 * Bit 3 is left out on purpose. Its field is per-session state, the receiver
 * capacity, around 800 kbps in the capture, and not a protocol constant, so
 * reproducing the 802,577 that came on the wire would be announcing the peer's
 * capacity as if it were ours. The flags byte that closed the element belongs
 * to the same group as bit 3 and goes out with it.
 */
const FAST_REMB_PRESENCE_BITMAP = 0x01

/**
 * Content bytes of the element. It is what the length field of the one-byte
 * header counts, and that field holds `length - 1` in 4 bits, so the content
 * has to fit in 1 to 16 bytes.
 */
export const WA_FAST_REMB_PAYLOAD_LENGTH = 1 + WA_FAST_REMB_BITRATE_ENCODING.byteLength

/** The whole element: the id/len byte plus the content. */
export const WA_FAST_REMB_ELEMENT_LENGTH = 1 + WA_FAST_REMB_PAYLOAD_LENGTH

/**
 * Content of the element, written into `target` from `offset`: the presence
 * bitmap and the receive bandwidth estimate.
 *
 * Every byte that goes out of here is computed, none is copied from the
 * capture. The receiver capacity field and the flags byte that came with it
 * were removed once the parser showed that bit 3 is optional, see
 * {@link FAST_REMB_PRESENCE_BITMAP}.
 *
 * @param bitsPerSecond estimated receive bandwidth, in bits per second.
 * @returns bytes written, always {@link WA_FAST_REMB_PAYLOAD_LENGTH}.
 */
export function writeFastRembPayload(
    target: Uint8Array,
    offset: number,
    bitsPerSecond: number
): number {
    target[offset] = FAST_REMB_PRESENCE_BITMAP
    WA_FAST_REMB_BITRATE_ENCODING.write(target, offset + 1, bitsPerSecond)
    return WA_FAST_REMB_PAYLOAD_LENGTH
}

/**
 * Writes the whole receive bandwidth estimate element into `target`, from
 * `offset`, and returns how many bytes it wrote.
 *
 * One-byte form of RFC 8285: the first byte is `(id << 4) | (len - 1)`, with
 * `len` in content bytes, and the content comes right behind it, through
 * {@link writeFastRembPayload}. Nothing is allocated, the caller passes the
 * buffer, which on the send path is the session scratch.
 *
 * The announced value is estimated receive capacity, not the rate that is
 * arriving, and the capture shows the peer doing the same: it announces around
 * 150,000 while the video it sends this way is 29.5 kbps, an order of magnitude
 * below. What produces the number on this side is the same rule as the REMB
 * over RTCP, and the reason it still holds is that the transport changed and
 * the reading on the other side did not: the peer uses the value as the ceiling
 * of its own estimator, so returning the measured rate would close the loop
 * that pins the call where it is.
 *
 * @param bitsPerSecond estimated receive bandwidth, in bits per second.
 */
export function writeFastRembExtension(
    target: Uint8Array,
    offset: number,
    bitsPerSecond: number
): number {
    target[offset] = (WA_FAST_REMB_EXTENSION_ID << 4) | (WA_FAST_REMB_PAYLOAD_LENGTH - 1)
    return 1 + writeFastRembPayload(target, offset + 1, bitsPerSecond)
}
