import { toError } from '../errors.js'
import { createNoopLogger, type Logger } from '../logger.js'

import type { MlowPacketRead } from './mlow-packet.js'
import { type SenderReportReception, senderReportSourceSsrc } from './rtcp.js'
import { RtpStreamReception } from './rtp-stream-reception.js'
import { WaJitterBuffer, type WaJitterBufferStats } from './WaJitterBuffer.js'
import type { MLowCodecStats, MLowDecodeOutcome } from './WaMlowDecoder.js'

/** What the set needs of a decoder: the receive half of `MLowCodec`, so a test needs no wasm. */
export interface AudioStreamDecoder {
    decodeSequenced(
        seq: number,
        packet: Uint8Array,
        onFrame: (pcm: Float32Array) => void,
        timestamp?: number,
        stream?: 0 | 1,
        read?: MlowPacketRead
    ): MLowDecodeOutcome
    getStats(): Pick<MLowCodecStats, 'success' | 'errors' | 'plc' | 'late'>
    resetSequence(): void
    destroy(): void
}

/** One remote sender: the streams routed to it by SSRC, its main audio among them. */
export interface AudioReceiveSenderSpec {
    readonly id: string
    readonly audio: number
    readonly streams: readonly number[]
}

/** The audio of one remote sender of a group call. */
export interface AudioReceiveSenderStats {
    readonly id: string
    /** Audio packets that authenticated. */
    readonly recv: number
    readonly decoded: number
    readonly decodeErrors: number
    /** Packets that arrived behind what was already played. */
    readonly late: number
    /** Frames concealed for packets that never arrived. */
    readonly plc: number
    readonly lossPercent: number
    /** Packets on this sender's streams whose SRTP or SRTCP tag did not verify. */
    readonly authFailures: number
    /** Packets dropped because its decoder was still loading. */
    readonly decoderPending: number
    /** Audio on PT 122 (`mlow-1`), and what its decoder made of it. */
    readonly pt122Received: number
    readonly pt122Decoded: number
    readonly pt122Rejected: number
}

interface AudioReceiveSetOptions {
    /** Clock of the inbound audio RTP timestamps. */
    readonly clockRate: number
    /** Clock of the inbound video RTP timestamps. */
    readonly videoClockRate: number
    /** Playout queue of each sender, in samples. */
    readonly playoutCapacity: number
    /** Senders held at once; past it the plan's later ones are left out. */
    readonly maxSenders: number
    /** A synchronous factory attaches before it returns; a promise leaves packets pending. */
    readonly createDecoder: () => AudioStreamDecoder | Promise<AudioStreamDecoder>
    /** Each decoded frame of a sender, before the mix; `pcm` is reused after the call. */
    readonly onSenderAudio?: (senderId: string, pcm: Float32Array) => void
    readonly logger?: Logger
}

/**
 * The receive state of one remote sender. The decoder is per sender because it holds the
 * sequence position, the concealment state and the timeline of one stream: two senders
 * through one decoder interleave their sequence numbers and read as late.
 */
class AudioReceiveSender {
    readonly id: string
    audio: number
    readonly reception: RtpStreamReception
    /** The sender's first video stream heard; its report block and REMB entry. */
    readonly video: RtpStreamReception
    readonly playout: WaJitterBuffer
    /** Bound once so the per-packet decode allocates no closure. */
    readonly onDecoded: (pcm: Float32Array) => void
    decoder: AudioStreamDecoder | null = null
    retired = false
    received = 0
    authFailures = 0
    decoderPending = 0
    pt122Received = 0
    pt122Decoded = 0
    pt122Rejected = 0
    /** When an authenticated packet of any of its streams last arrived. */
    lastHeardMs = 0
    receiving = false

    constructor(
        spec: AudioReceiveSenderSpec,
        options: AudioReceiveSetOptions,
        playoutLogger: Logger
    ) {
        this.id = spec.id
        this.audio = spec.audio
        this.reception = new RtpStreamReception(options.clockRate)
        this.video = new RtpStreamReception(options.videoClockRate)
        this.playout = new WaJitterBuffer(options.playoutCapacity, playoutLogger)
        const onSenderAudio = options.onSenderAudio
        this.onDecoded = onSenderAudio
            ? (pcm) => {
                  this.playout.write(pcm)
                  try {
                      onSenderAudio(this.id, pcm)
                  } catch (err: unknown) {
                      playoutLogger.warn('sender audio handler failed', {
                          message: toError(err).message
                      })
                  }
              }
            : (pcm) => this.playout.write(pcm)
    }

    stats(): AudioReceiveSenderStats {
        const decoded = this.decoder?.getStats()
        return {
            id: this.id,
            recv: this.received,
            decoded: decoded?.success ?? 0,
            decodeErrors: decoded?.errors ?? 0,
            late: decoded?.late ?? 0,
            plc: decoded?.plc ?? 0,
            lossPercent: Math.round(this.reception.lossPercent * 10) / 10,
            authFailures: this.authFailures,
            decoderPending: this.decoderPending,
            pt122Received: this.pt122Received,
            pt122Decoded: this.pt122Decoded,
            pt122Rejected: this.pt122Rejected
        }
    }

    destroy(): void {
        this.retired = true
        this.decoder?.destroy()
        this.decoder = null
        this.playout.reset()
    }
}

/**
 * The inbound media of a group call by remote sender: one decoder and one playout queue each,
 * mixed on the host's clock by {@link pullPlayout}, a video reception each, and whether each is
 * being heard.
 */
export class AudioReceiveSet {
    private readonly options: AudioReceiveSetOptions
    private readonly logger: Logger
    private readonly senders = new Map<string, AudioReceiveSender>()
    private readonly bySsrc = new Map<number, AudioReceiveSender>()
    /** One sender's samples for the mix, sized to the host's block. */
    private mixScratch = new Float32Array(0)
    private mixUnderruns = 0

    constructor(options: AudioReceiveSetOptions) {
        this.options = options
        this.logger = options.logger ?? createNoopLogger()
    }

    get size(): number {
        return this.senders.size
    }

    /** Whether `ssrc` belongs to a sender of the set. */
    has(ssrc: number): boolean {
        return this.bySsrc.has(ssrc)
    }

    /** The sender owning `ssrc`, by its plan id. */
    senderIdOf(ssrc: number): string | undefined {
        return this.bySsrc.get(ssrc)?.id
    }

    /**
     * Makes the set exactly `specs`: a new sender's decoder starts loading now, a sender left
     * out is torn down with its decoder and queued audio, a kept one keeps both. Returns the
     * senders left out that were being heard.
     */
    sync(specs: readonly AudioReceiveSenderSpec[]): string[] {
        const wanted = new Map<string, AudioReceiveSenderSpec>()
        for (const spec of specs) {
            if (wanted.size === this.options.maxSenders) {
                this.logger.debug('group senders past the bound left out', {
                    senders: specs.length,
                    maxSenders: this.options.maxSenders
                })
                break
            }
            wanted.set(spec.id, spec)
        }

        const silenced: string[] = []
        for (const [id, sender] of this.senders) {
            if (wanted.has(id)) continue
            if (sender.receiving) silenced.push(id)
            sender.destroy()
            this.senders.delete(id)
        }

        this.bySsrc.clear()
        for (const spec of wanted.values()) {
            let sender = this.senders.get(spec.id)
            if (sender) {
                sender.audio = spec.audio
            } else {
                sender = new AudioReceiveSender(
                    spec,
                    this.options,
                    this.logger.child({ component: 'playout', sender: spec.id })
                )
                this.senders.set(spec.id, sender)
                this.startDecoder(sender)
            }
            this.bySsrc.set(spec.audio, sender)
            for (const ssrc of spec.streams) this.bySsrc.set(ssrc, sender)
        }
        return silenced
    }

    /**
     * Records an authenticated packet on `ssrc` at `nowMs`; returns the sender's id when this
     * starts it being heard.
     */
    noteHeard(ssrc: number, nowMs: number): string | undefined {
        const sender = this.bySsrc.get(ssrc)
        if (!sender) return undefined
        sender.lastHeardMs = nowMs
        if (sender.receiving) return undefined
        sender.receiving = true
        return sender.id
    }

    /** The senders heard before and not for `silenceMs` up to `nowMs`, no longer heard now. */
    takeSilent(nowMs: number, silenceMs: number): string[] {
        const silent: string[] = []
        for (const sender of this.senders.values()) {
            if (!sender.receiving || nowMs - sender.lastHeardMs < silenceMs) continue
            sender.receiving = false
            silent.push(sender.id)
        }
        return silent
    }

    /** Feeds a video packet to its sender's video reception, which follows its first stream. */
    observeVideo(ssrc: number, seq: number, timestamp: number, arrivalMs: number): void {
        const video = this.bySsrc.get(ssrc)?.video
        if (!video) return
        const followed = video.sourceSsrc
        if (followed === 0 || followed === ssrc) video.observe(ssrc, seq, timestamp, arrivalMs)
    }

    /** One video report block per sender heard; see {@link receptionReports}. */
    videoReceptionReports(nowMs: number): SenderReportReception[] {
        const reports: SenderReportReception[] = []
        for (const sender of this.senders.values()) {
            if (sender.video.sourceSsrc === 0) continue
            reports.push(sender.video.report(nowMs))
        }
        return reports
    }

    /** The video stream of every sender heard, in sender order. */
    videoSourceSsrcs(): number[] {
        const ssrcs: number[] = []
        for (const sender of this.senders.values()) {
            if (sender.video.sourceSsrc !== 0) ssrcs.push(sender.video.sourceSsrc)
        }
        return ssrcs
    }

    /** The worst cumulative video loss among the senders. */
    videoPeakLossPercent(): number {
        let peak = 0
        for (const sender of this.senders.values()) {
            const loss = sender.video.lossPercent
            if (loss > peak) peak = loss
        }
        return peak
    }

    /**
     * Feeds one authenticated audio packet to its sender's decoder: `stream` 0 is PT 120 and 1
     * is PT 121, numbered apart on the sender's timeline. `null` when no sender owns `ssrc` or
     * its decoder is still loading.
     */
    receive(
        ssrc: number,
        seq: number,
        timestamp: number,
        payload: Uint8Array,
        stream: 0 | 1,
        arrivalMs: number,
        read?: MlowPacketRead
    ): MLowDecodeOutcome | null {
        const sender = this.bySsrc.get(ssrc)
        if (!sender) return null
        sender.received++
        const followed = sender.reception.sourceSsrc
        if (stream === 0 || followed === 0 || followed === ssrc) {
            sender.reception.observe(ssrc, seq, timestamp, arrivalMs)
        }
        const decoder = sender.decoder
        if (!decoder) {
            sender.decoderPending++
            return null
        }
        return decoder.decodeSequenced(seq, payload, sender.onDecoded, timestamp, stream, read)
    }

    /** Counts a PT 122 packet against its sender, with what {@link receive} made of it. */
    countPt122(ssrc: number, outcome: MLowDecodeOutcome | null): void {
        const sender = this.bySsrc.get(ssrc)
        if (!sender) return
        sender.pt122Received++
        if (outcome === 'decoded') sender.pt122Decoded++
        else if (outcome === 'rejected') sender.pt122Rejected++
    }

    /** Counts a packet on `ssrc` that failed authentication; false when no sender owns it. */
    noteAuthFailure(ssrc: number): boolean {
        const sender = this.bySsrc.get(ssrc)
        if (!sender) return false
        sender.authFailures++
        return true
    }

    /** Hands a sender report to the tracker of the sender it describes. */
    observeSenderReport(rtcp: Uint8Array, arrivalMs: number): void {
        const source = senderReportSourceSsrc(rtcp)
        if (source === null) return
        const sender = this.bySsrc.get(source)
        sender?.reception.observeSenderReport(rtcp, arrivalMs)
        sender?.video.observeSenderReport(rtcp, arrivalMs)
    }

    /**
     * One report block per sender heard from, each the tracker's reused object: hand the list
     * to the builder before the next call.
     */
    receptionReports(nowMs: number): SenderReportReception[] {
        const reports: SenderReportReception[] = []
        for (const sender of this.senders.values()) {
            if (sender.reception.sourceSsrc === 0) continue
            reports.push(sender.reception.report(nowMs))
        }
        return reports
    }

    /** Loss of the sender owning `ssrc` since the last call for it; 0 for no sender. */
    takeLossPercent(ssrc: number): number {
        return this.bySsrc.get(ssrc)?.reception.takeLossPercent() ?? 0
    }

    /** The worst cumulative loss among the senders: the one uplink encoder protects the worst leg. */
    peakLossPercent(): number {
        let peak = 0
        for (const sender of this.senders.values()) {
            const loss = sender.reception.lossPercent
            if (loss > peak) peak = loss
        }
        return peak
    }

    /**
     * Mixes every sender's next samples into `out`, summed and clipped to [-1, 1], and returns
     * how many hold audio; the rest is silence.
     */
    pullPlayout(out: Float32Array): number {
        out.fill(0)
        if (this.mixScratch.length !== out.length) this.mixScratch = new Float32Array(out.length)
        const scratch = this.mixScratch
        let real = 0
        for (const sender of this.senders.values()) {
            if (sender.playout.buffered === 0) continue
            const drained = sender.playout.read(scratch)
            if (drained > real) real = drained
            for (let i = 0; i < drained; i++) out[i] += scratch[i]
        }
        for (let i = 0; i < real; i++) {
            const sample = out[i]
            if (sample > 1) out[i] = 1
            else if (sample < -1) out[i] = -1
        }
        if (real < out.length) this.mixUnderruns++
        return real
    }

    /** The senders' queues as one: the fullest one's backlog, drops summed, mixes left short. */
    get playoutStats(): WaJitterBufferStats {
        let buffered = 0
        let dropped = 0
        for (const sender of this.senders.values()) {
            const stats = sender.playout.stats
            if (stats.buffered > buffered) buffered = stats.buffered
            dropped += stats.dropped
        }
        return {
            buffered,
            capacity: this.options.playoutCapacity,
            dropped,
            underruns: this.mixUnderruns
        }
    }

    /** Forgets every sender's sequence position and reception, as after new SRTP contexts. */
    resetSequences(): void {
        for (const sender of this.senders.values()) {
            sender.decoder?.resetSequence()
            sender.reception.reset()
        }
    }

    /** Empties every sender's playout queue. */
    resetPlayout(): void {
        for (const sender of this.senders.values()) sender.playout.reset()
    }

    stats(): AudioReceiveSenderStats[] {
        const stats: AudioReceiveSenderStats[] = []
        for (const sender of this.senders.values()) stats.push(sender.stats())
        return stats
    }

    clear(): void {
        for (const sender of this.senders.values()) sender.destroy()
        this.senders.clear()
        this.bySsrc.clear()
    }

    private startDecoder(sender: AudioReceiveSender): void {
        let created: AudioStreamDecoder | Promise<AudioStreamDecoder>
        try {
            created = this.options.createDecoder()
        } catch (err: unknown) {
            this.logDecoderFailure(sender, err)
            return
        }
        if (!isPromiseLike(created)) {
            sender.decoder = created
            return
        }
        void created.then(
            (decoder) => {
                if (sender.retired) decoder.destroy()
                else sender.decoder = decoder
            },
            (err: unknown) => this.logDecoderFailure(sender, err)
        )
    }

    private logDecoderFailure(sender: AudioReceiveSender, err: unknown): void {
        this.logger.warn('group sender decoder failed to load', {
            sender: sender.id,
            message: toError(err).message
        })
    }
}

function isPromiseLike(
    value: AudioStreamDecoder | Promise<AudioStreamDecoder>
): value is Promise<AudioStreamDecoder> {
    return typeof (value as Promise<AudioStreamDecoder>).then === 'function'
}
