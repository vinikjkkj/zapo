import { H264_CONSTRAINED_BASELINE_CODEC } from '../media/h264.js'

import { openFrameSource, type VideoFrameSource } from './video-frame-source.js'

/** The plane method the sender drives; a `WaCallMediaPlane` satisfies it. */
export interface WaCallVideoSink {
    /**
     * Sends one H.264 access unit, Annex-B, and returns the RTP packets it went out as.
     * `data` is only valid during the call: the sender reuses its buffer.
     */
    sendVideoFrame(data: Uint8Array, timestampUs: number): number
}

export interface WaWebCallVideoSenderOptions {
    /** Most frames per second encoded; a faster source is thinned. Default 15. */
    readonly frameRate?: number
    /** Encoder target in bits per second. Default 600 000. */
    readonly bitrate?: number
    /**
     * Longest run between key frames, in milliseconds. Default 2000. Key-frame requests are
     * not acted on, so this bounds how long a receiver waits after a loss.
     */
    readonly keyFrameIntervalMs?: number
    /** WebCodecs codec string. Default `avc1.42E01F`, Constrained Baseline 3.1. */
    readonly codec?: string
    /** Whether the encoder may run on the GPU, as WebCodecs takes it. Default: the browser's choice. */
    readonly hardwareAcceleration?: HardwareAcceleration
    /** An encoder failure; the next frame builds a new encoder, starting on a key frame. */
    readonly onError?: (error: unknown) => void
}

export interface WaWebCallVideoSenderStats {
    readonly framesCaptured: number
    readonly framesEncoded: number
    /** Encoded frames the plane put on the wire, as opposed to dropped for want of video. */
    readonly framesSent: number
    /** Captured frames never encoded: thinned to the frame rate or shed under backlog. */
    readonly framesDropped: number
    readonly packetsSent: number
    readonly keyFrames: number
    readonly width: number
    readonly height: number
}

const DEFAULT_FRAME_RATE = 15
const DEFAULT_BITRATE = 600_000
const DEFAULT_KEY_FRAME_INTERVAL_MS = 2_000

/** How often a refused sender offers a key frame, for the plane to open the stream on. */
const REFUSED_KEY_FRAME_INTERVAL_US = 500_000

/** Largest picture width encoded; bigger sources are scaled down to stay in the codec level. */
const MAX_ENCODED_WIDTH = 1280
const MAX_ENCODED_HEIGHT = 720

/**
 * Frames queued in the encoder past which a new one is shed. Realtime capture
 * outruns a busy encoder; a short queue keeps the latency to a frame or two.
 */
const MAX_ENCODE_QUEUE = 2

/**
 * Encodes a video track to H.264 with WebCodecs and hands each access unit to a sink. Stamps
 * come from the sender's own clock, so a track swap never moves the stream back in time.
 */
export class WaWebCallVideoSender {
    private readonly sink: WaCallVideoSink
    private readonly codec: string
    private readonly bitrate: number
    private readonly frameRate: number
    private readonly minFrameIntervalUs: number
    private readonly keyFrameIntervalUs: number
    private readonly onError: ((error: unknown) => void) | undefined
    private readonly hardwareAcceleration: HardwareAcceleration | undefined
    private readonly epochMs = performance.now()
    private source: VideoFrameSource | null = null
    private encoder: VideoEncoder | null = null
    private width = 0
    private height = 0
    private lastFrameAtUs: number | null = null
    private lastKeyFrameAtUs: number | null = null
    private keyFrameRequested = false
    private stopped = false
    private chunkScratch = new Uint8Array(0)
    private framesCaptured = 0
    private framesEncoded = 0
    private framesSent = 0
    private framesDropped = 0
    private packetsSent = 0
    private keyFrames = 0

    private constructor(sink: WaCallVideoSink, options: WaWebCallVideoSenderOptions) {
        this.sink = sink
        this.codec = options.codec ?? H264_CONSTRAINED_BASELINE_CODEC
        this.bitrate = options.bitrate ?? DEFAULT_BITRATE
        this.frameRate = options.frameRate ?? DEFAULT_FRAME_RATE
        // A 20% allowance, so a source at exactly the rate is not thinned by half.
        this.minFrameIntervalUs = (1_000_000 / this.frameRate) * 0.8
        this.keyFrameIntervalUs =
            (options.keyFrameIntervalMs ?? DEFAULT_KEY_FRAME_INTERVAL_MS) * 1000
        this.onError = options.onError
        this.hardwareAcceleration = options.hardwareAcceleration
    }

    /** Starts reading `track` and encoding what it shows. */
    static async start(
        sink: WaCallVideoSink,
        track: MediaStreamTrack,
        options: WaWebCallVideoSenderOptions = {}
    ): Promise<WaWebCallVideoSender> {
        if (typeof VideoEncoder === 'undefined') {
            throw new Error('this browser has no WebCodecs VideoEncoder')
        }
        if (track.kind !== 'video') {
            throw new Error(`a ${track.kind} track cannot be sent as video`)
        }
        const sender = new WaWebCallVideoSender(sink, options)
        await sender.attach(track)
        return sender
    }

    get stats(): WaWebCallVideoSenderStats {
        return {
            framesCaptured: this.framesCaptured,
            framesEncoded: this.framesEncoded,
            framesSent: this.framesSent,
            framesDropped: this.framesDropped,
            packetsSent: this.packetsSent,
            keyFrames: this.keyFrames,
            width: this.width,
            height: this.height
        }
    }

    /**
     * Sends `track` from now on instead of the one before, starting on a key
     * frame. The previous track is left running.
     */
    async replaceTrack(track: MediaStreamTrack): Promise<void> {
        if (this.stopped) return
        if (track.kind !== 'video') {
            throw new Error(`a ${track.kind} track cannot be sent as video`)
        }
        this.keyFrameRequested = true
        await this.attach(track)
    }

    /** Makes the next frame encoded a key frame. */
    requestKeyFrame(): void {
        this.keyFrameRequested = true
    }

    /** Stops reading and closes the encoder. Calling it again does nothing. */
    stop(): Promise<void> {
        if (this.stopped) return Promise.resolve()
        this.stopped = true
        this.source?.close()
        this.source = null
        this.closeEncoder()
        return Promise.resolve()
    }

    private async attach(track: MediaStreamTrack): Promise<void> {
        const source = await openFrameSource(track, this.frameRate)
        if (this.stopped) {
            source.close()
            return
        }
        this.source?.close()
        this.source = source
        void this.pump(source)
    }

    private async pump(source: VideoFrameSource): Promise<void> {
        while (this.source === source) {
            let frame: VideoFrame | null
            try {
                frame = await source.next()
            } catch (error) {
                this.onError?.(error)
                return
            }
            if (!frame) return
            if (this.source !== source) {
                frame.close()
                return
            }
            this.onFrame(frame)
        }
    }

    private onFrame(frame: VideoFrame): void {
        this.framesCaptured++
        const timestamp = Math.round((performance.now() - this.epochMs) * 1000)
        const encoder = this.ensureEncoder(frame)
        if (
            !encoder ||
            encoder.encodeQueueSize > MAX_ENCODE_QUEUE ||
            (this.lastFrameAtUs !== null &&
                timestamp - this.lastFrameAtUs < this.minFrameIntervalUs)
        ) {
            this.framesDropped++
            frame.close()
            return
        }
        this.lastFrameAtUs = timestamp

        const keyFrame =
            this.keyFrameRequested ||
            this.lastKeyFrameAtUs === null ||
            timestamp - this.lastKeyFrameAtUs >= this.keyFrameIntervalUs
        if (keyFrame) {
            this.keyFrameRequested = false
            this.lastKeyFrameAtUs = timestamp
        }

        // A view of the same picture under this sender's clock; nothing is copied.
        const stamped = new VideoFrame(frame, { timestamp })
        frame.close()
        try {
            encoder.encode(stamped, { keyFrame })
        } catch (error) {
            this.failEncoder(error)
        } finally {
            stamped.close()
        }
    }

    /**
     * The encoder for a frame of this size, configured on the first frame and
     * again whenever the source changes size, which then starts on a key frame.
     */
    private ensureEncoder(frame: VideoFrame): VideoEncoder | null {
        const { width, height } = fitEncodedSize(frame.displayWidth, frame.displayHeight)
        if (width === 0 || height === 0) return null
        if (this.encoder && width === this.width && height === this.height) return this.encoder

        const encoder = this.encoder ?? this.createEncoder()
        try {
            encoder.configure({
                codec: this.codec,
                width,
                height,
                bitrate: this.bitrate,
                framerate: this.frameRate,
                latencyMode: 'realtime',
                avc: { format: 'annexb' },
                ...(this.hardwareAcceleration && {
                    hardwareAcceleration: this.hardwareAcceleration
                })
            })
        } catch (error) {
            this.failEncoder(error)
            return null
        }
        this.encoder = encoder
        this.width = width
        this.height = height
        this.keyFrameRequested = true
        return encoder
    }

    private createEncoder(): VideoEncoder {
        const encoder: VideoEncoder = new VideoEncoder({
            output: (chunk) => this.onChunk(chunk),
            error: (error) => {
                if (this.encoder === encoder) this.failEncoder(error)
            }
        })
        return encoder
    }

    private onChunk(chunk: EncodedVideoChunk): void {
        if (this.stopped) return
        if (this.chunkScratch.length < chunk.byteLength) {
            this.chunkScratch = new Uint8Array(chunk.byteLength)
        }
        const data = this.chunkScratch.subarray(0, chunk.byteLength)
        chunk.copyTo(data)
        this.framesEncoded++
        if (chunk.type === 'key') this.keyFrames++
        const packets = this.sink.sendVideoFrame(data, chunk.timestamp)
        if (packets > 0) {
            this.framesSent++
            this.packetsSent += packets
        } else if (
            this.lastKeyFrameAtUs === null ||
            chunk.timestamp - this.lastKeyFrameAtUs >= REFUSED_KEY_FRAME_INTERVAL_US
        ) {
            // While refused, ask for a key frame now and then so the stream can open soon after.
            this.keyFrameRequested = true
        }
    }

    /** Drops a failed encoder; the next frame builds a new one, on a key frame. */
    private failEncoder(error: unknown): void {
        this.closeEncoder()
        this.width = 0
        this.height = 0
        this.onError?.(error)
    }

    private closeEncoder(): void {
        const encoder = this.encoder
        this.encoder = null
        if (encoder && encoder.state !== 'closed') encoder.close()
    }
}

/**
 * Fits a picture inside the largest encoded size, keeping its aspect, in even
 * dimensions: 4:2:0 chroma halves both, so an odd one cannot be encoded.
 */
function fitEncodedSize(width: number, height: number): { width: number; height: number } {
    const scale = Math.min(1, MAX_ENCODED_WIDTH / width, MAX_ENCODED_HEIGHT / height)
    return {
        width: Math.floor((width * scale) / 2) * 2,
        height: Math.floor((height * scale) / 2) * 2
    }
}
