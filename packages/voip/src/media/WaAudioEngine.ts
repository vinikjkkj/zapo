import { execFile, spawn } from 'node:child_process'
import { access } from 'node:fs/promises'

import { createNoopLogger, type Logger } from 'zapo-js'
import { toBytesView, toError } from 'zapo-js/util'

import { concatBytes, TEXT_DECODER } from '../bytes.js'
import { type AudioSender, DEFAULT_AUDIO_CONFIG, type WaAudioEngineConfig } from '../types.js'

const FFMPEG_BIN = 'ffmpeg'

const EXT_FEED_PAUSE_FRACTION = 0.12
const EXT_FEED_RESUME_FRACTION = 0.06

const MAX_DECODE_BYTES = 128 * 1024 * 1024
const MAX_STDERR_CHARS = 16 * 1024

/** Longest packet the MLow decoder produces, and the aggregation it allows. */
const MAX_PACKET_MS = 120
const MAX_AGGREGATED_FRAMES = 2

/** Packets the reorder window waits on before it gives up on a hole. */
const DEFAULT_REORDER_WINDOW_PACKETS = 4
const MAX_REORDER_WINDOW_PACKETS = 16

const SEQ_SPACE = 0x1_0000
const SEQ_HALF = 0x8000

function toPowerOfTwo(value: number, max: number): number {
    let size = 1
    while (size < value && size < max) {
        size <<= 1
    }
    return size
}

const ffmpegProbeCache = new Map<string, boolean>()

function probeBinary(bin: string): Promise<boolean> {
    return new Promise((resolve) => {
        execFile(bin, ['-version'], { timeout: 5_000 }, (err) => resolve(!err))
    })
}

async function hasFfmpeg(bin: string): Promise<boolean> {
    let available = ffmpegProbeCache.get(bin)
    if (available === undefined) {
        available = await probeBinary(bin)
        if (available) {
            ffmpegProbeCache.set(bin, available)
        }
    }
    return available
}

export interface WaAudioEngineOptions extends Partial<WaAudioEngineConfig> {
    readonly logger?: Logger
    /**
     * Jitter buffer capacity expressed in maximum-size inbound packets, one of
     * which is 120 ms carrying two aggregated MLow frames. Replaces
     * `maxBufferSize`, which sizes the buffer in samples and holds three such
     * packets by default. Either way the buffer is never narrower than a single
     * packet, so one write can always land whole.
     */
    readonly jitterHeadroomPackets?: number
    /**
     * Packets the reorder window holds while waiting on a missing sequence
     * number (default 4, rounded up to a power of two, capped at 16). A packet
     * that arrives further ahead than this gives up on the hole and
     * resynchronises.
     */
    readonly reorderWindowPackets?: number
}

export interface WaAudioPlaybackStats {
    /** Samples currently queued for playback. */
    readonly buffered: number
    /** Samples the jitter buffer can hold. */
    readonly capacity: number
    /** Samples dropped because the buffer was full. */
    readonly dropped: number
    /** Packets parked in the reorder window until their predecessor arrived. */
    readonly reordered: number
    /** Packets discarded because playback had already moved past them. */
    readonly late: number
    /** Drain ticks that found less audio queued than they asked for. */
    readonly underruns: number
}

export class WaAudioEngine {
    private readonly logger: Logger
    private audioSender: AudioSender | null = null
    private audioBuffer: Float32Array | null = null
    private audioPosition = 0
    private audioFinished = false
    private onAudioFinished: (() => void) | null = null

    private playbackInterval: ReturnType<typeof setInterval> | null = null
    private captureInterval: ReturnType<typeof setInterval> | null = null

    private circularBuffer: Float32Array
    private bufferWritePos = 0
    private bufferReadPos = 0
    private bufferLength = 0

    private readonly sampleRate: number
    private readonly captureChunkSize: number
    private readonly maxBuffer: number
    private readonly maxPacketSamples: number
    private readonly outputSize: number
    private readonly intervalMs: number

    private readonly reorderWindow: number
    private readonly reorderMask: number
    private readonly reorderFrames: (Float32Array | null)[]
    private readonly reorderSeqs: Int32Array
    private reorderHeld = 0
    private nextPlaybackSeq = -1

    private playbackSink: ((pcm: Float32Array) => void) | null = null
    private droppedSamples = 0
    private reorderedPackets = 0
    private latePackets = 0
    private underruns = 0

    private silenceMode = false
    private muted = false

    private externalMode = false
    private liveWritePos = 0
    private extStarted = false
    private readonly extPreBufferSize: number
    private readonly extTargetBuffer: number
    private readonly extHighWater: number
    private readonly extMaxBuffer: number
    private extSkipCount = 0
    private extDropCount = 0

    private readonly captureChunkBuffer: Float32Array
    private readonly silenceChunkBuffer: Float32Array
    private readonly playbackOutputBuffer: Float32Array

    constructor(config: WaAudioEngineOptions = {}) {
        const c = { ...DEFAULT_AUDIO_CONFIG, ...config }
        this.logger = config.logger ?? createNoopLogger()
        this.sampleRate = c.sampleRate
        this.captureChunkSize = c.captureChunkSize
        this.intervalMs = c.intervalMs

        const samplesPerMs = this.sampleRate / 1000
        this.maxPacketSamples = Math.ceil(samplesPerMs * MAX_PACKET_MS * MAX_AGGREGATED_FRAMES)
        const requestedCapacity =
            config.jitterHeadroomPackets === undefined
                ? c.maxBufferSize
                : this.maxPacketSamples * Math.trunc(config.jitterHeadroomPackets)
        this.maxBuffer = Math.max(requestedCapacity, this.maxPacketSamples)
        this.outputSize = Math.max(c.playbackOutputSize, Math.ceil(samplesPerMs * this.intervalMs))

        this.reorderWindow = toPowerOfTwo(
            Math.max(1, Math.trunc(config.reorderWindowPackets ?? DEFAULT_REORDER_WINDOW_PACKETS)),
            MAX_REORDER_WINDOW_PACKETS
        )
        this.reorderMask = this.reorderWindow - 1
        this.reorderFrames = new Array<Float32Array | null>(this.reorderWindow).fill(null)
        this.reorderSeqs = new Int32Array(this.reorderWindow).fill(-1)

        this.circularBuffer = new Float32Array(this.maxBuffer)
        this.captureChunkBuffer = new Float32Array(this.captureChunkSize)
        this.silenceChunkBuffer = new Float32Array(this.captureChunkSize)
        this.playbackOutputBuffer = new Float32Array(this.outputSize)

        this.extPreBufferSize = Math.floor(this.sampleRate * EXT_FEED_RESUME_FRACTION)
        this.extTargetBuffer = Math.floor(this.sampleRate * 0.06)
        this.extHighWater = Math.floor(this.sampleRate * 0.45)
        this.extMaxBuffer = Math.floor(this.sampleRate * 0.75)
    }

    setAudioSender(sender: AudioSender): void {
        this.audioSender = sender
    }

    setOnAudioFinished(callback: (() => void) | null): void {
        this.onAudioFinished = callback
    }

    setExternalMode(enabled: boolean): void {
        this.externalMode = enabled
        this.extStarted = false
        this.extSkipCount = 0
        this.extDropCount = 0
        if (enabled) {
            this.audioBuffer = new Float32Array(this.extMaxBuffer)
            this.audioPosition = 0
            this.liveWritePos = 0
            this.audioFinished = false
        }
        this.logger.debug('external audio mode changed', {
            enabled,
            preBufferSamples: this.extPreBufferSize
        })
    }

    isExternalMode(): boolean {
        return this.externalMode
    }

    /**
     * Append live PCM to the external-mode buffer and return the buffered
     * level in milliseconds. Bounded: an oversized chunk keeps only its tail,
     * and overflow drops the oldest samples, so the buffer never grows past
     * its cap.
     */
    feedExternalAudio(data: Float32Array): number {
        if (!this.externalMode || !this.audioBuffer) return 0

        let incoming = data
        if (incoming.length > this.extMaxBuffer) {
            incoming = incoming.subarray(incoming.length - this.extMaxBuffer)
        }

        if (this.liveWritePos + incoming.length > this.audioBuffer.length) {
            const unconsumed = this.liveWritePos - this.audioPosition
            if (unconsumed > 0 && this.audioPosition > 0) {
                this.audioBuffer.copyWithin(0, this.audioPosition, this.liveWritePos)
            }
            this.liveWritePos = Math.max(0, unconsumed)
            this.audioPosition = 0
        }

        const overflow = this.liveWritePos + incoming.length - this.extMaxBuffer
        if (overflow > 0) {
            const drop = Math.min(overflow, this.liveWritePos)
            if (drop > 0) {
                this.audioBuffer.copyWithin(0, drop, this.liveWritePos)
                this.liveWritePos -= drop
            }
            this.extDropCount++
            if (this.extDropCount <= 5 || this.extDropCount % 100 === 0) {
                this.logger.debug('live buffer overflow, dropped oldest', {
                    droppedSamples: drop,
                    dropCount: this.extDropCount
                })
            }
        }

        this.audioBuffer.set(incoming, this.liveWritePos)
        this.liveWritePos += incoming.length

        return ((this.liveWritePos - this.audioPosition) / this.sampleRate) * 1000
    }

    getLiveBufferMs(): number {
        if (!this.externalMode || !this.audioBuffer) return 0
        return ((this.liveWritePos - this.audioPosition) / this.sampleRate) * 1000
    }

    /**
     * Backpressure watermarks for the live feed, in milliseconds: pause a
     * producer once the buffered level reaches `pauseMs`, resume once it drains
     * to `resumeMs`. Derived from the engine config, independent of any call.
     */
    static feedWatermarksMs(): { pauseMs: number; resumeMs: number } {
        return {
            pauseMs: Math.round(EXT_FEED_PAUSE_FRACTION * 1000),
            resumeMs: Math.round(EXT_FEED_RESUME_FRACTION * 1000)
        }
    }

    isAudioFinished(): boolean {
        return this.audioFinished
    }

    async loadAudioFile(audioPath: string): Promise<void> {
        this.logger.debug('loading audio file', { audioPath })

        try {
            await access(audioPath)
        } catch {
            throw new Error(`File not found: ${audioPath}`)
        }

        if (!(await hasFfmpeg(FFMPEG_BIN))) {
            throw new Error('ffmpeg not found on PATH (install ffmpeg to load audio files)')
        }

        const pcmData = await this.decodeWithFFmpeg(audioPath)
        this.audioBuffer = this.int16ToFloat32(pcmData)
        this.audioPosition = 0
        this.audioFinished = false

        const duration = this.audioBuffer.length / this.sampleRate
        this.logger.debug('audio file loaded', {
            samples: this.audioBuffer.length,
            durationSec: duration
        })
    }

    private int16ToFloat32(pcmData: Int16Array): Float32Array {
        const float32 = new Float32Array(pcmData.length)
        for (let i = 0; i < pcmData.length; i++) {
            float32[i] = pcmData[i] / 32768.0
        }

        return float32
    }

    private async decodeWithFFmpeg(inputPath: string): Promise<Int16Array> {
        return new Promise<Int16Array>((resolve, reject) => {
            const proc = spawn(
                FFMPEG_BIN,
                [
                    '-hide_banner',
                    '-loglevel',
                    'error',
                    '-i',
                    inputPath,
                    '-ac',
                    '1',
                    '-ar',
                    String(this.sampleRate),
                    '-acodec',
                    'pcm_s16le',
                    '-f',
                    's16le',
                    'pipe:1'
                ],
                { stdio: ['ignore', 'pipe', 'pipe'] }
            )

            const chunks: Uint8Array[] = []
            let decodedBytes = 0
            let stderr = ''
            let aborted = false
            proc.stdout?.on('data', (chunk: Uint8Array) => {
                if (aborted) return
                decodedBytes += chunk.length
                if (decodedBytes > MAX_DECODE_BYTES) {
                    aborted = true
                    proc.kill('SIGKILL')
                    reject(
                        new Error(`ffmpeg output exceeded ${MAX_DECODE_BYTES} bytes: ${inputPath}`)
                    )
                    return
                }
                chunks.push(toBytesView(chunk))
            })
            proc.stderr?.on('data', (chunk: Uint8Array) => {
                stderr = (stderr + TEXT_DECODER.decode(chunk)).slice(0, MAX_STDERR_CHARS)
            })
            proc.on('error', (err) =>
                reject(new Error(`ffmpeg not available (install ffmpeg on PATH): ${err.message}`))
            )
            proc.on('close', (code) => {
                if (aborted) return
                if (code !== 0) {
                    reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`))
                    return
                }
                const pcmBytes = concatBytes(chunks)
                resolve(
                    new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength >> 1)
                )
            })
        })
    }

    generateTestTone(frequency = 440, duration = 3, amplitude = 0.3): void {
        const samples = this.sampleRate * duration
        this.audioBuffer = new Float32Array(samples)
        this.audioPosition = 0
        this.audioFinished = false

        for (let i = 0; i < samples; i++) {
            const t = i / this.sampleRate
            this.audioBuffer[i] = Math.sin(2 * Math.PI * frequency * t) * amplitude
        }

        this.logger.debug('test tone generated', { samples, durationSec: duration })
    }

    startPlayback(): void {
        if (this.playbackInterval) {
            return
        }

        this.logger.debug('starting playback', {
            capacitySamples: this.maxBuffer,
            drainSamples: this.outputSize,
            reorderWindow: this.reorderWindow
        })

        this.resetBuffer()

        this.playbackInterval = setInterval(() => {
            const drained = this.readFromBuffer(this.outputSize)
            const sink = this.playbackSink
            if (!sink || drained === 0) {
                return
            }
            try {
                sink(this.playbackOutputBuffer)
            } catch (err) {
                this.logger.trace('playback sink failed', { message: toError(err).message })
            }
        }, this.intervalMs)
    }

    stopPlayback(): void {
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval)
            this.playbackInterval = null
        }
    }

    /**
     * Receive the paced playback audio. The callback is handed the engine's own
     * output buffer, which is overwritten on the next tick, so a consumer that
     * keeps the samples has to copy them.
     */
    setPlaybackSink(sink: ((pcm: Float32Array) => void) | null): void {
        this.playbackSink = sink
    }

    /** Queue decoded audio for playback without any ordering guarantee. */
    onPlaybackData(audioData: Float32Array): void {
        this.writeToBuffer(audioData)
    }

    /**
     * Queue decoded audio carrying the RTP sequence number it was decoded
     * from. A packet that arrives ahead of a missing predecessor waits in a
     * bounded window until the hole is filled, until the window is exhausted,
     * or until a packet arrives too far ahead to keep waiting. A packet
     * playback has already moved past is discarded.
     */
    onPlaybackPacket(sequenceNumber: number, audioData: Float32Array): void {
        const seq = sequenceNumber & 0xffff

        if (this.nextPlaybackSeq < 0) {
            this.writeToBuffer(audioData)
            this.nextPlaybackSeq = (seq + 1) & 0xffff
            return
        }

        const delta = (seq - this.nextPlaybackSeq + SEQ_SPACE) % SEQ_SPACE

        if (delta >= SEQ_HALF) {
            this.latePackets++
            this.logger.trace('playback packet arrived too late', {
                seq,
                expectedSeq: this.nextPlaybackSeq
            })
            return
        }

        if (delta === 0) {
            this.writeToBuffer(audioData)
            this.nextPlaybackSeq = (seq + 1) & 0xffff
            this.releaseReordered()
            return
        }

        if (delta < this.reorderWindow) {
            this.holdReordered(seq, audioData)
            return
        }

        this.flushReordered()
        this.writeToBuffer(audioData)
        this.nextPlaybackSeq = (seq + 1) & 0xffff
    }

    getPlaybackStats(): WaAudioPlaybackStats {
        return {
            buffered: this.bufferLength,
            capacity: this.maxBuffer,
            dropped: this.droppedSamples,
            reordered: this.reorderedPackets,
            late: this.latePackets,
            underruns: this.underruns
        }
    }

    /** Samples the jitter buffer accepts in a single write. */
    getMaxPacketSamples(): number {
        return this.maxPacketSamples
    }

    startSilenceCapture(): void {
        if (this.captureInterval) {
            return
        }

        this.silenceMode = true

        this.logger.debug('starting silence capture for pre-accept warmup')

        this.captureInterval = setInterval(() => {
            if (this.audioSender) {
                try {
                    this.audioSender.sendCapturedAudio(this.silenceChunkBuffer)
                } catch (err) {
                    this.logger.trace('silence send failed', { message: toError(err).message })
                }
            }
        }, this.intervalMs)
    }

    startCapture(): void {
        if (this.captureInterval && this.silenceMode) {
            clearInterval(this.captureInterval)
            this.captureInterval = null
        }

        if (this.captureInterval) {
            return
        }

        this.silenceMode = false

        if (this.externalMode) {
            this.audioPosition = Math.max(0, this.liveWritePos - this.extPreBufferSize)
            const available = this.liveWritePos - this.audioPosition
            this.extStarted = available >= this.extPreBufferSize
            this.logger.debug('starting live capture', {
                readPos: this.audioPosition,
                writePos: this.liveWritePos,
                runwaySamples: available,
                started: this.extStarted
            })
        } else {
            this.audioPosition = 0
            if (this.audioBuffer) {
                const durationSec = this.audioBuffer.length / this.sampleRate
                this.logger.debug('starting capture with loaded audio', { durationSec })
            } else {
                this.logger.debug('starting capture with silence, no audio loaded')
            }
        }

        let frameCount = 0

        this.captureInterval = setInterval(() => {
            frameCount++
            const chunk = this.getNextChunk()

            if (this.audioSender) {
                try {
                    this.audioSender.sendCapturedAudio(chunk)
                } catch (err) {
                    this.logger.trace('captured audio send failed', {
                        message: toError(err).message
                    })
                }
            }

            if (frameCount % 500 === 0) {
                if (this.audioBuffer) {
                    const positionSec = this.audioPosition / this.sampleRate
                    this.logger.trace('capture frame', { frameCount, positionSec })
                } else {
                    this.logger.trace('capture frame with silence', { frameCount })
                }
            }
        }, this.intervalMs)
    }

    stopCapture(): void {
        if (this.captureInterval) {
            clearInterval(this.captureInterval)
            this.captureInterval = null
        }
    }

    /**
     * Mute the outbound stream without tearing capture down. Capture keeps
     * ticking and feeds silence, so the encoder's DTX decides what reaches the
     * wire and the peer's inbound liveness watchdog keeps seeing a live
     * stream. Stopping capture outright would starve that watchdog on a mute
     * that outlasts it.
     */
    setMuted(muted: boolean): void {
        if (this.muted === muted) {
            return
        }
        this.muted = muted
        this.logger.debug('capture mute changed', { muted })
    }

    isMuted(): boolean {
        return this.muted
    }

    stop(): void {
        this.stopPlayback()
        this.stopCapture()
    }

    hasAudio(): boolean {
        return this.audioBuffer !== null && this.audioBuffer.length > 0
    }

    private resetBuffer(): void {
        this.bufferWritePos = 0
        this.bufferReadPos = 0
        this.bufferLength = 0
        this.clearReordered()
        this.nextPlaybackSeq = -1
    }

    private holdReordered(seq: number, data: Float32Array): void {
        const slot = seq & this.reorderMask
        const parked = this.reorderFrames[slot]
        if (parked) {
            if (this.reorderSeqs[slot] === seq) {
                this.latePackets++
                return
            }
            this.droppedSamples += parked.length
        } else {
            this.reorderHeld++
        }
        this.reorderFrames[slot] = data
        this.reorderSeqs[slot] = seq
        this.reorderedPackets++
    }

    /** Write every parked packet that is now contiguous with the playout point. */
    private releaseReordered(): void {
        while (this.reorderHeld > 0) {
            const slot = this.nextPlaybackSeq & this.reorderMask
            const parked = this.reorderFrames[slot]
            if (!parked || this.reorderSeqs[slot] !== this.nextPlaybackSeq) {
                return
            }
            this.reorderFrames[slot] = null
            this.reorderSeqs[slot] = -1
            this.reorderHeld--
            this.writeToBuffer(parked)
            this.nextPlaybackSeq = (this.nextPlaybackSeq + 1) & 0xffff
        }
    }

    /** Give up on the hole and write everything parked, in sequence order. */
    private flushReordered(): void {
        if (this.reorderHeld === 0) {
            return
        }
        for (let i = 0; i < this.reorderWindow; i++) {
            const seq = (this.nextPlaybackSeq + i) & 0xffff
            const slot = seq & this.reorderMask
            const parked = this.reorderFrames[slot]
            if (parked && this.reorderSeqs[slot] === seq) {
                this.writeToBuffer(parked)
            }
        }
        this.clearReordered()
    }

    private clearReordered(): void {
        for (let i = 0; i < this.reorderWindow; i++) {
            this.reorderFrames[i] = null
            this.reorderSeqs[i] = -1
        }
        this.reorderHeld = 0
    }

    private writeToBuffer(data: Float32Array): void {
        const capacity = this.maxBuffer
        let source = data
        if (source.length > capacity) {
            const truncated = source.length - capacity
            this.droppedSamples += truncated
            source = source.subarray(truncated)
        }
        if (source.length === 0) {
            return
        }

        const overflow = this.bufferLength + source.length - capacity
        if (overflow > 0) {
            this.bufferReadPos = (this.bufferReadPos + overflow) % capacity
            this.bufferLength -= overflow
            this.droppedSamples += overflow
            this.logger.trace('jitter buffer overflow, dropped oldest', {
                droppedSamples: overflow,
                totalDropped: this.droppedSamples
            })
        }

        const head = Math.min(source.length, capacity - this.bufferWritePos)
        this.circularBuffer.set(source.subarray(0, head), this.bufferWritePos)
        if (head < source.length) {
            this.circularBuffer.set(source.subarray(head), 0)
        }
        this.bufferWritePos = (this.bufferWritePos + source.length) % capacity
        this.bufferLength += source.length
    }

    /** Drain up to `count` samples into the output buffer, returning how many. */
    private readFromBuffer(count: number): number {
        const out = this.playbackOutputBuffer
        const wanted = Math.min(count, out.length)
        const drained = Math.min(wanted, this.bufferLength)

        if (drained < wanted) {
            this.underruns++
            out.fill(0, drained, wanted)
        }

        if (drained > 0) {
            const head = Math.min(drained, this.maxBuffer - this.bufferReadPos)
            out.set(this.circularBuffer.subarray(this.bufferReadPos, this.bufferReadPos + head), 0)
            if (head < drained) {
                out.set(this.circularBuffer.subarray(0, drained - head), head)
            }
            this.bufferReadPos = (this.bufferReadPos + drained) % this.maxBuffer
            this.bufferLength -= drained
        }

        return drained
    }

    private getNextChunk(): Float32Array {
        if (this.muted || !this.audioBuffer) {
            return this.silenceChunkBuffer
        }

        const endPos = this.externalMode ? this.liveWritePos : this.audioBuffer.length

        if (endPos === 0 || (this.audioFinished && !this.externalMode)) {
            return this.silenceChunkBuffer
        }

        if (this.externalMode) {
            const available = endPos - this.audioPosition

            if (!this.extStarted) {
                if (available < this.extPreBufferSize) {
                    return this.silenceChunkBuffer
                }
                this.extStarted = true
                this.logger.debug('live buffer ready, starting read', {
                    availableSamples: available
                })
            }

            if (available > this.extHighWater) {
                const skipTo = endPos - this.extTargetBuffer
                const skipped = skipTo - this.audioPosition
                this.audioPosition = skipTo
                this.extSkipCount++
                if (this.extSkipCount <= 5) {
                    this.logger.debug('live buffer overflow, skipped samples', {
                        availableSamples: available,
                        skippedSamples: skipped,
                        targetSamples: this.extTargetBuffer,
                        skipCount: this.extSkipCount
                    })
                }
            }

            if (this.audioPosition >= endPos) {
                return this.silenceChunkBuffer
            }
        }

        this.captureChunkBuffer.fill(0)
        for (let i = 0; i < this.captureChunkSize; i++) {
            if (this.audioPosition >= endPos) {
                if (!this.externalMode && !this.audioFinished) {
                    this.audioFinished = true
                    this.logger.debug('audio playback finished, sending silence')
                    if (this.onAudioFinished) {
                        const cb = this.onAudioFinished
                        setTimeout(() => cb(), 0)
                    }
                }
                break
            }
            this.captureChunkBuffer[i] = this.audioBuffer[this.audioPosition]!
            this.audioPosition++
        }

        return this.captureChunkBuffer
    }
}
