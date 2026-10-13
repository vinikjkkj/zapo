import { readUInt16BE, readUInt32BE, TEXT_ENCODER, writeUInt16BE, writeUInt32BE } from '../bytes.js'
import { randomBytes } from '../crypto/random.js'

const NTP_UNIX_OFFSET = 2208988800

export const PT_SENDER_REPORT = 200
const PT_SOURCE_DESCRIPTION = 202
const PT_PAYLOAD_SPECIFIC_FEEDBACK = 206

const SDES_ITEM_CNAME = 1
/** CNAME bytes an SDES chunk carries; one CNAME serves every stream of a call. */
export const RTCP_CNAME_LENGTH = 18

/** Report blocks one sender report addresses: the count field is 5 bits. */
const MAX_REPORT_BLOCKS = 31
/** On video the profile bit takes bit 4 of the count field, leaving 4 bits. Both bounds are also masks. */
const MAX_VIDEO_REPORT_BLOCKS = 15
/** Sender report header plus sender info, where the first report block starts. */
export const SR_REPORT_BLOCK_OFFSET = 28
/** A report block as WhatsApp lays it out: RFC 3550 6.4.1 plus two words of its own. The peer strides by 32. */
const SR_REPORT_BLOCK_LENGTH = 32
/** Where the two WhatsApp words start inside a report block. */
const SR_BLOCK_EXTENSION_OFFSET = 24
/** Four big-endian u32s closing the sender report, written once after the blocks. */
const SR_PACKET_TRAILER_LENGTH = 16
const SDES_LENGTH = 32

/** Saturation bounds of the signed 24-bit cumulative loss field. */
const MAX_PACKETS_LOST = 0x7fffff
const MIN_PACKETS_LOST = -0x800000

/** Block extension word 0 increment per RTP packet, as measured. */
const SR_BLOCK_COUNTER_PER_PACKET = 161
/** Block extension word 1, as measured. */
const SR_BLOCK_CONVERGED = 0x24800
/** Packet trailer word 3: centre of the 0x4e00-0x5400 band the live metric stayed in. */
const SR_TRAILER_LIVE_METRIC = 0x5000
/** Where that metric sits in the packet trailer. The other three words are zero. */
const SR_TRAILER_LIVE_METRIC_OFFSET = 12

const HEX_DIGITS = TEXT_ENCODER.encode('0123456789abcdef')
const CNAME_HOST_PREFIX = TEXT_ENCODER.encode('@pj')
const CNAME_HOST_SUFFIX = TEXT_ENCODER.encode('.org')

/** Feedback message types carried in the low 5 bits of the first PSFB byte. */
const FMT_PICTURE_LOSS_INDICATION = 1
const FMT_FULL_INTRA_REQUEST = 4
const FMT_RECEIVER_ESTIMATED_MAX_BITRATE = 15

/**
 * WhatsApp video profile bit on byte 0 of a sender report or PLI (0x81 -> 0x91), not an RFC 4585
 * FMT; without it the mobile client ignores the key-frame request. The REMB does not carry it.
 */
const WA_VIDEO_PROFILE_BIT = 0x10

/**
 * Reception statistics for one report block: what this endpoint received from `ssrc`, from
 * the caller's receive path. WhatsApp fills these for real, so an all-zero block diverges.
 */
export interface SenderReportReception {
    /** Source being reported on: the SSRC of the peer stream this endpoint receives. */
    readonly ssrc: number
    /** Packets lost over packets expected since the previous report, as a fraction of 256. */
    readonly fractionLost?: number
    /** Cumulative packets lost, negative on duplicates, saturated to signed 24 bits. */
    readonly packetsLost?: number
    /** Highest 16-bit sequence number received, the low half of the extended number. */
    readonly highestSequence?: number
    /** Sequence wraps counted so far, the high half of the extended number. */
    readonly cycles?: number
    /** Interarrival jitter, in the time units of the RTP timestamp. */
    readonly jitter?: number
    /** Middle 32 bits of the NTP timestamp of the last sender report from `ssrc`. */
    readonly lastSenderReport?: number
    /** Delay between receiving that sender report and sending this one, in 1/65536 s. */
    readonly delaySinceLastSenderReport?: number
}

/** Reported when the caller passes no statistics. */
const NO_RECEPTION: SenderReportReception = { ssrc: 0 }

/** Whether the caller passed several sources to report on or a single one. */
function isReceptionList(
    reception: SenderReportReception | readonly SenderReportReception[]
): reception is readonly SenderReportReception[] {
    return Array.isArray(reception)
}

/**
 * The SSRC a compound RTCP packet's opening sender report describes, or `null` when it does not
 * open with one: in a group call it names the sender whose reception tracker the report feeds.
 */
export function senderReportSourceSsrc(rtcp: Uint8Array): number | null {
    if (rtcp.length < SR_REPORT_BLOCK_OFFSET) return null
    if ((rtcp[0] & 0xc0) !== 0x80 || rtcp[1] !== PT_SENDER_REPORT) return null
    const declared = (readUInt16BE(rtcp, 2) + 1) * 4
    if (declared < SR_REPORT_BLOCK_OFFSET || declared > rtcp.length) return null
    return readUInt32BE(rtcp, 4)
}

/** One report block at `offset`: the six RFC 3550 words, then the two WhatsApp words. */
function writeReportBlock(
    report: Uint8Array,
    offset: number,
    reception: SenderReportReception,
    blockCounter: number
): void {
    const packetsLost = Math.max(
        MIN_PACKETS_LOST,
        Math.min(MAX_PACKETS_LOST, reception.packetsLost ?? 0)
    )
    const extendedHighestSequence =
        (((reception.cycles ?? 0) & 0xffff) << 16) | ((reception.highestSequence ?? 0) & 0xffff)
    writeUInt32BE(report, reception.ssrc >>> 0, offset)
    writeUInt32BE(
        report,
        ((((reception.fractionLost ?? 0) & 0xff) << 24) | (packetsLost & 0xffffff)) >>> 0,
        offset + 4
    )
    writeUInt32BE(report, extendedHighestSequence >>> 0, offset + 8)
    writeUInt32BE(report, (reception.jitter ?? 0) >>> 0, offset + 12)
    writeUInt32BE(report, (reception.lastSenderReport ?? 0) >>> 0, offset + 16)
    writeUInt32BE(report, (reception.delaySinceLastSenderReport ?? 0) >>> 0, offset + 20)
    writeUInt32BE(report, blockCounter >>> 0, offset + SR_BLOCK_EXTENSION_OFFSET)
    writeUInt32BE(report, SR_BLOCK_CONVERGED, offset + SR_BLOCK_EXTENSION_OFFSET + 4)
}

/**
 * Compound RTCP: a sender report then an SDES CNAME chunk. The report is header and sender info,
 * one 32-byte block per source (at least one), then with `withPacketTrailer` four trailer words;
 * the length word counts them all. The WhatsApp words are reproduced as measured.
 * `blockCounter` must not go backwards within a call; its default scales off `packetCount`.
 * `whatsappVideoProfile` raises {@link WA_VIDEO_PROFILE_BIT}, capping the blocks at
 * {@link MAX_VIDEO_REPORT_BLOCKS}.
 */
export function buildSenderReportWithSdes(
    ssrc: number,
    packetCount: number,
    octetCount: number,
    rtpTimestamp: number,
    cname = randomBytes(RTCP_CNAME_LENGTH),
    reception: SenderReportReception | readonly SenderReportReception[] = NO_RECEPTION,
    blockCounter = packetCount * SR_BLOCK_COUNTER_PER_PACKET,
    withPacketTrailer = true,
    whatsappVideoProfile = false
): Uint8Array {
    const blocks = isReceptionList(reception) && reception.length > 0 ? reception : null
    const single = isReceptionList(reception) ? NO_RECEPTION : reception
    const maxBlocks = whatsappVideoProfile ? MAX_VIDEO_REPORT_BLOCKS : MAX_REPORT_BLOCKS
    const profileBit = whatsappVideoProfile ? WA_VIDEO_PROFILE_BIT : 0
    const blockCount = blocks ? Math.min(blocks.length, maxBlocks) : 1
    const trailerLength = withPacketTrailer ? SR_PACKET_TRAILER_LENGTH : 0
    const senderReportLength =
        SR_REPORT_BLOCK_OFFSET + blockCount * SR_REPORT_BLOCK_LENGTH + trailerLength
    const report = new Uint8Array(senderReportLength + SDES_LENGTH)
    const now = Date.now()
    const unixSeconds = Math.floor(now / 1000)
    const fraction = Math.floor(((now % 1000) / 1000) * 0x100000000) >>> 0
    report[0] = 0x80 | profileBit | (blockCount & maxBlocks)
    report[1] = PT_SENDER_REPORT
    writeUInt16BE(report, (senderReportLength >>> 2) - 1, 2)
    writeUInt32BE(report, ssrc, 4)
    writeUInt32BE(report, (unixSeconds + NTP_UNIX_OFFSET) >>> 0, 8)
    writeUInt32BE(report, fraction, 12)
    writeUInt32BE(report, rtpTimestamp >>> 0, 16)
    writeUInt32BE(report, packetCount >>> 0, 20)
    writeUInt32BE(report, octetCount >>> 0, 24)
    for (let index = 0; index < blockCount; index++) {
        writeReportBlock(
            report,
            SR_REPORT_BLOCK_OFFSET + index * SR_REPORT_BLOCK_LENGTH,
            blocks ? blocks[index] : single,
            blockCounter
        )
    }
    if (withPacketTrailer) {
        writeUInt32BE(
            report,
            SR_TRAILER_LIVE_METRIC,
            senderReportLength - SR_PACKET_TRAILER_LENGTH + SR_TRAILER_LIVE_METRIC_OFFSET
        )
    }
    const sdesOffset = senderReportLength
    report[sdesOffset] = 0x81
    report[sdesOffset + 1] = PT_SOURCE_DESCRIPTION
    writeUInt16BE(report, (SDES_LENGTH >>> 2) - 1, sdesOffset + 2)
    writeUInt32BE(report, ssrc, sdesOffset + 4)
    report[sdesOffset + 8] = SDES_ITEM_CNAME
    report[sdesOffset + 9] = RTCP_CNAME_LENGTH
    const cnameOffset = sdesOffset + 10
    for (let i = 0; i < 11; i++) {
        const value = cname[6 + (i >>> 1)] || 0
        report[cnameOffset + (i < 5 ? i : i + 3)] =
            HEX_DIGITS[i % 2 === 0 ? value >>> 4 : value & 0x0f]
    }
    report.set(CNAME_HOST_PREFIX, cnameOffset + 5)
    report.set(CNAME_HOST_SUFFIX, cnameOffset + 14)
    return report
}

/**
 * Head of an RFC 4585 payload-specific feedback packet; `fciBytes` reserves the FCI from
 * offset 12, kept 32-bit aligned.
 */
function buildPayloadSpecificFeedback(
    format: number,
    senderSsrc: number,
    mediaSsrc: number,
    fciBytes: number,
    whatsappVideoProfile = false
): Uint8Array {
    const packet = new Uint8Array(12 + fciBytes)
    packet[0] = 0x80 | (whatsappVideoProfile ? WA_VIDEO_PROFILE_BIT : 0) | (format & 0x1f)
    packet[1] = PT_PAYLOAD_SPECIFIC_FEEDBACK
    writeUInt16BE(packet, (packet.length >>> 2) - 1, 2)
    writeUInt32BE(packet, senderSsrc, 4)
    writeUInt32BE(packet, mediaSsrc, 8)
    return packet
}

/** RFC 4585 PLI; `whatsappVideoProfile` raises {@link WA_VIDEO_PROFILE_BIT}, as the video key-frame request does. */
export function buildPictureLossIndication(
    senderSsrc: number,
    mediaSsrc: number,
    whatsappVideoProfile = false
): Uint8Array {
    return buildPayloadSpecificFeedback(
        FMT_PICTURE_LOSS_INDICATION,
        senderSsrc,
        mediaSsrc,
        0,
        whatsappVideoProfile
    )
}

/** RFC 5104 FIR; the media SSRC lives in the FCI entry, so the header field stays zero. */
export function buildFullIntraRequest(
    senderSsrc: number,
    mediaSsrc: number,
    sequenceNumber: number
): Uint8Array {
    const packet = buildPayloadSpecificFeedback(FMT_FULL_INTRA_REQUEST, senderSsrc, 0, 8)
    writeUInt32BE(packet, mediaSsrc, 12)
    packet[16] = sequenceNumber & 0xff
    return packet
}

/** `REMB` in ASCII, the four bytes that open the FCI and identify the format. */
const REMB_IDENTIFIER = 0x52454d42
/** Width of the bitrate mantissa. The exponent takes the 6 bits right above it. */
const REMB_MANTISSA_BITS = 18
/** Largest representable mantissa, where it saturates and the exponent has to rise. */
const REMB_MAX_MANTISSA = (1 << REMB_MANTISSA_BITS) - 1
/** Largest exponent the 6 bits of the field can represent. */
const REMB_MAX_EXPONENT = 0x3f
/** Shift of the byte that counts the SSRCs, inside the word that carries the bitrate. */
const REMB_SSRC_COUNT_SHIFT = 24
/** FCI of a REMB on one source: identifier, count, bitrate and the SSRC. */
const REMB_FCI_LENGTH = 12
/** Where the count-plus-bitrate word starts inside the packet. */
const REMB_BAND_OFFSET = 16
/** Where the listed SSRC starts inside the packet. */
const REMB_SSRC_OFFSET = 20
/** Sources one REMB lists: the count is one byte. */
const REMB_MAX_SSRCS = 0xff

/**
 * REMB bitrate as 6 bits of exponent over 18 of mantissa, truncating so it never announces more
 * than asked, saturating past the range.
 */
function encodeRembBitrate(bitsPerSecond: number): number {
    let mantissa = bitsPerSecond > 0 ? Math.floor(bitsPerSecond) : 0
    let exponent = 0
    while (mantissa > REMB_MAX_MANTISSA && exponent < REMB_MAX_EXPONENT) {
        mantissa = Math.floor(mantissa / 2)
        exponent++
    }
    if (mantissa > REMB_MAX_MANTISSA) mantissa = REMB_MAX_MANTISSA
    return ((exponent << REMB_MANTISSA_BITS) | mantissa) >>> 0
}

/**
 * Standard REMB: PSFB FMT 15, `REMB`, the source count and the exponent/mantissa bitrate. Byte 0
 * is 0x8f, without {@link WA_VIDEO_PROFILE_BIT}. The header media SSRC stays zero; the sources the
 * one bitrate covers are listed in the FCI, at most 255.
 */
export function buildReceiverEstimatedMaxBitrate(
    senderSsrc: number,
    mediaSsrc: number | readonly number[],
    bitsPerSecond: number
): Uint8Array {
    const list = typeof mediaSsrc === 'number' ? null : mediaSsrc
    const count = list ? Math.min(list.length, REMB_MAX_SSRCS) : 1
    const packet = buildPayloadSpecificFeedback(
        FMT_RECEIVER_ESTIMATED_MAX_BITRATE,
        senderSsrc,
        0,
        REMB_FCI_LENGTH + (count - 1) * 4
    )
    writeUInt32BE(packet, REMB_IDENTIFIER, 12)
    const band = ((count << REMB_SSRC_COUNT_SHIFT) | encodeRembBitrate(bitsPerSecond)) >>> 0
    writeUInt32BE(packet, band, REMB_BAND_OFFSET)
    for (let index = 0; index < count; index++) {
        writeUInt32BE(
            packet,
            list ? list[index] : (mediaSsrc as number),
            REMB_SSRC_OFFSET + index * 4
        )
    }
    return packet
}
