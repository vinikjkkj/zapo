import { readUInt32BE, TEXT_ENCODER, writeUInt16BE, writeUInt32BE } from '../bytes.js'
import { randomBytes } from '../crypto/primitives.js'

const NTP_UNIX_OFFSET = 2208988800

const PT_SENDER_REPORT = 200
const PT_SOURCE_DESCRIPTION = 202
const PT_PAYLOAD_SPECIFIC_FEEDBACK = 206

const SDES_ITEM_CNAME = 1
/**
 * CNAME bytes an SDES chunk carries. One value has to serve every stream of a
 * call, because the CNAME is what binds those streams to one participant, so
 * the session allocates it once and passes it to every sender report.
 */
export const RTCP_CNAME_LENGTH = 18

/**
 * Report blocks one sender report can address. The reception report count is a
 * 5-bit header field, so a call with more sources than this reports on the
 * first of them rather than emitting a count that no longer matches the bytes.
 */
const MAX_REPORT_BLOCKS = 31
/**
 * Report blocks a video sender report can address. The WhatsApp profile bit
 * takes bit 4 of that same field, leaving the count four bits instead of five,
 * so the video path reports on fewer sources than the audio one. Clamping here
 * is what keeps the count and the bytes behind it in step: a 16th block would
 * carry into the profile bit and read back as no video and no blocks at all.
 *
 * Both bounds double as the mask of the field they fill, because each one is
 * the widest count its own bits can hold.
 */
const MAX_VIDEO_REPORT_BLOCKS = 15
/** Sender report header plus sender info, where the first report block starts. */
const SR_REPORT_BLOCK_OFFSET = 28
/**
 * One report block as WhatsApp lays it out: the 24 bytes of RFC 3550 section
 * 6.4.1 plus a two-word extension of its own. The extension belongs to the
 * block, not to the packet, so the peer strides by 32 and derives the block
 * count from the byte length.
 */
const SR_REPORT_BLOCK_LENGTH = 32
/** Where the two WhatsApp words start inside a report block. */
const SR_BLOCK_EXTENSION_OFFSET = 24
/** Four big-endian u32s closing the sender report, written once after the blocks. */
const SR_PACKET_TRAILER_LENGTH = 16
const SDES_LENGTH = 32

/** Saturation bounds of the signed 24-bit cumulative loss field. */
const MAX_PACKETS_LOST = 0x7fffff
const MIN_PACKETS_LOST = -0x800000

/**
 * Block extension word 0 increment per RTP packet. Captures showed the word
 * climbing by roughly 4030 per sender report, emitted every 25 RTP packets.
 */
const SR_BLOCK_COUNTER_PER_PACKET = 161
/** Block extension word 1: the value both captured calls converged on. */
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
 * WhatsApp video profile bit, on byte 0 of a payload-specific feedback packet.
 *
 * It is not an RFC 4585 FMT. Raised together with the PLI it turns the 5-bit
 * field into 17, which the RFC does not define; it is an observed convention of
 * the official client, and two independent sources point at it. In the live
 * capture the official client sent 76 RTCP packets with byte 0 equal to 0x91
 * and 15 with 0x81, separating video feedback from the rest. The earlier
 * implementation in this repository emitted the same bit under the name
 * `whatsappVideoProfile`, recording that without it the mobile client accepts
 * the SRTCP but ignores the key-frame request.
 *
 * The parity audit read the field as a plain FMT, classified 0x91 as a bug and
 * swapped it for the canonical 0x81. That removal coincides with the caller
 * reporting `video_rx_rtcp_pli: 0` after 55 PLI+FIR sent over connections
 * confirmed good: the receiver does not count the PLI, and therefore never
 * emits a key frame.
 */
const WA_VIDEO_PROFILE_BIT = 0x10

/**
 * Fraction the report interval is spread over, redrawn after every report.
 * RFC 3550 section 6.3.1 asks for a randomized interval so endpoints that
 * started together do not stay in lockstep and burst their reports at the same
 * instant. This band is ours, following that recommendation; the configured
 * WhatsApp path compares against a flat threshold, so nothing here reproduces
 * a randomization the client was observed doing.
 */
const REPORT_INTERVAL_JITTER = 0.1
/** Ticks one millisecond of a stream clock covers, the unit the rate divides by. */
const TICKS_PER_MS = 1000

/**
 * Reception statistics for the report block of a sender report: what this
 * endpoint received from `ssrc`. Every field comes from the caller's receive
 * path, because only the caller sees the inbound stream. Nothing here is
 * derived from the send counters or estimated inside the builder.
 *
 * WhatsApp populates this block for real: across the 28 captured sender reports
 * the highest sequence number advanced with the stream and the jitter, LSR and
 * DLSR fields all carried non-zero values. An all-zero block is therefore a
 * divergence from the peer's own behavior, not a neutral default, and
 * {@link RtpStreamReception} exists so the session can fill every field from
 * what it actually received. Only `ssrc` is required so the type stays usable
 * before a stream has been observed.
 */
export interface SenderReportReception {
    /** Source being reported on: the SSRC of the peer stream this endpoint receives. */
    readonly ssrc: number
    /** Packets lost over packets expected since the previous report, as a fraction of 256. */
    readonly fractionLost?: number
    /**
     * Cumulative packets lost since reception started. Negative when duplicates
     * outnumber losses, and saturated to the signed 24-bit range the field can
     * carry.
     */
    readonly packetsLost?: number
    /** Highest 16-bit sequence number received, the low half of the extended number. */
    readonly highestSequence?: number
    /**
     * Sequence number wraps counted so far, the high half of the extended
     * number. Left at zero the field degrades to the plain 16-bit sequence,
     * which is correct for a caller that tracks no wrap count.
     */
    readonly cycles?: number
    /** Interarrival jitter, in the time units of the RTP timestamp. */
    readonly jitter?: number
    /** Middle 32 bits of the NTP timestamp of the last sender report from `ssrc`. */
    readonly lastSenderReport?: number
    /** Delay between receiving that sender report and sending this one, in 1/65536 s. */
    readonly delaySinceLastSenderReport?: number
}

/**
 * Reported when the caller passes no statistics: no source identified and
 * nothing measured. Module scope keeps the default off the per-report path.
 */
const NO_RECEPTION: SenderReportReception = { ssrc: 0 }

/** Whether the caller passed several sources to report on or a single one. */
function isReceptionList(
    reception: SenderReportReception | readonly SenderReportReception[]
): reception is readonly SenderReportReception[] {
    return Array.isArray(reception)
}

/** One 16-bit sequence space, the modulus the extended sequence number counts in. */
const SEQUENCE_CYCLE = 0x10000
/**
 * Half the sequence space. A step wider than this is read as the counter
 * wrapping rather than as a jump, which is what separates a wrap from loss.
 */
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
 * Reception statistics of one inbound RTP stream, kept so the sender report of
 * the matching outbound stream can carry a real report block.
 *
 * One instance tracks one stream. A call that carries audio and video runs two
 * of them: the streams have different SSRCs and different clock rates, their
 * sequence numbers are unrelated, and each sender report describes only the
 * stream its own SSRC identifies. Feeding one stream's report block from the
 * other's counters would report a stream the peer never sent.
 *
 * `clockRate` is the rate of the tracked stream's RTP timestamps, because the
 * jitter estimate measures arrival times against them and has to be expressed
 * in the same units.
 *
 * Everything here is derived from packets that actually arrived. The source is
 * whichever SSRC the stream turns out to carry, latched from the first packet,
 * and a packet from a different SSRC restarts the statistics under the new
 * source rather than mixing two senders into one block.
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

    constructor(clockRate: number) {
        this.clockRate = clockRate
    }

    /** SSRC the stream turned out to carry, or 0 before the first packet. */
    get sourceSsrc(): number {
        return this.stats.ssrc
    }

    /**
     * Cumulative loss as a percentage of the packets expected so far. Feeds the
     * decoder's redundancy estimate, which wants the running ratio rather than
     * the per-interval fraction the report block carries.
     */
    get lossPercent(): number {
        if (this.baseSequence < 0) return 0
        const expected = this.extendedHighest - this.baseSequence + 1
        if (expected <= 0) return 0
        const lost = expected - this.received
        return lost > 0 ? (lost / expected) * 100 : 0
    }

    /**
     * Records one received packet. Called per packet, so it allocates nothing
     * and does no work that could wait for the next report.
     *
     * `arrivalMs` is the wall clock reading at reception, converted here into
     * the stream's own clock for the jitter estimate; its resolution bounds how
     * fine that estimate can be.
     */
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
            /**
             * A forward jump this large after the stream has already wrapped once
             * is ambiguous from this one packet alone: it is either a straggler
             * reordered in from before the wrap (`previous` is the true position
             * and this packet is stale), or the first packet of a burst-loss gap
             * so large the stream effectively resumed at a new position
             * (`previous` is stale and this packet is the true one). A single
             * straggler is a one-off - traffic resumes right after `previous` -
             * while a real resumption keeps arriving up here, so the next packet
             * tells them apart: only re-anchor once the very next sequence number
             * after this one confirms it, rather than trusting anything that
             * merely lands in the same half of the space.
             *
             * Without that confirmation, treating every such packet as a
             * straggler is what froze this tracker on a real gap: `received` kept
             * climbing while `extendedHighest` stood still, driving
             * `expected - received` deeply negative and pinning `lossPercent` at
             * zero for the rest of the stream instead of surfacing the loss.
             */
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
     * Records a received RTCP packet so the next report block can echo it back.
     * A compound packet that opens with a sender report from the tracked source
     * updates the LSR/DLSR pair, which is the round-trip probe of RFC 3550
     * section 6.4.1; anything else is ignored, including a sender report from
     * another SSRC, which belongs to the other stream's tracker.
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
     * Statistics for the next report block, as of `nowMs`.
     *
     * Consumes the report interval: the loss fraction covers what happened
     * since the previous call, as RFC 3550 appendix A.3 defines it, so calling
     * this without sending the report loses that interval. The returned object
     * is reused between calls and must be read before the next one.
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
    }

    /**
     * Interarrival jitter of RFC 3550 appendix A.8, smoothed over the last
     * packets. The RTP timestamp difference is taken as a signed 32-bit value so
     * the estimate survives the timestamp wrapping mid-call.
     */
    private updateJitter(rtpTimestamp: number, arrivalTicks: number): void {
        const drift =
            arrivalTicks - this.lastArrivalTicks - ((rtpTimestamp - this.lastRtpTimestamp) | 0)
        this.lastRtpTimestamp = rtpTimestamp
        this.lastArrivalTicks = arrivalTicks
        const magnitude = drift < 0 ? -drift : drift
        this.jitter += (magnitude - this.jitter) / JITTER_GAIN
    }

    /**
     * Starts tracking `ssrc` from this packet.
     *
     * A resync of the sequence numbering is not a change of sender: when
     * `ssrc` is the source already being tracked, this is the confirmed
     * far-side jump above re-anchoring the same stream, not a new one
     * appearing, so the sender report state survives the restart. Losing it
     * would zero the round-trip probe - LSR and DLSR - on every resync during
     * a call, which is the report block going all-zero for a reason this
     * tracker itself introduced rather than the peer withholding a sender
     * report. Only an actual source change drops it, in `reset()` below.
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
 * Paces the sender reports of one outbound stream against a counter that only
 * moves forward: the outgoing RTP timestamp for an audio stream, the wall
 * clock in milliseconds for a video one. WhatsApp drives its two stream kinds
 * from those two counters, and neither of them is a packet count, so a stream
 * whose frame length or frame rate changes mid-call keeps reporting at the
 * rate it reported at before.
 *
 * Both kinds are configured as an interval in milliseconds. An audio stream
 * converts it once, when the stream is created, into the ticks of that
 * stream's own clock; the comparison itself then runs on raw RTP timestamps
 * with no conversion, which is what lets it be a plain unsigned subtraction. A
 * video stream needs no conversion because its counter already counts
 * milliseconds.
 *
 * One instance paces one stream, because the mark of the last report, the
 * clock it counts in and the interval to the next report are all per stream.
 *
 * Differences are taken modulo 2^32, so an audio schedule survives the RTP
 * timestamp wrapping mid-call: the timestamp starts at a random point of the
 * 32-bit space and a long call runs through zero.
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

    /**
     * Schedule driven by the outgoing RTP timestamp of a stream whose clock
     * runs at `clockRate`. The interval converts to ticks here, once, so a
     * stream that negotiates another sample rate reports at the same rate in
     * seconds instead of silently re-scaling.
     */
    static onMediaClock(intervalMs: number, clockRate: number): SenderReportSchedule {
        return new SenderReportSchedule(intervalMs * (clockRate / TICKS_PER_MS))
    }

    /** Schedule driven by elapsed wall time, the counter a video stream uses. */
    static onWallClock(intervalMs: number): SenderReportSchedule {
        return new SenderReportSchedule(intervalMs)
    }

    /**
     * Whether `current` closes the interval, consuming it when it does. Called
     * from the send path, so it allocates nothing: one subtraction and one
     * comparison per call, and a new threshold only on the reports themselves.
     *
     * The first call opens the interval rather than closing it, so a stream
     * whose counter starts anywhere in the 32-bit space does not report on its
     * very first packet.
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

/**
 * One extended report block at `offset`: the six words of RFC 3550 section
 * 6.4.1 describing what this endpoint received from `reception.ssrc`, then the
 * two WhatsApp words that close every block.
 */
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
 * Compound RTCP packet: a sender report followed by one SDES chunk carrying the
 * CNAME, built into a single exact-size buffer.
 *
 * The sender report partitions as 8 bytes of header and sender SSRC, 20 bytes
 * of sender info, one 32-byte report block per reported source and, on the
 * one-to-one path, a 16-byte packet trailer. A block is the RFC 3550 section
 * 6.4.1 block extended by two WhatsApp words, and because those words belong
 * to the block they repeat with it: the peer strides by 32 and takes the block
 * count from the byte length. One block emits the same bytes whether the
 * extension is read as part of the block or as the head of the trailer, so
 * only a report on two or more sources depends on the split being this one.
 *
 * The blocks describe the peer streams, so their contents arrive through
 * `reception` instead of being invented here: a list reports several sources,
 * as a group call does, and a single value takes the one-to-one path. One block
 * is the floor, an empty list included, because byte 0 was 0x81 in every one of
 * the 28 sender reports captured across two calls and never 0x80.
 *
 * Both proprietary parts sit inside the sender report and its length word
 * counts them in, so a parser that stops after the standard blocks mis-reads
 * the packet and both directions have to delimit by that word. Everything else
 * is plain RFC 3550, and captured traffic confirms the SDES does not diverge.
 *
 * Their six words were measured over those 28 reports: three trailer words were
 * zero in every one of them, the block counter climbed monotonically, the
 * converged word settled on the same value in both calls, and the live metric
 * fluctuated inside a narrow band without trending. What they mean is not
 * known, so they are reproduced as measured rather than computed from a model
 * of their meaning. The goal is a sender report the WhatsApp receiver accepts,
 * not a re-derivation of its telemetry.
 *
 * `blockCounter` drives the first extension word and must never go backwards
 * between successive reports of one call. It defaults to a value scaled off
 * `packetCount`, which is already per-call and monotonic, so two concurrent
 * calls can never share or rewind each other's counter. Pass it explicitly to
 * drive that word from session state instead.
 *
 * `withPacketTrailer` selects which of the two shapes WhatsApp builds. The
 * one-to-one path writes the four trailer words behind the blocks and is the
 * default, because that is the call this client places; the group path stops
 * at the last block, so a group report on one source is 60 bytes where a
 * one-to-one report on one source is 76. The blocks themselves are the same in
 * both, so only the length word and the bytes behind the blocks move.
 *
 * `whatsappVideoProfile` raises {@link WA_VIDEO_PROFILE_BIT} on byte 0, which
 * with one report block takes the sender report from 0x81 to 0x91. That is
 * observation, not deduction: in a capture of 105 SRTCP packets from the
 * official client, 76 were sender reports with byte 0 at 0x91. Only the video
 * sender report takes that path. The audio one was not observed carrying the
 * bit, so it stays on the canonical byte, and that is why the distinction
 * arrives here as a parameter instead of being assumed by the builder.
 *
 * The bit is not uniform across the packets this file builds: the video sender
 * report carries it, the video PLI carries it, the REMB does not. Each of those
 * bytes was read separately in the capture, so do not uniformize them by
 * symmetry.
 *
 * With the bit raised the block count shares the byte with it and fits in four
 * bits instead of five: a video sender report reports on at most
 * {@link MAX_VIDEO_REPORT_BLOCKS} sources, and the excess is clamped as it
 * already was on the audio path, keeping the count and the bytes behind it
 * coherent. In practice the session reports one source per stream, so the clamp
 * is a guarantee of the builder and not a case a one-to-one call reaches.
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
 * Head of an RTCP payload-specific feedback packet (RFC 4585 section 6.3):
 * header word, sender SSRC and media SSRC. `fciBytes` reserves the feedback
 * control information the caller fills in from offset 12 onwards and must keep
 * the packet 32-bit aligned.
 *
 * `whatsappVideoProfile` raises {@link WA_VIDEO_PROFILE_BIT} over the format
 * field. Only the picture loss indication takes that path, because that is the
 * only feedback the official client was captured marking.
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

/**
 * RFC 4585 Picture Loss Indication. Sent together with a Full Intra Request as
 * the key-frame request of a video call.
 *
 * `whatsappVideoProfile` raises {@link WA_VIDEO_PROFILE_BIT} on byte 0, taking
 * it from 0x81 to 0x91, which is the shape the official client was captured
 * emitting for video feedback. The key-frame request of a video call takes that
 * path; the default stays on the byte RFC 4585 defines.
 */
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

/**
 * RFC 5104 Full Intra Request. The media SSRC lives in the FCI entry next to
 * `sequenceNumber`, so the header field stays zero.
 */
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

const MS_PER_SECOND = 1000
const BITS_PER_OCTET = 8

/**
 * First ceiling the REMB announces, before any interval has closed.
 *
 * It is an initial ceiling, not a measurement: nothing has been measured yet
 * when it goes out. The choice is an engineering one, and the criterion is that
 * it has to sit well above the collapsed state that motivated this feedback
 * (5 packets per second, around 28 kbps) so that the first announcement already
 * gives the sender somewhere to climb from.
 */
const REMB_INITIAL_BITRATE = 300_000
/**
 * Floor of what the REMB announces, in bits per second.
 *
 * Below this there is no video call, so a lower ceiling would be the
 * announcement itself strangling the sender, exactly the defect this feedback
 * exists to remove. The floor beats the loss backoff on purpose: it is what
 * guarantees that not even the most pessimistic band announces anywhere near
 * the collapsed rate.
 *
 * It is an engineering choice, not a measurement: nothing on the wire fixed
 * this number.
 */
const REMB_MIN_BITRATE = 64_000
/**
 * Cap of what the REMB announces. Nothing was measured above this, and an
 * unbounded ceiling would turn the announcement into a promise the receive path
 * does not hold up. This too is an engineering choice, not a measurement.
 */
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
 * Next ceiling the REMB announces: the bandwidth this endpoint estimates it
 * **can** receive, which is not the bandwidth it is receiving.
 *
 * That distinction is the reason this function exists. The peer's sender uses
 * the announced value as the ceiling of its own estimator, so a rule that
 * returned the measured rate would close a self-perpetuating loop: we receive
 * 28 kbps because the sender is stuck, we announce 28 kbps, its ceiling becomes
 * 28 kbps, it stays stuck. Announcing a fixed value, or the floor, has the same
 * effect. That is why the ceiling is state carried across the intervals, and
 * the measurement enters as evidence, not as the base.
 *
 * `previous` is the ceiling announced in the previous interval, or 0 before the
 * first one. `octets` are the video payload bytes that arrived in the window
 * that just closed and `elapsedMs` is its real duration, not the nominal one:
 * the interval is drawn inside a band and only closes when a packet arrives, so
 * dividing by the nominal one would bias the rate. `lossPercent` is the
 * cumulative loss {@link RtpStreamReception} already accumulates, read without
 * consuming any interval: `report()` consumes its own, and calling it here
 * would steal from the video sender report the loss fraction it carries.
 *
 * Three bands over the previous ceiling:
 *
 * - receive path with headroom, the ceiling climbs by a multiplicative step. It
 *   climbs even if the peer did not use the headroom of the previous interval,
 *   because capacity is not usage: tying the climb to what arrived is what
 *   locks the loop when the sender is stuck for any other reason. If what
 *   arrived went past the ceiling, the measurement itself pulls the ceiling up.
 * - intermediate loss, the ceiling stays where it is. Holding the previous
 *   ceiling still leaves headroom over what arrives; holding the measured rate
 *   would be the lock.
 * - high loss, the ceiling backs off by a multiplicative step, and there it is
 *   anchored to the lower of the ceiling and the measurement: under loss the
 *   path is not carrying even what arrives, and that is the only direction in
 *   which anchoring to the measurement is right.
 *
 * The loss is cumulative over the whole call, not over the interval, so a burst
 * at the start weighs on the rest. That is the price of not consuming the
 * sender report's interval. The effect is bounded on purpose: the intermediate
 * band freezes the ceiling instead of dropping it, and the floor sits above
 * twice the collapsed rate, so not even the pessimistic band returns the sender
 * to the state it started from.
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

/**
 * REMB bitrate in the exponent-mantissa pair the field carries: 6 bits of
 * exponent over 18 of mantissa, worth `mantissa << exponent`.
 *
 * The exponent climbs until the mantissa fits in the 18 bits, and every step
 * truncates, so the encoded value never goes past the one asked for. The field
 * is a ceiling, and rounding up would announce bandwidth that was not
 * estimated. Above what the pair represents it saturates instead of wrapping.
 *
 * This holds for this transport only. The video RTP header extension carries
 * the same estimate as a plain 24-bit big-endian integer, which the client
 * parser confirmed, so it does not go through here.
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
 * Receiver Estimated Maximum Bitrate in the standard format: a PSFB of payload
 * type 206 with FMT 15, the FCI opening with `REMB` in ASCII, the source count
 * in one byte and the bitrate in a 6-bit exponent over an 18-bit mantissa.
 *
 * It is the format the official client sent us on the wire: in one capture of
 * the call, 13 packets arrived in that shape out of 105 SRTCP. There is also a
 * compact proprietary variant, at payload type 208 and 12 bytes, which this
 * file deliberately does not implement: it was not observed in this direction,
 * and two shapes in the same experiment would make the result unreadable.
 *
 * The motivation is the sender's diagnostics: `sbwe_ramp_up_count` at 0 and
 * `sbwe_ramp_down_duration` covering the whole call, with every congestion
 * trigger at zero, including `sbwe_ceiling_receive_side_count`. Nothing pushed
 * the BWE down; it never received anywhere to climb from, because the
 * receive-side path was never exercised. `missing_rtcp` at 0 rules out absent
 * RTCP: what is missing is this estimate.
 *
 * What the announced value does on the other side is become the ceiling of the
 * sender's estimator. Without REMB that term is zero and the ceiling stays at
 * the floor, which is the ramp-up that never happens. The report block and the
 * RTT do not move that ceiling: they feed the ramp-down. That is why
 * {@link nextReceiverMaxBitrate} announces estimated capacity and not the rate
 * that is arriving.
 *
 * Byte 0 does **not** carry {@link WA_VIDEO_PROFILE_BIT}, and that is
 * observation, not deduction: in the same capture the 13 REMB from the official
 * client decoded with `rtcp[0] & 0x1f` equal to 15, which only comes out of
 * 0x8f, since 0x9f would give 31. The 76 sender reports of that same capture
 * decoded as 17, which is the 0x91 already known by another route, so the two
 * readings hold each other up.
 *
 * In other words, the profile bit is not uniform across the client's video
 * packets: the sender report carries it, the REMB does not. Do not uniformize
 * them by symmetry. FMT 15 is the worst possible case for that convention,
 * because with the bit the 5-bit field saturates at 31 and a receiver comparing
 * `fmt == 15` stops matching.
 *
 * The header media SSRC stays at zero, as in the Full Intra Request: the source
 * the estimate refers to is the one listed in the FCI, and it is `mediaSsrc`,
 * the peer's video SSRC this endpoint is receiving.
 */
export function buildReceiverEstimatedMaxBitrate(
    senderSsrc: number,
    mediaSsrc: number,
    bitsPerSecond: number
): Uint8Array {
    const packet = buildPayloadSpecificFeedback(
        FMT_RECEIVER_ESTIMATED_MAX_BITRATE,
        senderSsrc,
        0,
        REMB_FCI_LENGTH
    )
    writeUInt32BE(packet, REMB_IDENTIFIER, 12)
    const band = ((1 << REMB_SSRC_COUNT_SHIFT) | encodeRembBitrate(bitsPerSecond)) >>> 0
    writeUInt32BE(packet, band, REMB_BAND_OFFSET)
    writeUInt32BE(packet, mediaSsrc, REMB_SSRC_OFFSET)
    return packet
}
