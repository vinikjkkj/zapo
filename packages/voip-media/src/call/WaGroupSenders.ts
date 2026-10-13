import { hexSsrc } from '../bytes.js'
import { type SrtcpSession, SRTP_MAX_RECV_CONTEXTS, type SrtpSession } from '../crypto/srtp.js'
import type { Logger } from '../logger.js'
import { AudioReceiveSet } from '../media/audio-receive-set.js'
import { MLowCodec, type MLowCompanionModelSource } from '../media/mlow-codec.js'
import type { WaMediaClock } from '../media/WaMediaClock.js'
import { unrefTimer } from '../timers.js'
import { AUDIO_SAMPLE_RATE, type SrtpKeyingMaterial, VIDEO_CLOCK_RATE } from '../types.js'

import type { WaCallMediaSender } from './plan.js'

/**
 * Silence after which a group sender counts as no longer received, by default: the time a peer
 * waits before it reports another participant invisible.
 */
const DEFAULT_SENDER_SILENCE_MS = 20_000
/** How often group senders are checked for that silence, at most. */
const SENDER_SILENCE_CHECK_MS = 1_000

/**
 * Remote senders of a group call given a decoder at once: the compiled participant ceiling.
 * A sender is a device, so a roster of many multi-device accounts can pass it.
 */
const MAX_GROUP_SENDERS = 64

export interface WaGroupSendersOptions {
    readonly logger: Logger
    readonly clock: WaMediaClock
    readonly companionModel: MLowCompanionModelSource | undefined
    readonly playoutCapacity: number
    readonly silenceMs?: number
    readonly onSenderAudio?: (senderId: string, pcm: Float32Array) => void
    /** A sender's media started (`true`) or went silent (`false`). */
    readonly onSenderMedia: (senderId: string, receiving: boolean) => void
    /** `ssrc` lost its receive keying: no sender of the plan owns it any more. */
    readonly onUnkeyed: (ssrc: number) => void
}

/**
 * The remote senders of a group call: their receive set and decoders, the SSRCs keyed for them,
 * the gate on unplanned SSRCs, the stream the audio REMB names, and the silence watch.
 */
export class WaGroupSenders {
    private readonly logger: Logger
    private readonly clock: WaMediaClock
    private readonly companionModel: MLowCompanionModelSource | undefined
    private readonly playoutCapacity: number
    private readonly silenceMs: number
    private readonly onSenderAudio: ((senderId: string, pcm: Float32Array) => void) | undefined
    private readonly onSenderMedia: (senderId: string, receiving: boolean) => void
    private readonly onUnkeyed: (ssrc: number) => void

    /** Set by a non-null `group` section: a decoder per remote sender, mixed for playout. */
    private receiveSet: AudioReceiveSet | null = null
    private senders: readonly WaCallMediaSender[] = []
    /** SSRCs the group's receive keying is installed on, in SRTP and SRTCP alike. */
    private readonly keyed = new Set<number>()
    /** The one group stream the audio REMB names: the first heard, until its sender leaves. */
    private rembSsrc = 0
    private silenceTimer: ReturnType<typeof setInterval> | null = null
    private closed = false
    /** Group packets on an SSRC the plan keys for no sender, dropped before SRTP. */
    private unplannedPacketCount = 0

    constructor(options: WaGroupSendersOptions) {
        this.logger = options.logger
        this.clock = options.clock
        this.companionModel = options.companionModel
        this.playoutCapacity = options.playoutCapacity
        this.silenceMs = options.silenceMs ?? DEFAULT_SENDER_SILENCE_MS
        this.onSenderAudio = options.onSenderAudio
        this.onSenderMedia = options.onSenderMedia
        this.onUnkeyed = options.onUnkeyed
    }

    /** The receive set while in group mode, or `null` on a 1:1 call. */
    get audio(): AudioReceiveSet | null {
        return this.receiveSet
    }

    get keyedCount(): number {
        return this.keyed.size
    }

    get unplannedPackets(): number {
        return this.unplannedPacketCount
    }

    /** Enters group mode with a fresh receive set; returns whether it was not in it already. */
    open(): boolean {
        if (this.receiveSet) return false
        this.receiveSet = new AudioReceiveSet({
            clockRate: AUDIO_SAMPLE_RATE,
            videoClockRate: VIDEO_CLOCK_RATE,
            playoutCapacity: this.playoutCapacity,
            maxSenders: MAX_GROUP_SENDERS,
            createDecoder: () => this.createSenderDecoder(),
            onSenderAudio: this.onSenderAudio,
            logger: this.logger.child({ component: 'group-audio' })
        })
        return true
    }

    /**
     * Applies the plan's senders, past the ceiling dropped, to the set {@link open} made: each
     * gets a decoder and its receive keying on every one of its SSRCs. Returns the kept senders.
     */
    update(
        listed: readonly WaCallMediaSender[],
        srtp: SrtpSession | null,
        srtcp: SrtcpSession | null
    ): readonly WaCallMediaSender[] {
        const senders =
            listed.length > MAX_GROUP_SENDERS ? listed.slice(0, MAX_GROUP_SENDERS) : listed
        const audio = this.receiveSet!
        this.senders = senders
        for (const senderId of audio.sync(senders)) this.onSenderMedia(senderId, false)
        if (!audio.has(this.rembSsrc)) this.rembSsrc = 0
        this.installRecvKeys(srtp, srtcp)
        return senders
    }

    /** Leaves group mode, unkeying every sender; returns whether it was in it. */
    leave(srtp: SrtpSession | null, srtcp: SrtcpSession | null): boolean {
        const audio = this.receiveSet
        if (!audio) return false
        this.senders = []
        this.installRecvKeys(srtp, srtcp)
        for (const senderId of audio.sync([])) this.onSenderMedia(senderId, false)
        audio.clear()
        this.receiveSet = null
        this.rembSsrc = 0
        this.stopSilenceWatch()
        return true
    }

    /** Keys every sender again on new receive sessions. */
    rekey(srtp: SrtpSession | null, srtcp: SrtcpSession | null): void {
        this.keyed.clear()
        this.installRecvKeys(srtp, srtcp)
    }

    /**
     * In a group call, drops a packet on an SSRC the plan keys for no sender before SRTP sees
     * it: a context keyed lazily with the call's own key could evict one of a sender's.
     */
    dropsUnplanned(ssrc: number): boolean {
        if (!this.receiveSet || this.keyed.has(ssrc)) return false
        const dropped = ++this.unplannedPacketCount
        if (dropped === 1 || dropped % 500 === 0) {
            this.logger.debug('group packet on an unplanned ssrc dropped', {
                packets: dropped,
                ssrc: hexSsrc(ssrc)
            })
        }
        return true
    }

    /** Whether the audio REMB names `ssrc`, the first stream heard following it from then on. */
    takesAudioRemb(ssrc: number): boolean {
        if (this.rembSsrc === 0) this.rembSsrc = ssrc
        return ssrc === this.rembSsrc
    }

    /** Starts the silence watch, once; each check reports the senders gone quiet. */
    watchSilence(): void {
        if (this.silenceTimer || this.closed) return
        this.silenceTimer = setInterval(
            () => {
                const group = this.receiveSet
                if (!group) return
                for (const senderId of group.takeSilent(this.clock.now(), this.silenceMs)) {
                    this.onSenderMedia(senderId, false)
                }
            },
            Math.min(SENDER_SILENCE_CHECK_MS, this.silenceMs)
        )
        unrefTimer(this.silenceTimer)
    }

    /** Stops the silence watch for good. */
    close(): void {
        this.closed = true
        this.stopSilenceWatch()
    }

    clear(): void {
        this.receiveSet?.clear()
        this.receiveSet = null
        this.keyed.clear()
    }

    /** The decoder of one group sender: no encoder, the call's Companion if it has one. */
    createSenderDecoder(): Promise<MLowCodec> {
        return MLowCodec.create({
            logger: this.logger.child({ component: 'mlow' }),
            companionModel: this.companionModel,
            decodeOnly: true
        })
    }

    private stopSilenceWatch(): void {
        if (!this.silenceTimer) return
        clearInterval(this.silenceTimer)
        this.silenceTimer = null
    }

    /**
     * Keys every SSRC of the group's senders on the receive sessions and drops the ones no longer
     * listed. Same material keeps a context and its replay window; the bound grows first.
     */
    private installRecvKeys(srtp: SrtpSession | null, srtcp: SrtcpSession | null): void {
        if (!srtp || !srtcp) return

        const wanted = new Map<number, SrtpKeyingMaterial>()
        for (const sender of this.senders) {
            wanted.set(sender.audio, sender.recv)
            for (const ssrc of sender.streams) wanted.set(ssrc, sender.recv)
        }
        for (const ssrc of this.keyed) {
            if (wanted.has(ssrc)) continue
            srtp.deleteRecvContext(ssrc)
            srtcp.deleteRecvContext(ssrc)
            this.keyed.delete(ssrc)
            this.onUnkeyed(ssrc)
        }

        const bound = wanted.size + SRTP_MAX_RECV_CONTEXTS
        if (bound > srtp.maxRecvContexts) {
            srtp.setMaxRecvContexts(bound)
            srtcp.setMaxRecvContexts(bound)
        }
        for (const [ssrc, keying] of wanted) {
            srtp.setRecvKeying(ssrc, keying)
            srtcp.setRecvKeying(ssrc, keying)
            this.keyed.add(ssrc)
        }
        if (bound < srtp.maxRecvContexts) {
            srtp.setMaxRecvContexts(bound)
            srtcp.setMaxRecvContexts(bound)
        }
    }
}
