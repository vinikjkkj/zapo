import { WA_FAST_REMB_ELEMENT_LENGTH, writeFastRembExtension } from '../media/fast-remb.js'

/** Video extension bytes before padding on a frame's first packet; the other packets write 11. */
const VIDEO_EXTENSION_FIRST_PACKET_LENGTH = 13

/** `length` rounded up until it closes the 32-bit word. */
function padTo32Bits(length: number): number {
    return (length + 3) & ~3
}

/** The largest video extension: a frame's first packet, carrying the bitrate estimate too. */
export const VIDEO_EXTENSION_SCRATCH_LENGTH = padTo32Bits(
    VIDEO_EXTENSION_FIRST_PACKET_LENGTH + WA_FAST_REMB_ELEMENT_LENGTH
)

/** One slice of `scratch` per length in 32-bit words, so no packet calls `subarray`. */
export function buildExtensionViews(scratch: Uint8Array): readonly Uint8Array[] {
    const views = new Array<Uint8Array>(scratch.length / 4 + 1)
    for (let words = 0; words < views.length; words++) {
        views[words] = scratch.subarray(0, words * 4)
    }
    return views
}

/**
 * Writes a video packet's header extension at the start of `extension` and returns its padded
 * length. A `receiverEstimate` above zero appends the REMB element.
 */
export function writeVideoExtension(
    extension: Uint8Array,
    keyFrame: boolean,
    firstPacket: boolean,
    frameNumber: number,
    transportSequence: number,
    receiverEstimate: number
): number {
    let offset = 0
    extension[offset++] = firstPacket ? 0x32 : 0x30
    extension[offset++] = keyFrame ? 0x08 : 0x20
    if (firstPacket) {
        extension[offset++] = (frameNumber >>> 8) & 0xff
        extension[offset++] = frameNumber & 0xff
    }
    extension[offset++] = 0x51
    extension[offset++] = 0
    extension[offset++] = 0
    extension[offset++] = 0x61
    extension[offset++] = 0
    extension[offset++] = 0
    extension[offset++] = 0x91
    extension[offset++] = (transportSequence >>> 8) & 0xff
    extension[offset++] = transportSequence & 0xff
    if (receiverEstimate > 0) {
        offset += writeFastRembExtension(extension, offset, receiverEstimate)
    }
    const padded = padTo32Bits(offset)
    if (padded > offset) extension.fill(0, offset, padded)
    return padded
}
