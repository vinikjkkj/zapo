/**
 * First byte of the frame a conference relay puts around some of the media it forwards. It
 * shares the two clear high bits of STUN, and carries no magic cookie.
 */
export const WARP_FRAME_MARKER = 0x09

/** Marker, length byte and a 16-bit counter, before the attribute region. */
const WARP_FRAME_BASE_HEADER_LEN = 4

/** The top bit of the length byte is a flag, not length. */
const WARP_FRAME_LENGTH_MASK = 0x7f

const RTP_HEADER_LEN = 12
const RTP_VERSION_MASK = 0xc0
const RTP_VERSION_2 = 0x80

/** What {@link readWarpFrame} made of a datagram. */
export type WarpFrameRead =
    /** No frame: the datagram is what it already was. */
    | { readonly kind: 'not_framed' }
    /** A frame around media: `rtp` is the packet inside it, a view over the datagram. */
    | { readonly kind: 'framed'; readonly headerLength: number; readonly rtp: Uint8Array }
    /** The marker is there but its header length runs past the datagram. */
    | { readonly kind: 'header_overruns'; readonly headerLength: number }
    /** A frame that fits but holds no RTP: the relay's own control frames. */
    | { readonly kind: 'no_rtp_inside'; readonly headerLength: number }

const NOT_FRAMED: WarpFrameRead = Object.freeze({ kind: 'not_framed' })

/** Whether a datagram carries the marker; {@link readWarpFrame} decides if the frame holds. */
export function isWarpFramedPacket(data: Uint8Array): boolean {
    return data.length >= WARP_FRAME_BASE_HEADER_LEN && data[0] === WARP_FRAME_MARKER
}

/**
 * Bytes the frame header takes, `4 + (byte1 & 0x7f) * 2`. The rule fits both header sizes seen
 * so far (8 and 18 bytes); a length that does not fit the datagram reads as `header_overruns`.
 */
export function warpFrameHeaderLength(data: Uint8Array): number {
    return WARP_FRAME_BASE_HEADER_LEN + (data[1] & WARP_FRAME_LENGTH_MASK) * 2
}

/**
 * Takes the frame off a datagram, or says why not. A datagram with no frame is the normal case
 * and comes back as `not_framed`, so this can run over every inbound datagram.
 */
export function readWarpFrame(data: Uint8Array): WarpFrameRead {
    if (!isWarpFramedPacket(data)) return NOT_FRAMED

    const headerLength = warpFrameHeaderLength(data)
    if (headerLength > data.length) return { kind: 'header_overruns', headerLength }

    const rtp = data.subarray(headerLength)
    if (rtp.length < RTP_HEADER_LEN || (rtp[0] & RTP_VERSION_MASK) !== RTP_VERSION_2) {
        return { kind: 'no_rtp_inside', headerLength }
    }
    return { kind: 'framed', headerLength, rtp }
}
