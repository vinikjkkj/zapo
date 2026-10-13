import { H264_CONSTRAINED_BASELINE_CODEC, readH264Codec } from '../media/h264.js'
import type { InboundVideoFrame } from '../types.js'

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
    /**
     * Streams decoded at once, 4 by default; the oldest is closed to make room. A group call
     * shows one per sender.
     */
    readonly maxStreams?: number
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

/** Decoder backlog past which the stream is cut back to its next key frame. */
const MAX_DECODE_QUEUE = 30

/** Peer streams decoded at once by default; the oldest is closed to make room. */
const DEFAULT_MAX_DECODED_STREAMS = 4

/** RTP clock rate of H.264. */
const VIDEO_CLOCK_KHZ = 90

/**
 * Largest step between a stream's frames taken as its own clock: 10 s. Past it, either way,
 * the encoder restarted on a new timestamp base.
 */
const MAX_TIMESTAMP_STEP_TICKS = 10_000 * VIDEO_CLOCK_KHZ

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
    private readonly maxStreams: number
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
        const maxStreams = options.maxStreams ?? DEFAULT_MAX_DECODED_STREAMS
        this.maxStreams = Number.isFinite(maxStreams)
            ? Math.max(1, Math.trunc(maxStreams))
            : DEFAULT_MAX_DECODED_STREAMS
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
            const codec =
                readH264Codec(frame.data) ?? stream.codec ?? H264_CONSTRAINED_BASELINE_CODEC
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
        if (this.streams.size >= this.maxStreams) {
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

function closeDecoder(stream: DecodedStream): void {
    const decoder = stream.decoder
    stream.decoder = null
    if (decoder && decoder.state !== 'closed') decoder.close()
}
