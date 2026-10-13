import { performance } from 'node:perf_hooks'

import { createNoopLogger, type Logger } from 'zapo-js'
import { toError } from 'zapo-js/util'

import { type AudioSender, DEFAULT_AUDIO_CONFIG, type WaAudioEngineConfig } from '../types.js'

import { decodeAudioFile } from './audio-file.js'

const EXT_FEED_PAUSE_FRACTION = 0.12
const EXT_FEED_RESUME_FRACTION = 0.06

/**
 * Chunks one tick may move to catch up with its clock, since timers fire late and coarse; a
 * longer stall is forgiven rather than replayed, capping a burst at 240 ms.
 */
const MAX_CATCH_UP_CHUNKS = 4

export interface WaAudioEngineOptions extends Partial<WaAudioEngineConfig> {
    readonly logger?: Logger
    /** Clock the pacers run on and stamp capture with, in ms; `performance.now` by default. */
    readonly now?: () => number
}

/**
 * The audio clock of a call carried in Node and its outbound source. Both pacers move every
 * chunk the elapsed time owes, so a late or coarse timer costs no audio.
 */
export class WaAudioEngine {
    private readonly logger: Logger
    private readonly now: () => number
    private audioSender: AudioSender | null = null
    private audioBuffer: Float32Array | null = null
    private audioPosition = 0
    private audioFinished = false
    private onAudioFinished: (() => void) | null = null

    private playbackInterval: ReturnType<typeof setInterval> | null = null
    private playbackStartMs = 0
    /** Playback time the clock has accounted for since it started: pulled or forgiven. */
    private playbackSamples = 0
    private playbackStalls = 0

    private captureInterval: ReturnType<typeof setInterval> | null = null
    private captureStartMs = 0
    /** Capture time the clock has accounted for since it started: handed over or forgiven. */
    private captureSamples = 0
    private captureChunks = 0
    private captureStalls = 0

    private readonly sampleRate: number
    private readonly captureChunkSize: number
    private readonly outputSize: number
    private readonly intervalMs: number

    private playoutSource: ((out: Float32Array) => number) | null = null
    private playbackSink: ((pcm: Float32Array) => void) | null = null

    private silenceMode = false

    private externalMode = false
    private liveWritePos = 0
    private extStarted = false
    private readonly extPreBufferSize: number
    private readonly extTargetBuffer: number
    private readonly extTargetMs: number
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
        this.now = config.now ?? (() => performance.now())
        this.sampleRate = c.sampleRate
        this.captureChunkSize = c.captureChunkSize
        this.intervalMs = c.intervalMs
        this.outputSize = Math.max(
            c.playbackOutputSize,
            Math.ceil((this.sampleRate / 1000) * this.intervalMs)
        )

        this.captureChunkBuffer = new Float32Array(this.captureChunkSize)
        this.silenceChunkBuffer = new Float32Array(this.captureChunkSize)
        this.playbackOutputBuffer = new Float32Array(this.outputSize)

        this.extPreBufferSize = Math.floor(this.sampleRate * EXT_FEED_RESUME_FRACTION)
        this.extTargetBuffer = Math.floor(this.sampleRate * 0.06)
        this.extTargetMs = (this.extTargetBuffer * 1000) / this.sampleRate
        this.extHighWater = Math.floor(this.sampleRate * 0.45)
        this.extMaxBuffer = Math.floor(this.sampleRate * 0.75)
    }

    setAudioSender(sender: AudioSender): void {
        this.audioSender = sender
    }

    setOnAudioFinished(callback: (() => void) | null): void {
        this.onAudioFinished = callback
    }

    /** Leaving external mode drops the live ring, so its stale samples never replay as a file. */
    setExternalMode(enabled: boolean): void {
        const wasExternal = this.externalMode
        this.externalMode = enabled
        this.extStarted = false
        this.extSkipCount = 0
        this.extDropCount = 0
        if (enabled) {
            this.audioBuffer = new Float32Array(this.extMaxBuffer)
            this.audioPosition = 0
            this.liveWritePos = 0
            this.audioFinished = false
        } else if (wasExternal) {
            this.audioBuffer = null
        }
        this.logger.debug('external audio mode changed', {
            enabled,
            preBufferSamples: this.extPreBufferSize
        })
    }

    /**
     * Appends live PCM and returns the buffered level in ms. Bounded: an oversized chunk keeps
     * its tail and overflow drops the oldest samples.
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

    /** Live-feed backpressure in ms: pause a producer at `pauseMs`, resume at `resumeMs`. */
    static feedWatermarksMs(): { pauseMs: number; resumeMs: number } {
        return {
            pauseMs: Math.round(EXT_FEED_PAUSE_FRACTION * 1000),
            resumeMs: Math.round(EXT_FEED_RESUME_FRACTION * 1000)
        }
    }

    async loadAudioFile(audioPath: string): Promise<void> {
        this.logger.debug('loading audio file', { audioPath })

        this.audioBuffer = await decodeAudioFile(audioPath, this.sampleRate)
        this.audioPosition = 0
        this.audioFinished = false

        const duration = this.audioBuffer.length / this.sampleRate
        this.logger.debug('audio file loaded', {
            samples: this.audioBuffer.length,
            durationSec: duration
        })
    }

    /** Where playback pulls decoded audio from: fills the buffer, returns the real samples. */
    setPlayoutSource(source: ((out: Float32Array) => number) | null): void {
        this.playoutSource = source
    }

    startPlayback(): void {
        if (this.playbackInterval) {
            return
        }

        this.logger.debug('starting playback', { drainSamples: this.outputSize })

        this.playbackStartMs = this.now()
        this.playbackSamples = 0
        this.playbackInterval = setInterval(() => this.tickPlayback(), this.intervalMs)
    }

    /** Pulls every block of playback time owed since the clock started, however late the timer. */
    private tickPlayback(): void {
        let owed = this.chunksOwed(this.playbackStartMs, this.playbackSamples, this.outputSize)
        if (owed <= 0) return
        if (owed > MAX_CATCH_UP_CHUNKS) {
            const forgiven = owed - MAX_CATCH_UP_CHUNKS
            owed = MAX_CATCH_UP_CHUNKS
            this.playbackSamples += forgiven * this.outputSize
            this.playbackStalls++
            if (this.playbackStalls <= 5 || this.playbackStalls % 100 === 0) {
                this.logger.debug('playback clock stalled, backlog forgiven', {
                    forgivenBlocks: forgiven,
                    stalls: this.playbackStalls
                })
            }
        }
        this.playbackSamples += owed * this.outputSize

        const source = this.playoutSource
        const sink = this.playbackSink
        if (!source || !sink) return
        for (; owed > 0; owed--) {
            let real: number
            try {
                real = source(this.playbackOutputBuffer)
            } catch (err) {
                this.logger.trace('playout pull failed', { message: toError(err).message })
                continue
            }
            if (real === 0) continue
            try {
                sink(this.playbackOutputBuffer)
            } catch (err) {
                this.logger.trace('playback sink failed', { message: toError(err).message })
            }
        }
    }

    stopPlayback(): void {
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval)
            this.playbackInterval = null
        }
    }

    /** Receives paced playback in the engine's own buffer, overwritten by the next pull. */
    setPlaybackSink(sink: ((pcm: Float32Array) => void) | null): void {
        this.playbackSink = sink
    }

    /** Starts the capture clock on warmup silence; {@link startCapture} later keeps this clock. */
    startSilenceCapture(): void {
        if (this.captureInterval) {
            return
        }

        this.silenceMode = true

        this.logger.debug('starting silence capture for pre-accept warmup')

        this.startCaptureClock()
    }

    /**
     * Switches capture to the real source (live feed, file from its start, or silence), keeping
     * a warmup clock so the stamps stay one timeline. A no-op once the real source runs.
     */
    startCapture(): void {
        if (this.captureInterval && !this.silenceMode) {
            return
        }

        this.silenceMode = false
        this.captureChunks = 0

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

        if (!this.captureInterval) {
            this.startCaptureClock()
        }
    }

    private startCaptureClock(): void {
        this.captureStartMs = this.now()
        this.captureSamples = 0
        this.captureInterval = setInterval(() => this.tickCapture(), this.intervalMs)
    }

    /** Hands over every capture chunk owed since the clock started, stamped on that clock. */
    private tickCapture(): void {
        let owed = this.chunksOwed(this.captureStartMs, this.captureSamples, this.captureChunkSize)
        if (owed > MAX_CATCH_UP_CHUNKS) {
            const forgiven = owed - MAX_CATCH_UP_CHUNKS
            owed = MAX_CATCH_UP_CHUNKS
            this.captureSamples += forgiven * this.captureChunkSize
            this.captureStalls++
            if (this.captureStalls <= 5 || this.captureStalls % 100 === 0) {
                this.logger.debug('capture clock stalled, backlog forgiven', {
                    forgivenChunks: forgiven,
                    stalls: this.captureStalls
                })
            }
        }

        const queuedMs = this.externalMode && !this.silenceMode ? this.extTargetMs : 0
        for (; owed > 0; owed--) {
            const capturedAtMs =
                this.captureStartMs + (this.captureSamples * 1000) / this.sampleRate - queuedMs
            this.captureSamples += this.captureChunkSize
            if (this.silenceMode) {
                this.sendCaptured(this.silenceChunkBuffer, capturedAtMs)
                continue
            }

            this.sendCaptured(this.getNextChunk(), capturedAtMs)
            if (++this.captureChunks % 500 === 0) {
                if (this.audioBuffer) {
                    const positionSec = this.audioPosition / this.sampleRate
                    this.logger.trace('capture chunk', { chunks: this.captureChunks, positionSec })
                } else {
                    this.logger.trace('capture chunk with silence', { chunks: this.captureChunks })
                }
            }
        }
    }

    private sendCaptured(chunk: Float32Array, capturedAtMs: number): void {
        if (!this.audioSender) return
        try {
            this.audioSender.sendCapturedAudio(chunk, capturedAtMs)
        } catch (err) {
            this.logger.trace('captured audio send failed', {
                silence: this.silenceMode,
                message: toError(err).message
            })
        }
    }

    /** Whole chunks a clock started at `startMs` owes beyond the `doneSamples` it covered. */
    private chunksOwed(startMs: number, doneSamples: number, chunkSize: number): number {
        const elapsedSamples = ((this.now() - startMs) * this.sampleRate) / 1000
        return Math.floor((elapsedSamples - doneSamples) / chunkSize)
    }

    private stopCapture(): void {
        if (this.captureInterval) {
            clearInterval(this.captureInterval)
            this.captureInterval = null
        }
    }

    /** Stops both clocks and releases the loaded audio, which can run to hundreds of MB. */
    stop(): void {
        this.stopPlayback()
        this.stopCapture()
        this.audioBuffer = null
    }

    private getNextChunk(): Float32Array {
        if (!this.audioBuffer) {
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

        const count = Math.max(0, Math.min(this.captureChunkSize, endPos - this.audioPosition))
        this.captureChunkBuffer.set(
            this.audioBuffer.subarray(this.audioPosition, this.audioPosition + count)
        )
        this.captureChunkBuffer.fill(0, count)
        this.audioPosition += count
        if (count < this.captureChunkSize && !this.externalMode && !this.audioFinished) {
            this.audioFinished = true
            this.logger.debug('audio playback finished, sending silence')
            if (this.onAudioFinished) {
                const cb = this.onAudioFinished
                setTimeout(() => cb(), 0)
            }
        }

        return this.captureChunkBuffer
    }
}
