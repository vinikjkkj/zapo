/**
 * Milliseconds the clock's origin sits before its start, so a capture stamped just before
 * the start still gets its own positive tick instead of clamping to zero.
 */
export const MEDIA_CLOCK_ORIGIN_LEAD_MS = 250

/**
 * The media clock of one call: audio and video timestamps count from one origin, because
 * the receiver holds the A/V offset in microseconds in an int32 that unrelated origins overflow.
 */
export class WaMediaClock {
    /** The time source, in milliseconds on a monotonic scale. */
    readonly now: () => number
    private origin = 0
    private started = false

    constructor(now: () => number = () => performance.now()) {
        this.now = now
    }

    /** Whether the origin is fixed. */
    get isStarted(): boolean {
        return this.started
    }

    /** Fixes the origin at `atMs` (default now) minus the lead; only the first call counts. */
    start(atMs: number = this.now()): void {
        if (this.started) return
        this.started = true
        this.origin = atMs - MEDIA_CLOCK_ORIGIN_LEAD_MS
    }

    /**
     * The 32-bit RTP timestamp of `instantMs` at `clockRate`; an instant before the origin is
     * tick zero. A clock not started yet starts now.
     */
    ticksAt(instantMs: number, clockRate: number): number {
        if (!this.started) this.start()
        const elapsedMs = instantMs - this.origin
        return Math.round(((elapsedMs > 0 ? elapsedMs : 0) * clockRate) / 1000) >>> 0
    }
}

/** One block of the mapper's lag window; the window spans one to two blocks (4 to 8 s). */
const LAG_WINDOW_BLOCK_MS = 4_000

/** Least lag tolerated as latency; past it the host clock is taken as running slow. */
const LAG_TOLERANCE_MS = 25

/** Offset catch-up rate past the tolerance: 5 ms per second, the video clock 0.5% fast at most. */
const LAG_CATCH_UP_PER_MS = 0.005

/**
 * A step back in the host's stamps of at least this much is a new host epoch; a shorter one
 * is a late or reordered frame, mapped on the offset already learned.
 */
const HOST_EPOCH_STEP_BACK_MS = 1_000

/**
 * Maps host capture timestamps (any epoch) onto the plane's clock, learning the offset and
 * tracking the host clock's drift. Instants are strictly increasing, `minStepMs` apart.
 */
export class HostCaptureTimeMapper {
    private readonly minStepMs: number
    private offsetMs = 0
    private lastHostMs = 0
    private lastNowMs = 0
    private lastInstantMs = -Infinity
    private learned = false
    /** Least lag of the current block (and the previous one), relative to the current offset. */
    private blockLagMs = Infinity
    private previousBlockLagMs = Infinity
    private blockStartMs = 0

    /** `minStepMs` is one tick of the clock the instants feed. */
    constructor(minStepMs: number) {
        this.minStepMs = minStepMs
    }

    /** The plane-clock instant of a frame the host stamped `hostMs`, mapped at `nowMs`. */
    map(hostMs: number, nowMs: number): number {
        if (!this.learned || this.lastHostMs - hostMs >= HOST_EPOCH_STEP_BACK_MS) {
            // A first frame, or a host epoch of its own: nothing learned holds.
            this.learned = true
            this.offsetMs = nowMs - hostMs
            this.blockLagMs = 0
            this.previousBlockLagMs = Infinity
            this.blockStartMs = nowMs
            this.lastHostMs = hostMs
            return this.accept(nowMs, nowMs)
        }
        if (hostMs < this.lastHostMs) return this.accept(nowMs, hostMs + this.offsetMs)
        this.lastHostMs = hostMs

        let instantMs = hostMs + this.offsetMs
        if (instantMs > nowMs) {
            this.moveOffset(nowMs - instantMs)
            instantMs = nowMs
        }

        const lagMs = nowMs - instantMs
        if (nowMs - this.blockStartMs >= LAG_WINDOW_BLOCK_MS) {
            this.previousBlockLagMs = this.blockLagMs
            this.blockLagMs = lagMs
            this.blockStartMs = nowMs
        } else if (lagMs < this.blockLagMs) {
            this.blockLagMs = lagMs
        }

        // This frame is in the window, so the correction cannot push it into the future.
        const windowLagMs = Math.min(this.blockLagMs, this.previousBlockLagMs)
        if (windowLagMs > LAG_TOLERANCE_MS) {
            const catchUpMs = Math.min(
                windowLagMs - LAG_TOLERANCE_MS,
                (nowMs - this.lastNowMs) * LAG_CATCH_UP_PER_MS
            )
            this.moveOffset(catchUpMs)
            instantMs += catchUpMs
        }
        return this.accept(nowMs, instantMs)
    }

    /** Moves the offset, and the lags kept against it the other way. */
    private moveOffset(deltaMs: number): void {
        this.offsetMs += deltaMs
        this.blockLagMs -= deltaMs
        this.previousBlockLagMs -= deltaMs
    }

    /** Holds `instantMs` a step past the last one and records the frame. */
    private accept(nowMs: number, instantMs: number): number {
        const earliestMs = this.lastInstantMs + this.minStepMs
        const acceptedMs = instantMs < earliestMs ? earliestMs : instantMs
        this.lastNowMs = nowMs
        this.lastInstantMs = acceptedMs
        return acceptedMs
    }
}
