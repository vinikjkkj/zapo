import { readUInt16BE, readUInt32BE, TEXT_ENCODER, writeUInt16BE, writeUInt32BE } from '../bytes.js'
import { randomBytes } from '../crypto/random.js'

const NTP_UNIX_OFFSET = 2208988800

const PT_SENDER_REPORT = 200
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
const SR_REPORT_BLOCK_OFFSET = 28
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

/** Fraction the report interval is spread over, redrawn per report, as RFC 3550 6.3.1 advises. */
const REPORT_INTERVAL_JITTER = 0.1
/** Ticks one millisecond of a stream clock covers, the unit the rate divides by. */
const TICKS_PER_MS = 1000

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

/** One 16-bit sequence space, the modulus the extended sequence number counts in. */
const SEQUENCE_CYCLE = 0x10000
/** Half the sequence space: a wider step is a wrap, not a jump. */
const SEQUENCE_WRAP_THRESHOLD = 0x8000
/** The loss fraction is an 8-bit field, so it scales by 256 and saturates at 255. */
const FRACTION_LOST_SCALE = 256
const MAX_FRACTION_LOST = 255
/** Smoothing divisor of the jitter estimator of RFC 3550 appendix A.8. */
const JITTER_GAIN = 16
/** The delay since the last sender report counts in units of 1/65536 second. */
const DLSR_UNITS_PER_SECOND = 65536
const MAX_DLSR = 0xffffffff

/** The report block fields, kept mutable so a report costs no allocation. */
interface MutableReception {
    ssrc: number
    fractionLost: number
    packetsLost: number
    highestSequence: number
    cycles: number
    jitter: number
    lastSenderReport: number
    delaySinceLastSenderReport: number
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

/**
 * Reception statistics of one inbound RTP stream, for the report block of the matching
 * outbound stream's sender report. One per stream, at that stream's `clockRate`; a packet from
 * another SSRC restarts the statistics under it.
 */
export class RtpStreamReception {
    private readonly clockRate: number
    private readonly stats: MutableReception = {
        ssrc: 0,
        fractionLost: 0,
        packetsLost: 0,
        highestSequence: 0,
        cycles: 0,
        jitter: 0,
        lastSenderReport: 0,
        delaySinceLastSenderReport: 0
    }

    private baseSequence = -1
    private lastSequence = 0
    private cycles = 0
    private extendedHighest = 0
    private received = 0
    private expectedPrior = 0
    private receivedPrior = 0
    private lastRtpTimestamp = 0
    private lastArrivalTicks = 0
    private jitter = 0
    private senderReportArrivalMs = 0
    private pendingJumpSequence = -1
    private expectedPriorLoss = 0
    private receivedPriorLoss = 0

    constructor(clockRate: number) {
        this.clockRate = clockRate
    }

    /** SSRC the stream turned out to carry, or 0 before the first packet. */
    get sourceSsrc(): number {
        return this.stats.ssrc
    }

    /** Cumulative loss as a percentage of the packets expected so far. */
    get lossPercent(): number {
        if (this.baseSequence < 0) return 0
        const expected = this.extendedHighest - this.baseSequence + 1
        if (expected <= 0) return 0
        const lost = expected - this.received
        return lost > 0 ? (lost / expected) * 100 : 0
    }

    /** Loss since the previous call, in percent, on an interval apart from the one {@link report} consumes. */
    takeLossPercent(): number {
        if (this.baseSequence < 0) return 0
        const expected = this.extendedHighest - this.baseSequence + 1
        const expectedInterval = expected - this.expectedPriorLoss
        const lostInterval = expectedInterval - (this.received - this.receivedPriorLoss)
        this.expectedPriorLoss = expected
        this.receivedPriorLoss = this.received
        return expectedInterval > 0 && lostInterval > 0
            ? (lostInterval / expectedInterval) * 100
            : 0
    }

    /** Records one received packet; `arrivalMs` is the wall clock at reception. */
    observe(ssrc: number, sequenceNumber: number, rtpTimestamp: number, arrivalMs: number): void {
        const arrivalTicks = (arrivalMs * this.clockRate) / 1000
        if (this.baseSequence < 0 || ssrc !== this.stats.ssrc) {
            this.restart(ssrc, sequenceNumber, rtpTimestamp, arrivalTicks)
            return
        }

        this.received++
        this.updateJitter(rtpTimestamp, arrivalTicks)

        const previous = this.lastSequence
        if (this.cycles > 0 && sequenceNumber - previous > SEQUENCE_WRAP_THRESHOLD) {
            const pending = this.pendingJumpSequence
            this.pendingJumpSequence = sequenceNumber
            if (pending >= 0 && sequenceNumber === (pending + 1) % SEQUENCE_CYCLE) {
                this.restart(ssrc, sequenceNumber, rtpTimestamp, arrivalTicks)
            }
            return
        }
        this.pendingJumpSequence = -1
        if (previous - sequenceNumber > SEQUENCE_WRAP_THRESHOLD) {
            this.cycles++
        }
        this.lastSequence = sequenceNumber
        const extended = this.cycles * SEQUENCE_CYCLE + sequenceNumber
        if (extended > this.extendedHighest) {
            this.extendedHighest = extended
        }
    }

    /**
     * Records an inbound RTCP packet: one opening with a sender report from the tracked source
     * sets the LSR/DLSR pair the next report block echoes.
     */
    observeSenderReport(rtcp: Uint8Array, arrivalMs: number): void {
        if (rtcp.length < SR_REPORT_BLOCK_OFFSET) return
        if ((rtcp[0] & 0xc0) !== 0x80 || rtcp[1] !== PT_SENDER_REPORT) return
        if (this.stats.ssrc === 0 || readUInt32BE(rtcp, 4) !== this.stats.ssrc) return

        const ntpSeconds = readUInt32BE(rtcp, 8)
        const ntpFraction = readUInt32BE(rtcp, 12)
        this.stats.lastSenderReport = (((ntpSeconds & 0xffff) << 16) | (ntpFraction >>> 16)) >>> 0
        this.senderReportArrivalMs = arrivalMs
    }

    /**
     * Statistics for the next report block as of `nowMs`. Consumes the loss interval; the returned
     * object is reused, so read it before the next call.
     */
    report(nowMs: number): SenderReportReception {
        const stats = this.stats
        if (this.baseSequence < 0) return stats

        const expected = this.extendedHighest - this.baseSequence + 1
        const expectedInterval = expected - this.expectedPrior
        const receivedInterval = this.received - this.receivedPrior
        this.expectedPrior = expected
        this.receivedPrior = this.received

        const lostInterval = expectedInterval - receivedInterval
        stats.fractionLost =
            expectedInterval <= 0 || lostInterval <= 0
                ? 0
                : Math.min(
                      MAX_FRACTION_LOST,
                      Math.floor((lostInterval * FRACTION_LOST_SCALE) / expectedInterval)
                  )
        stats.packetsLost = expected - this.received
        stats.highestSequence = this.extendedHighest % SEQUENCE_CYCLE
        stats.cycles = Math.floor(this.extendedHighest / SEQUENCE_CYCLE)
        stats.jitter = Math.floor(this.jitter)
        stats.delaySinceLastSenderReport =
            this.senderReportArrivalMs > 0
                ? Math.min(
                      MAX_DLSR,
                      Math.max(
                          0,
                          Math.round(
                              ((nowMs - this.senderReportArrivalMs) * DLSR_UNITS_PER_SECOND) / 1000
                          )
                      )
                  )
                : 0
        return stats
    }

    /** Drops every statistic, as at the start of a call. */
    reset(): void {
        const stats = this.stats
        stats.ssrc = 0
        stats.fractionLost = 0
        stats.packetsLost = 0
        stats.highestSequence = 0
        stats.cycles = 0
        stats.jitter = 0
        stats.lastSenderReport = 0
        stats.delaySinceLastSenderReport = 0
        this.baseSequence = -1
        this.lastSequence = 0
        this.cycles = 0
        this.extendedHighest = 0
        this.received = 0
        this.expectedPrior = 0
        this.receivedPrior = 0
        this.lastRtpTimestamp = 0
        this.lastArrivalTicks = 0
        this.jitter = 0
        this.senderReportArrivalMs = 0
        this.pendingJumpSequence = -1
        this.expectedPriorLoss = 0
        this.receivedPriorLoss = 0
    }

    /** Interarrival jitter of RFC 3550 A.8, the timestamp step taken as signed 32 bits. */
    private updateJitter(rtpTimestamp: number, arrivalTicks: number): void {
        const drift =
            arrivalTicks - this.lastArrivalTicks - ((rtpTimestamp - this.lastRtpTimestamp) | 0)
        this.lastRtpTimestamp = rtpTimestamp
        this.lastArrivalTicks = arrivalTicks
        const magnitude = drift < 0 ? -drift : drift
        this.jitter += (magnitude - this.jitter) / JITTER_GAIN
    }

    /**
     * Starts tracking `ssrc` from this packet. On the same source, a sequence resync, the sender
     * report state survives, so LSR and DLSR do not drop to zero.
     */
    private restart(
        ssrc: number,
        sequenceNumber: number,
        rtpTimestamp: number,
        arrivalTicks: number
    ): void {
        const sameSource = ssrc === this.stats.ssrc
        const lastSenderReport = this.stats.lastSenderReport
        const delaySinceLastSenderReport = this.stats.delaySinceLastSenderReport
        const senderReportArrivalMs = this.senderReportArrivalMs
        this.reset()
        this.stats.ssrc = ssrc
        this.stats.highestSequence = sequenceNumber
        this.baseSequence = sequenceNumber
        this.lastSequence = sequenceNumber
        this.extendedHighest = sequenceNumber
        this.received = 1
        this.lastRtpTimestamp = rtpTimestamp
        this.lastArrivalTicks = arrivalTicks
        if (sameSource) {
            this.stats.lastSenderReport = lastSenderReport
            this.stats.delaySinceLastSenderReport = delaySinceLastSenderReport
            this.senderReportArrivalMs = senderReportArrivalMs
        }
    }
}

/** `interval` spread over the jitter band, as the next interval to wait out. */
function randomizeInterval(interval: number): number {
    return Math.round(interval * (1 + REPORT_INTERVAL_JITTER * (Math.random() * 2 - 1)))
}

/**
 * Paces the sender reports of one outbound stream on a counter that only moves forward: the RTP
 * timestamp for audio, wall-clock milliseconds for video. Differences are taken modulo 2^32.
 */
export class SenderReportSchedule {
    private readonly interval: number
    private threshold: number
    private last = 0
    private started = false

    private constructor(interval: number) {
        this.interval = interval
        this.threshold = randomizeInterval(interval)
    }

    /** Schedule on the outgoing RTP timestamp; the interval converts to ticks of `clockRate` once. */
    static onMediaClock(intervalMs: number, clockRate: number): SenderReportSchedule {
        return new SenderReportSchedule(intervalMs * (clockRate / TICKS_PER_MS))
    }

    /** Schedule driven by elapsed wall time, the counter a video stream uses. */
    static onWallClock(intervalMs: number): SenderReportSchedule {
        return new SenderReportSchedule(intervalMs)
    }

    /**
     * Whether `current` closes the interval, consuming it when it does. The first call only opens
     * the interval.
     */
    shouldReport(current: number): boolean {
        if (!this.started) {
            this.started = true
            this.last = current
            return false
        }
        if ((current - this.last) >>> 0 < this.threshold) return false
        this.last = current
        this.threshold = randomizeInterval(this.interval)
        return true
    }

    /** Drops the interval and redraws the threshold, as at the start of a call. */
    reset(): void {
        this.started = false
        this.last = 0
        this.threshold = randomizeInterval(this.interval)
    }
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

const MS_PER_SECOND = 1000
const BITS_PER_OCTET = 8

/** First ceiling the REMB announces, well above a collapsed sender, so it has room to climb. */
const REMB_INITIAL_BITRATE = 300_000
/** Floor of what the REMB announces: below it there is no video call. */
const REMB_MIN_BITRATE = 64_000
/** Cap of what the REMB announces. */
const REMB_MAX_BITRATE = 2_000_000
/** Cumulative loss below which the receive path is read as having headroom. */
const REMB_QUIET_LOSS_PERCENT = 2
/** Cumulative loss from which the path is dropping what arrives. */
const REMB_CONGESTED_LOSS_PERCENT = 10
/** Step the ceiling climbs per interval, while the receive path has headroom. */
const REMB_GROWTH_FACTOR = 1.5
/** Step the ceiling backs off per interval, under evidence of loss. */
const REMB_BACKOFF_FACTOR = 0.85

/**
 * Next REMB ceiling: the bandwidth this endpoint estimates it can receive, not what arrives, since
 * the peer takes it as its estimator's ceiling. Under 2% cumulative loss it climbs 1.5x (or to
 * 1.5x the measured rate), up to 10% it holds, past that it backs off 15% from the lower of the
 * ceiling and the measured rate. `previous` 0 starts at the initial ceiling.
 */
export function nextReceiverMaxBitrate(
    previous: number,
    octets: number,
    elapsedMs: number,
    lossPercent: number
): number {
    if (!(previous > 0)) return REMB_INITIAL_BITRATE
    const measured =
        elapsedMs > 0 && octets > 0 ? (octets * BITS_PER_OCTET * MS_PER_SECOND) / elapsedMs : 0
    let next: number
    if (lossPercent >= REMB_CONGESTED_LOSS_PERCENT) {
        const anchor = measured > 0 && measured < previous ? measured : previous
        next = anchor * REMB_BACKOFF_FACTOR
    } else if (lossPercent >= REMB_QUIET_LOSS_PERCENT) {
        next = previous
    } else {
        const grown = previous * REMB_GROWTH_FACTOR
        const overshoot = measured * REMB_GROWTH_FACTOR
        next = overshoot > grown ? overshoot : grown
    }
    if (next < REMB_MIN_BITRATE) return REMB_MIN_BITRATE
    if (next > REMB_MAX_BITRATE) return REMB_MAX_BITRATE
    return Math.floor(next)
}

/** First audio REMB: above the 22000 the peer's UAQC needs (`uaqc_probing_remb_threshold`) to leave probing. */
const AUDIO_REMB_INITIAL_BITRATE = 24_000
/** Audio REMB floor, UAQC's `uaqc_bandwidth_managed_remb_lower_threshold`. */
const AUDIO_REMB_MIN_BITRATE = 16_000
/**
 * Audio REMB ceiling: a 15% backoff (25500) stays over UAQC's 25000 high-quality target and 24000
 * managed band; the peer reads the lower of this and its own estimate, so more hands it the state.
 */
const AUDIO_REMB_MAX_BITRATE = 30_000
const AUDIO_REMB_GROWTH_FACTOR = 1.1

/**
 * Next audio REMB in bps, a rule of ours: 10% up per interval under 2% loss
 * to 30 kbps and steady there, held up to 10%, 15% down from there, never below 16 kbps.
 */
export function nextAudioReceiverEstimate(previous: number, lossPercent: number): number {
    if (!(previous > 0)) return AUDIO_REMB_INITIAL_BITRATE
    let next = previous
    if (lossPercent >= REMB_CONGESTED_LOSS_PERCENT) next = previous * REMB_BACKOFF_FACTOR
    else if (lossPercent < REMB_QUIET_LOSS_PERCENT) next = previous * AUDIO_REMB_GROWTH_FACTOR
    if (next < AUDIO_REMB_MIN_BITRATE) return AUDIO_REMB_MIN_BITRATE
    if (next > AUDIO_REMB_MAX_BITRATE) return AUDIO_REMB_MAX_BITRATE
    return Math.floor(next)
}

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
