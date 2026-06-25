import * as fs from 'node:fs'

import { toBytesView } from 'zapo-js/util'

import { concatBytes } from './bytes.js'
import { type AudioEngineConfig, type AudioSender, DEFAULT_AUDIO_CONFIG } from './types.js'

export class AudioEngine {
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

    private debug = false
    private silenceMode = false

    private externalMode = false
    private liveWritePos = 0
    private extStarted = false
    private readonly extPreBufferSize: number
    private readonly extTargetBuffer: number
    private readonly extHighWater: number
    private extSkipCount = 0

    private readonly captureChunkBuffer: Float32Array
    private readonly silenceChunkBuffer: Float32Array
    private readonly playbackOutputBuffer: Float32Array

    constructor(config: Partial<AudioEngineConfig> = {}) {
        const c = { ...DEFAULT_AUDIO_CONFIG, ...config }
        this.sampleRate = c.sampleRate
        this.captureChunkSize = c.captureChunkSize
        this.maxBuffer = c.maxBufferSize
        this.outputSize = c.playbackOutputSize
        this.intervalMs = c.intervalMs
        this.circularBuffer = new Float32Array(this.maxBuffer)
        this.captureChunkBuffer = new Float32Array(this.captureChunkSize)
        this.silenceChunkBuffer = new Float32Array(this.captureChunkSize)
        this.playbackOutputBuffer = new Float32Array(this.outputSize)

        this.extPreBufferSize = Math.floor(this.sampleRate * 0.06)
        this.extTargetBuffer = Math.floor(this.sampleRate * 0.06)
        this.extHighWater = Math.floor(this.sampleRate * 0.2)
    }

    setDebug(enabled: boolean): void {
        this.debug = enabled
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
        if (enabled) {
            const initialSize = this.sampleRate * 60
            this.audioBuffer = new Float32Array(initialSize)
            this.audioPosition = 0
            this.liveWritePos = 0
            this.audioFinished = false
        }
        if (this.debug) {
            console.log(
                `[AudioEngine] External mode: ${enabled}, preBuffer: ${this.extPreBufferSize} samples`
            )
        }
    }

    isExternalMode(): boolean {
        return this.externalMode
    }

    feedExternalAudio(data: Float32Array): void {
        if (!this.audioBuffer) return

        if (this.audioPosition > this.audioBuffer.length / 2) {
            const remaining = this.liveWritePos - this.audioPosition
            if (remaining > 0) {
                this.audioBuffer.copyWithin(0, this.audioPosition, this.liveWritePos)
            }
            this.liveWritePos = Math.max(0, remaining)
            this.audioPosition = 0
        }

        if (this.liveWritePos + data.length > this.audioBuffer.length) {
            const newSize = Math.max(this.audioBuffer.length * 2, this.liveWritePos + data.length)
            const newBuf = new Float32Array(newSize)
            newBuf.set(this.audioBuffer.subarray(0, this.liveWritePos))
            this.audioBuffer = newBuf
            if (this.debug) {
                console.log(`[AudioEngine] Live buffer grew to ${newSize} samples`)
            }
        }

        this.audioBuffer.set(data, this.liveWritePos)
        this.liveWritePos += data.length
    }

    isAudioFinished(): boolean {
        return this.audioFinished
    }

    async loadAudioFile(audioPath: string): Promise<void> {
        if (this.debug) {
            console.log(`[AudioEngine] Loading ${audioPath}...`)
        }

        if (!fs.existsSync(audioPath)) {
            throw new Error(`File not found: ${audioPath}`)
        }

        const pcmData = await this.decodeWithFFmpeg(audioPath)
        this.audioBuffer = this.int16ToFloat32(pcmData)
        this.audioPosition = 0
        this.audioFinished = false

        if (this.debug) {
            const duration = this.audioBuffer.length / this.sampleRate
            console.log(
                `[AudioEngine] Loaded: ${this.audioBuffer.length} samples (${duration.toFixed(2)}s)`
            )
        }
    }

    private int16ToFloat32(pcmData: Int16Array): Float32Array {
        const float32 = new Float32Array(pcmData.length)
        for (let i = 0; i < pcmData.length; i++) {
            float32[i] = pcmData[i] / 32768.0
        }

        return float32
    }

    private async decodeWithFFmpeg(inputPath: string): Promise<Int16Array> {
        const ffmpegModule = await import('fluent-ffmpeg')
        const ffmpeg = ffmpegModule.default

        return new Promise((resolve, reject) => {
            const chunks: Uint8Array[] = []

            ffmpeg(inputPath)
                .audioFrequency(this.sampleRate)
                .audioChannels(1)
                .audioCodec('pcm_s16le')
                .format('s16le')
                .on('error', reject)
                .on('end', () => {
                    const pcmBytes = concatBytes(chunks)
                    const int16Array = new Int16Array(
                        pcmBytes.buffer,
                        pcmBytes.byteOffset,
                        pcmBytes.byteLength / 2
                    )
                    resolve(int16Array)
                })
                .pipe()
                .on('data', (chunk: Uint8Array | Buffer) => chunks.push(toBytesView(chunk)))
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

        if (this.debug) {
            console.log(`[AudioEngine] Test tone generated: ${samples} samples (${duration}s)`)
        }
    }

    startPlayback(): void {
        if (this.playbackInterval) {
            return
        }

        if (this.debug) {
            console.log('[AudioEngine] Starting playback...')
        }

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

        if (this.debug) {
            console.log('[AudioEngine] Starting silence capture (pre-accept warmup)')
        }

        this.captureInterval = setInterval(() => {
            if (this.audioSender) {
                try {
                    this.audioSender.sendCapturedAudio(this.silenceChunkBuffer)
                } catch {}
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
            if (this.debug) {
                console.log(
                    `[AudioEngine] Starting live capture (readPos=${this.audioPosition}, writePos=${this.liveWritePos}, runway=${available} samples, started=${this.extStarted})`
                )
            }
        } else {
            this.audioPosition = 0
            if (this.debug) {
                if (this.audioBuffer) {
                    const duration = (this.audioBuffer.length / this.sampleRate).toFixed(1)
                    console.log(`[AudioEngine] Starting capture (${duration}s audio loaded)`)
                } else {
                    console.log(
                        '[AudioEngine] Starting capture (sending silence — no audio loaded)'
                    )
                }
            }
        }

        let frameCount = 0

        this.captureInterval = setInterval(() => {
            frameCount++
            const chunk = this.getNextChunk()

            if (this.audioSender) {
                try {
                    this.audioSender.sendCapturedAudio(chunk)
                } catch {}
            }

            if (this.debug && frameCount % 500 === 0) {
                if (this.audioBuffer) {
                    const pos = (this.audioPosition / this.sampleRate).toFixed(1)
                    console.log(`[AudioEngine] Capture frame #${frameCount}, pos: ${pos}s`)
                } else {
                    console.log(`[AudioEngine] Capture frame #${frameCount} (silence)`)
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
                if (this.debug) {
                    console.log(
                        `[AudioEngine] Live buffer ready (${available} samples), starting read`
                    )
                }
            }

            if (available > this.extHighWater) {
                const skipTo = endPos - this.extTargetBuffer
                const skipped = skipTo - this.audioPosition
                this.audioPosition = skipTo
                this.extSkipCount++
                if (this.debug || this.extSkipCount <= 5) {
                    console.log(
                        `[AudioEngine] Live buffer overflow (${available} samples) — skipped ${skipped} samples to target (${this.extTargetBuffer})`
                    )
                }
            }

            if (this.audioPosition >= endPos) {
                return this.captureChunkBuffer
            }
        }

        this.captureChunkBuffer.fill(0)
        for (let i = 0; i < this.captureChunkSize; i++) {
            if (this.audioPosition >= endPos) {
                if (!this.externalMode && !this.audioFinished) {
                    this.audioFinished = true
                    if (this.debug) {
                        console.log('[AudioEngine] Audio playback finished — sending silence')
                    }
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
