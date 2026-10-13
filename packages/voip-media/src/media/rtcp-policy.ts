/** When RTCP goes out (randomized report pacing) and what bitrate the REMB announces. */

/** Fraction the report interval is spread over, redrawn per report, as RFC 3550 6.3.1 advises. */
const REPORT_INTERVAL_JITTER = 0.1
/** Ticks one millisecond of a stream clock covers, the unit the rate divides by. */
const TICKS_PER_MS = 1000

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
