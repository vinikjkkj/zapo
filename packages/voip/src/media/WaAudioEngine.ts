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
    private readonly outputSize: number
    private readonly intervalMs: number

    private silenceMode = false

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
        this.maxBuffer = c.maxBufferSize
        this.outputSize = c.playbackOutputSize
        this.intervalMs = c.intervalMs
        this.circularBuffer = new Float32Array(this.maxBuffer)
        this.captureChunkBuffer = new Float32Array(this.captureChunkSize)
        this.silenceChunkBuffer = new Float32Array(this.captureChunkSize)
        this.playbackOutputBuffer = new Float32Array(this.outputSize)

        this.extPreBufferSize = Math.floor(this.sampleRate * EXT_FEED_RESUME_FRACTION)
        this.extTargetBuffer = Math.floor(this.sampleRate * 0.06)
        this.extHighWater = Math.floor(this.sampleRate * 0.2)
        this.extMaxBuffer = Math.floor(this.sampleRate * 0.5)
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

        this.logger.debug('starting playback')

        this.resetBuffer()

        this.playbackInterval = setInterval(() => {
            this.readFromBuffer(this.outputSize)
        }, this.intervalMs)
    }

    stopPlayback(): void {
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval)
            this.playbackInterval = null
        }
    }

    onPlaybackData(audioData: Float32Array): void {
        this.writeToBuffer(audioData)
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
    }

    private writeToBuffer(data: Float32Array): void {
        for (let i = 0; i < data.length && this.bufferLength < this.maxBuffer; i++) {
            this.circularBuffer[this.bufferWritePos] = data[i]!
            this.bufferWritePos = (this.bufferWritePos + 1) % this.maxBuffer
            this.bufferLength++
        }
    }

    private readFromBuffer(count: number): Float32Array {
        this.playbackOutputBuffer.fill(0)
        for (let i = 0; i < count; i++) {
            if (this.bufferLength > 0) {
                this.playbackOutputBuffer[i] = this.circularBuffer[this.bufferReadPos]!
                this.bufferReadPos = (this.bufferReadPos + 1) % this.maxBuffer
                this.bufferLength--
            }
        }

        return this.playbackOutputBuffer
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
