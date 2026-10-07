import type { InboundVideoFrame } from '../types.js'

/** The plane method the sender drives; a `WaCallMediaPlane` satisfies it. */
export interface WaCallVideoSink {
    /** Sends one H.264 access unit, Annex-B, and returns the RTP packets it went out as. */
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

export interface WaWebCallVideoReceiverOptions {
    /** Each decoded frame of the peer, with the SSRC it arrived on. It is the callee's to close. */
    readonly onFrame: (frame: VideoFrame, ssrc: number) => void
    /**
     * Whether the decoder may run on the GPU. Default: the browser's choice. A hardware decoder
     * may buffer several frames before its first output; `prefer-software` avoids that latency.
     */
    readonly hardwareAcceleration?: HardwareAcceleration
    /** A decoder failure; the stream resumes on its next key frame. */
    readonly onError?: (error: unknown, ssrc: number) => void
}

export interface WaWebCallVideoReceiverStats {
    readonly framesReceived: number
    readonly framesDecoded: number
    /** Frames that could not be decoded: before the first key frame, or after a failure. */
    readonly framesDropped: number
    readonly decodeErrors: number
    /** Codec of the stream decoded last, read off its sequence parameter set. */
    readonly codec: string | null
}

const DEFAULT_FRAME_RATE = 15
const DEFAULT_BITRATE = 600_000
const DEFAULT_KEY_FRAME_INTERVAL_MS = 2_000
const DEFAULT_CODEC = 'avc1.42E01F'

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

/** Decoder backlog past which the stream is cut back to its next key frame. */
const MAX_DECODE_QUEUE = 30

/** Peer streams decoded at once; the oldest is closed to make room. */
const MAX_DECODED_STREAMS = 4

/** RTP clock rate of H.264. */
const VIDEO_CLOCK_KHZ = 90

/**
 * Largest step between a stream's frames taken as its own clock: 10 s. Past it, either way,
 * the encoder restarted on a new timestamp base.
 */
const MAX_TIMESTAMP_STEP_TICKS = 10_000 * VIDEO_CLOCK_KHZ

const NAL_TYPE_SPS = 7

interface VideoFrameSource {
    /** The next frame, or `null` once the track ended or the source was closed. */
    next(): Promise<VideoFrame | null>
    close(): void
}

/** Chrome's `MediaStreamTrackProcessor`, which TypeScript's DOM library does not carry. */
interface TrackProcessorConstructor {
    new (init: { readonly track: MediaStreamTrack }): {
        readonly readable: ReadableStream<VideoFrame>
    }
}

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
    private framesCaptured = 0
    private framesEncoded = 0
    private framesSent = 0
    private framesDropped = 0
    private packetsSent = 0
    private keyFrames = 0

    private constructor(sink: WaCallVideoSink, options: WaWebCallVideoSenderOptions) {
        this.sink = sink
        this.codec = options.codec ?? DEFAULT_CODEC
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
        const data = new Uint8Array(chunk.byteLength)
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

interface DecodedStream {
    decoder: VideoDecoder | null
    codec: string | null
    waitingForKeyFrame: boolean
    lastRtpTimestamp: number | null
    elapsedTicks: number
}

/**
 * Decodes the peer's H.264 with WebCodecs, one decoder per stream, configured from each key
 * frame's SPS. A stream starts, and restarts after a failure or backlog, on a key frame.
 */
export class WaWebCallVideoReceiver {
    private readonly onFrameDecoded: (frame: VideoFrame, ssrc: number) => void
    private readonly onError: ((error: unknown, ssrc: number) => void) | undefined
    private readonly hardwareAcceleration: HardwareAcceleration | undefined
    private readonly streams = new Map<number, DecodedStream>()
    private closed = false
    private framesReceived = 0
    private framesDecoded = 0
    private framesDropped = 0
    private decodeErrors = 0
    private lastCodec: string | null = null

    constructor(options: WaWebCallVideoReceiverOptions) {
        if (typeof VideoDecoder === 'undefined') {
            throw new Error('this browser has no WebCodecs VideoDecoder')
        }
        this.onFrameDecoded = options.onFrame
        this.onError = options.onError
        this.hardwareAcceleration = options.hardwareAcceleration
    }

    get stats(): WaWebCallVideoReceiverStats {
        return {
            framesReceived: this.framesReceived,
            framesDecoded: this.framesDecoded,
            framesDropped: this.framesDropped,
            decodeErrors: this.decodeErrors,
            codec: this.lastCodec
        }
    }

    /** Takes one reassembled access unit of the peer. */
    push(frame: InboundVideoFrame): void {
        if (this.closed) return
        this.framesReceived++
        const stream = this.streamFor(frame.ssrc)
        const timestamp = advanceTimestamp(stream, frame.timestamp)

        if (frame.keyFrame) {
            const codec = readH264Codec(frame.data) ?? stream.codec ?? DEFAULT_CODEC
            if (!stream.decoder || stream.decoder.state === 'closed' || codec !== stream.codec) {
                if (!this.openDecoder(frame.ssrc, stream, codec)) {
                    this.framesDropped++
                    return
                }
            }
            stream.waitingForKeyFrame = false
        }

        const decoder = stream.decoder
        if (
            stream.waitingForKeyFrame ||
            !decoder ||
            decoder.state !== 'configured' ||
            decoder.decodeQueueSize > MAX_DECODE_QUEUE
        ) {
            stream.waitingForKeyFrame = true
            this.framesDropped++
            return
        }

        try {
            decoder.decode(
                new EncodedVideoChunk({
                    type: frame.keyFrame ? 'key' : 'delta',
                    timestamp,
                    data: frame.data
                })
            )
        } catch (error) {
            this.fail(frame.ssrc, stream, error)
        }
    }

    /** Closes every decoder; later frames are ignored. */
    close(): void {
        if (this.closed) return
        this.closed = true
        for (const stream of this.streams.values()) closeDecoder(stream)
        this.streams.clear()
    }

    private streamFor(ssrc: number): DecodedStream {
        let stream = this.streams.get(ssrc)
        if (stream) return stream
        if (this.streams.size >= MAX_DECODED_STREAMS) {
            const [oldestSsrc, oldest] = this.streams.entries().next().value as [
                number,
                DecodedStream
            ]
            closeDecoder(oldest)
            this.streams.delete(oldestSsrc)
        }
        stream = {
            decoder: null,
            codec: null,
            waitingForKeyFrame: true,
            lastRtpTimestamp: null,
            elapsedTicks: 0
        }
        this.streams.set(ssrc, stream)
        return stream
    }

    private openDecoder(ssrc: number, stream: DecodedStream, codec: string): boolean {
        closeDecoder(stream)
        const decoder: VideoDecoder = new VideoDecoder({
            output: (picture) => {
                if (this.closed || stream.decoder !== decoder) {
                    picture.close()
                    return
                }
                this.framesDecoded++
                try {
                    this.onFrameDecoded(picture, ssrc)
                } catch (error) {
                    picture.close()
                    this.onError?.(error, ssrc)
                }
            },
            error: (error) => {
                if (stream.decoder === decoder) this.fail(ssrc, stream, error)
            }
        })
        try {
            decoder.configure({
                codec,
                optimizeForLatency: true,
                ...(this.hardwareAcceleration && {
                    hardwareAcceleration: this.hardwareAcceleration
                })
            })
        } catch (error) {
            stream.decoder = decoder
            this.fail(ssrc, stream, error)
            return false
        }
        stream.decoder = decoder
        stream.codec = codec
        this.lastCodec = codec
        return true
    }

    private fail(ssrc: number, stream: DecodedStream, error: unknown): void {
        this.decodeErrors++
        closeDecoder(stream)
        stream.waitingForKeyFrame = true
        this.onError?.(error, ssrc)
    }
}

/** Opens a frame source: Chrome's track processor if present, else a sampled video element. */
async function openFrameSource(
    track: MediaStreamTrack,
    frameRate: number
): Promise<VideoFrameSource> {
    const Processor = (globalThis as { MediaStreamTrackProcessor?: TrackProcessorConstructor })
        .MediaStreamTrackProcessor
    if (Processor) return openProcessorSource(new Processor({ track }).readable)
    return openElementSource(track, frameRate)
}

function openProcessorSource(readable: ReadableStream<VideoFrame>): VideoFrameSource {
    const reader = readable.getReader()
    let closed = false
    return {
        async next() {
            if (closed) return null
            const { value, done } = await reader.read()
            if (done || !value) return null
            if (closed) {
                value.close()
                return null
            }
            return value
        },
        close() {
            if (closed) return
            closed = true
            reader.cancel().catch(() => undefined)
        }
    }
}

/** Samples a muted video element playing the track; throttled while the tab is hidden. */
async function openElementSource(
    track: MediaStreamTrack,
    frameRate: number
): Promise<VideoFrameSource> {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = new MediaStream([track])
    await video.play()

    const intervalMs = 1000 / frameRate
    let closed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let wake: (() => void) | null = null
    return {
        async next() {
            while (!closed) {
                await new Promise<void>((resolve) => {
                    wake = resolve
                    timer = setTimeout(resolve, intervalMs)
                })
                wake = null
                if (closed) return null
                if (track.readyState === 'ended') return null
                if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                    return new VideoFrame(video, { timestamp: 0 })
                }
            }
            return null
        },
        close() {
            if (closed) return
            closed = true
            if (timer !== null) clearTimeout(timer)
            wake?.()
            video.pause()
            video.srcObject = null
        }
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

/**
 * Stream position in microseconds for an RTP timestamp, stepping by the signed difference. On
 * a restarted base the position goes on one tick past the last, so it never runs backwards.
 */
function advanceTimestamp(stream: DecodedStream, rtpTimestamp: number): number {
    if (stream.lastRtpTimestamp !== null) {
        const step = (rtpTimestamp - stream.lastRtpTimestamp) | 0
        stream.elapsedTicks += Math.abs(step) > MAX_TIMESTAMP_STEP_TICKS ? 1 : step
    }
    stream.lastRtpTimestamp = rtpTimestamp
    return Math.round((stream.elapsedTicks * 1000) / VIDEO_CLOCK_KHZ)
}

/** The WebCodecs codec string read off an access unit's SPS, or `null` without one. */
export function readH264Codec(data: Uint8Array): string | null {
    for (let i = 0; i + 3 < data.length; i++) {
        if (data[i] !== 0 || data[i + 1] !== 0) continue
        let header = -1
        if (data[i + 2] === 1) header = i + 3
        else if (data[i + 2] === 0 && data[i + 3] === 1) header = i + 4
        if (header < 0) continue
        if (header + 3 < data.length && (data[header] & 0x1f) === NAL_TYPE_SPS) {
            return `avc1.${hexByte(data[header + 1])}${hexByte(data[header + 2])}${hexByte(data[header + 3])}`
        }
        i = header - 1
    }
    return null
}

function hexByte(value: number): string {
    return value.toString(16).toUpperCase().padStart(2, '0')
}

function closeDecoder(stream: DecodedStream): void {
    const decoder = stream.decoder
    stream.decoder = null
    if (decoder && decoder.state !== 'closed') decoder.close()
}
