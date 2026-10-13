/** Parses and writes the MLow PT 121 payload: multiframes, TOC spans and in-band RED. */

import { MLOW_SAMPLE_RATE } from './mlow-binding.js'

/** Multiframe packet: `[0x82 | toc & 0x39][count][count - 1 lengths][sub-frames, each with its TOC]`. */
export const MULTIFRAME_MARKER = 0x82
const MULTIFRAME_COUNT_MASK = 0x3f
/** Most sub-frames one multiframe packet carries. */
export const MLOW_MAX_SUBFRAMES = 18
/** A TOC with both top bits set selects CELT, whose low bits mean something else. */
export const CELT_TOC = 0xc0

/** TOC bit 6: the frame carries speech. Clear on the silence and DTX frames. */
export const MLOW_TOC_VAD = 0x40

/** Samples on the 16 kHz RTP clock of an SMPL frame, by TOC bits 4-3: 10, 20, 60 or 120 ms. */
const SMPL_FRAME_SAMPLES = [160, 320, 960, 1_920] as const

/** First byte of an in-band RED copy header: F (bit 7) set, the low 7 bits how far back in 10 ms. */
const RED_COPY_MARKER = 0x80
/** The primary's header, F clear: one byte that closes the header list. */
const RED_PRIMARY_HEADER = 0x00
const RED_DELTA_MASK = 0x7f
/** 16 kHz samples in one 10 ms step of the header: 0x86 is the frame 60 ms before. */
const RED_DELTA_UNIT = MLOW_SAMPLE_RATE / 100
/** Furthest back a copy may start, in 16 kHz samples: 127 steps, 1270 ms. */
const RED_MAX_DELTA = RED_DELTA_MASK * RED_DELTA_UNIT
/** Longest copy the header's length byte describes. */
const RED_MAX_COPY_BYTES = 0xff
/** Most copies an in-band RED packet carries, a bound of ours. */
export const MLOW_MAX_RED_BLOCKS = 8

/**
 * Splits a multiframe packet into `bounds` as `[offset, length]` pairs and returns the sub-frame
 * count, or 0 for a single frame or a header that does not add up.
 */
export function readMlowSubframes(packet: Uint8Array, bounds: Int32Array): number {
    const marker = packet[0]
    if (packet.length < 3 || (marker & MULTIFRAME_MARKER) !== MULTIFRAME_MARKER) return 0
    if (marker >= CELT_TOC) return 0
    const count = packet[1] & MULTIFRAME_COUNT_MASK
    if (count < 2 || count > MLOW_MAX_SUBFRAMES || bounds.length < count * 2) return 0

    let cursor = 2
    let total = 0
    for (let index = 0; index < count - 1; index++) {
        if (cursor >= packet.length) return 0
        let length = packet[cursor++]
        if (length >= 252) {
            if (cursor >= packet.length) return 0
            length += packet[cursor++] * 4
        }
        if (length === 0) return 0
        bounds[index * 2 + 1] = length
        total += length
    }
    if (cursor + total >= packet.length) return 0

    let offset = cursor
    for (let index = 0; index < count - 1; index++) {
        bounds[index * 2] = offset
        offset += bounds[index * 2 + 1]
    }
    bounds[(count - 1) * 2] = offset
    bounds[(count - 1) * 2 + 1] = packet.length - offset
    return count
}

/** Samples a frame spans on the 16 kHz RTP clock, read from its TOC; 0 for a CELT TOC. */
export function mlowFrameSamples(toc: number): number {
    return toc >= CELT_TOC ? 0 : SMPL_FRAME_SAMPLES[(toc >> 3) & 3]
}

/**
 * Samples `packet` spans, its sub-frames summed, with `bounds` as {@link readMlowSubframes} fills
 * it; 0 when it does not parse as MLow: empty, a CELT TOC, or a multiframe that does not add up.
 */
export function mlowPacketSamples(packet: Uint8Array, bounds: Int32Array): number {
    if (packet.length === 0) return 0
    return samplesOfSubframes(packet, readMlowSubframes(packet, bounds), bounds)
}

/** {@link mlowPacketSamples} of a packet whose {@link readMlowSubframes} count is in `bounds`. */
function samplesOfSubframes(packet: Uint8Array, count: number, bounds: Int32Array): number {
    if (packet.length === 0) return 0
    if (count === 0) {
        const marker = packet[0]
        if ((marker & MULTIFRAME_MARKER) === MULTIFRAME_MARKER && marker < CELT_TOC) return 0
        return mlowFrameSamples(marker)
    }
    let samples = 0
    for (let index = 0; index < count; index++) {
        const span = mlowFrameSamples(packet[bounds[index * 2]])
        if (span === 0) return 0
        samples += span
    }
    return samples
}

/** A RED copy header's first byte: F set and a non-zero step back. */
function isRedHeader(byte: number): boolean {
    return (byte & RED_COPY_MARKER) !== 0 && (byte & RED_DELTA_MASK) !== 0
}

/** Δts of a copy a RED header can carry, or 0 when the copy is left out. */
function redCopyDelta(copy: Uint8Array, timestamp: number, copyTimestamp: number): number {
    const delta = (timestamp - copyTimestamp) >>> 0
    if (copy.length === 0 || copy.length > RED_MAX_COPY_BYTES) return 0
    if (delta % RED_DELTA_UNIT !== 0) return 0
    return delta < RED_DELTA_UNIT || delta > RED_MAX_DELTA ? 0 : delta
}

/**
 * Writes the official in-band MLow RED, a compact RFC 2198, into `target` and returns
 * its length: `[0x80 | steps][length]` per copy, the `0x00` primary header, the copies, then
 * `primary`. Steps are 10 ms units back from `timestamp`, 1 to 127; a copy empty, over 255 bytes or
 * off that grid is left out. Goes on PT 121; the receiver needs `enable_red_pt_support_rx`.
 */
export function writeMlowRed(
    target: Uint8Array,
    primary: Uint8Array,
    timestamp: number,
    copies: readonly Uint8Array[],
    copyTimestamps: readonly number[]
): number {
    let body = 1
    for (let index = 0; index < copies.length; index++) {
        if (redCopyDelta(copies[index], timestamp, copyTimestamps[index]) > 0) body += 2
    }
    let header = 0
    for (let index = 0; index < copies.length; index++) {
        const copy = copies[index]
        const delta = redCopyDelta(copy, timestamp, copyTimestamps[index])
        if (delta === 0) continue
        target[header++] = RED_COPY_MARKER | Math.floor(delta / RED_DELTA_UNIT)
        target[header++] = copy.length
        target.set(copy, body)
        body += copy.length
    }
    target[header] = RED_PRIMARY_HEADER
    target.set(primary, body)
    return body + primary.length
}

/**
 * Splits the in-band RED of {@link writeMlowRed} into `bounds`, `[offset, length, Δts]` per copy,
 * Δts its 10 ms steps as 16 kHz samples, then the primary's `[offset, length]`. Returns the copy
 * count, 0 for a lone primary, -1 when `packet` is not RED: headers while F is set, then `0x00`.
 */
export function readMlowRed(packet: Uint8Array, bounds: Int32Array): number {
    let count = 0
    let cursor = 0
    let total = 0
    while (cursor < packet.length && isRedHeader(packet[cursor])) {
        if (cursor + 1 >= packet.length || count === MLOW_MAX_RED_BLOCKS) return -1
        if (bounds.length < (count + 2) * 3) return -1
        const length = packet[cursor + 1]
        if (length === 0) return -1
        bounds[count * 3 + 1] = length
        bounds[count * 3 + 2] = (packet[cursor] & RED_DELTA_MASK) * RED_DELTA_UNIT
        total += length
        cursor += 2
        count++
    }
    if (cursor >= packet.length || packet[cursor] !== RED_PRIMARY_HEADER) return -1
    cursor++
    if (cursor + total >= packet.length || bounds.length < (count + 1) * 3) return -1

    for (let index = 0; index < count; index++) {
        bounds[index * 3] = cursor
        cursor += bounds[index * 3 + 1]
    }
    bounds[count * 3] = cursor
    bounds[count * 3 + 1] = packet.length - cursor
    bounds[count * 3 + 2] = 0
    return count
}

/** One read of a PT 121 packet, kept so {@link MLowCodec.decodeSequenced} does not read it again. */
export class MlowPacketRead {
    readonly subframeBounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    readonly redBounds = new Int32Array((MLOW_MAX_RED_BLOCKS + 1) * 3)
    packet: Uint8Array | null = null
    subframes = 0
    copies = -1

    /** Reads `packet`; whether it parses as MLow, as frames with a span or as in-band RED. */
    read(packet: Uint8Array): boolean {
        const subframes = readMlowSubframes(packet, this.subframeBounds)
        this.packet = packet
        this.subframes = subframes
        this.copies = subframes === 0 ? readMlowRed(packet, this.redBounds) : -1
        if (samplesOfSubframes(packet, subframes, this.subframeBounds) > 0) return true
        return subframes === 0 ? this.copies >= 0 : readMlowRed(packet, this.redBounds) >= 0
    }
}
