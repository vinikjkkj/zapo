/** How long an accepted, sending call may hear no peer media before WebRTC legs re-allocate. */
const DOWNLINK_REALLOCATE_AFTER_MS = 5_000
/** How much longer before they are redialled; doubled after each redial of the same call. */
const DOWNLINK_REDIAL_AFTER_MS = 5_000
/** Redials of stalled WebRTC legs per call. */
export const DOWNLINK_MAX_REDIALS = 3

export interface WaRelayDownlinkWatchdogOptions {
    readonly now: () => number
    /** Re-allocates the open WebRTC legs on their connections. */
    readonly reallocate: (stalledMs: number) => void
    /** Redials the newest WebRTC legs; whether any was. `attempt` counts from 1. */
    readonly redial: (stalledMs: number, attempt: number) => boolean
}

/**
 * Recovers WebRTC legs that keep answering while no peer media arrives on any leg: past
 * `DOWNLINK_REALLOCATE_AFTER_MS` they re-allocate on the same connection, and
 * `DOWNLINK_REDIAL_AFTER_MS` later the newest generation's WebRTC legs are redialled, with
 * backoff and at most `DOWNLINK_MAX_REDIALS` times per call. Raw legs police their own
 * return path.
 */
export class WaRelayDownlinkWatchdog {
    private readonly now: () => number
    private readonly reallocate: (stalledMs: number) => void
    private readonly redial: (stalledMs: number, attempt: number) => boolean
    /**
     * Since when no leg heard authenticated peer media (RTP or SRTCP) while the accepted call
     * sends; `null` until the next send after the call is accepted or the peer is heard.
     */
    private stalledSince: number | null = null
    private reallocated = false
    private redials = 0

    constructor(options: WaRelayDownlinkWatchdogOptions) {
        this.now = options.now
        this.reallocate = options.reallocate
        this.redial = options.redial
    }

    /** Called on each media send of an accepted call. */
    onSend(): void {
        const now = this.now()
        if (this.stalledSince === null) {
            this.stalledSince = now
            return
        }
        const stalledMs = Math.round(now - this.stalledSince)
        if (!this.reallocated) {
            if (stalledMs < DOWNLINK_REALLOCATE_AFTER_MS) return
            this.reallocated = true
            this.reallocate(stalledMs)
            return
        }
        if (this.redials >= DOWNLINK_MAX_REDIALS) return
        const redialAfterMs =
            DOWNLINK_REALLOCATE_AFTER_MS + DOWNLINK_REDIAL_AFTER_MS * 2 ** this.redials
        if (stalledMs < redialAfterMs) return
        if (this.redial(stalledMs, this.redials + 1)) this.redials++
        this.stalledSince = now
        this.reallocated = false
    }

    notePeerMedia(): void {
        this.stalledSince = null
        this.reallocated = false
    }

    reset(): void {
        this.stalledSince = null
        this.reallocated = false
        this.redials = 0
    }
}
