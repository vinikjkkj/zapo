import { performance } from 'node:perf_hooks'

/**
 * Why our video is held, which picks its release sign: the peer's camera turning on after
 * an accepted upgrade, or its first `<mute_v2>` after the accept of a born-video call.
 */
export type PeerVideoReadyTrigger = 'upgrade' | 'born-video'

/** Wait after the peer's camera turns on: the sign can beat the peer's inbound stream setup. */
export const UPGRADE_VIDEO_READY_GUARD_MS = 300

/** Longest wait from the accept for a peer that never turns its camera on after an upgrade. */
export const UPGRADE_VIDEO_READY_TIMEOUT_MS = 3_000

/** Wait after the peer's first `<mute_v2>` on a born-video call; the sign can beat its setup. */
export const BORN_VIDEO_READY_GUARD_MS = 150

/** Longest wait from the accept for a peer that sends no `<mute_v2>` on a born-video call. */
export const BORN_VIDEO_READY_TIMEOUT_MS = 2_000

/** The guard and the timeout each trigger runs on. */
const PEER_VIDEO_READY_TIMINGS: Readonly<
    Record<PeerVideoReadyTrigger, { readonly guardMs: number; readonly timeoutMs: number }>
> = Object.freeze({
    upgrade: { guardMs: UPGRADE_VIDEO_READY_GUARD_MS, timeoutMs: UPGRADE_VIDEO_READY_TIMEOUT_MS },
    'born-video': { guardMs: BORN_VIDEO_READY_GUARD_MS, timeoutMs: BORN_VIDEO_READY_TIMEOUT_MS }
})

/** What let our video go: the peer said it was ready, or it never did in time. */
export type PeerVideoReadyGateReason = 'peer-ready' | 'timeout'

/**
 * Holds our video from the accept until the peer can take it: if our first packet beats the
 * peer's inbound stream, WhatsApp Web shows only our key frames for the rest of the call.
 */
export class WaPeerVideoReadyGate {
    private readonly onOpen: (
        reason: PeerVideoReadyGateReason,
        trigger: PeerVideoReadyTrigger,
        heldMs: number
    ) => void
    /** What the current hold waits on, or `null` while nothing is held. */
    private heldFor: PeerVideoReadyTrigger | null = null
    private readonly now: () => number
    /** When the hold started, on {@link now}; meaningful only while held. */
    private heldSince = 0
    private guardTimer: ReturnType<typeof setTimeout> | null = null
    private timeoutTimer: ReturnType<typeof setTimeout> | null = null

    /**
     * `onOpen` runs once per hold, when it lets the video go, never on {@link cancel}. `now` times
     * the hold in ms, on a monotonic clock so a wall-clock change cannot skew it.
     */
    constructor(
        onOpen: (
            reason: PeerVideoReadyGateReason,
            trigger: PeerVideoReadyTrigger,
            heldMs: number
        ) => void,
        now: () => number = () => performance.now()
    ) {
        this.onOpen = onOpen
        this.now = now
    }

    get isHeld(): boolean {
        return this.heldFor !== null
    }

    /** Starts holding our video for `trigger`; its timeout counts from now. No-op while held. */
    hold(trigger: PeerVideoReadyTrigger): void {
        if (this.heldFor !== null) return
        this.heldFor = trigger
        this.heldSince = this.now()
        this.timeoutTimer = setTimeout(
            () => this.open('timeout'),
            PEER_VIDEO_READY_TIMINGS[trigger].timeoutMs
        )
        // A guard timer must not keep an otherwise idle program alive.
        this.timeoutTimer.unref?.()
    }

    /**
     * The peer gave `trigger`'s sign: the video goes once its guard runs. Only counts during a
     * hold of the same trigger; the first sign starts the guard.
     */
    markPeerReady(trigger: PeerVideoReadyTrigger): void {
        if (this.heldFor !== trigger || this.guardTimer) return
        this.guardTimer = setTimeout(
            () => this.open('peer-ready'),
            PEER_VIDEO_READY_TIMINGS[trigger].guardMs
        )
        this.guardTimer.unref?.()
    }

    /** Stops holding without letting the video go: the call is over. */
    cancel(): void {
        this.heldFor = null
        if (this.guardTimer) {
            clearTimeout(this.guardTimer)
            this.guardTimer = null
        }
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer)
            this.timeoutTimer = null
        }
    }

    private open(reason: PeerVideoReadyGateReason): void {
        const trigger = this.heldFor
        if (trigger === null) return
        const heldMs = this.now() - this.heldSince
        this.cancel()
        this.onOpen(reason, trigger, heldMs)
    }
}
