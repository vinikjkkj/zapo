import { readUInt32BE } from '../bytes.js'

import { PT_SENDER_REPORT, type SenderReportReception, SR_REPORT_BLOCK_OFFSET } from './rtcp.js'

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
