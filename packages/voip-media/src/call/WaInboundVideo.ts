import { setBoundedMapEntry } from '../collections.js'
import { isLogLevelEnabled, type Logger } from '../logger.js'
import { H264Depacketizer } from '../media/h264.js'
import type { RtpHeader } from '../media/rtp.js'
import type { InboundVideoFrame } from '../types.js'

/** Reassembly buffers kept per inbound video SSRC, at least; the oldest is dropped on overflow. */
export const MAX_H264_DEPACKETIZERS = 8

/** Shortest gap between two key frame requests while no key frame has arrived. */
const KEY_FRAME_REQUEST_INTERVAL_MS = 300

/** Reassembly and key frame requests of one inbound video SSRC; a request names one stream. */
interface InboundVideoStream {
    readonly depacketizer: H264Depacketizer
    keyFrameReceived: boolean
    lastKeyFrameRequestAt: number
}

export interface WaInboundVideoOptions {
    readonly logger: Logger
    readonly onFrame?: (frame: InboundVideoFrame) => void
    readonly requestKeyFrame: (ssrc: number) => void
}

/** Reassembles each inbound video SSRC into frames, bounded, and paces key frame requests. */
export class WaInboundVideo {
    private readonly logger: Logger
    private readonly traceEnabled: boolean
    private readonly onFrame: ((frame: InboundVideoFrame) => void) | undefined
    private readonly requestKeyFrame: (ssrc: number) => void
    private readonly streams = new Map<number, InboundVideoStream>()
    /** Inbound video streams reassembled at once: the default, or two per group sender. */
    private maxStreams = MAX_H264_DEPACKETIZERS
    private lastKeyFrameRequestAt = 0

    constructor(options: WaInboundVideoOptions) {
        this.logger = options.logger
        this.traceEnabled = isLogLevelEnabled(this.logger, 'trace')
        this.onFrame = options.onFrame
        this.requestKeyFrame = options.requestKeyFrame
    }

    /** Feeds one H.264 payload to its stream's reassembly and hands over each frame it closes. */
    push(header: RtpHeader, payload: Uint8Array, now: number, senderId: string | undefined): void {
        let stream = this.streams.get(header.ssrc)
        if (!stream) {
            stream = {
                depacketizer: new H264Depacketizer(),
                keyFrameReceived: false,
                lastKeyFrameRequestAt: 0
            }
            setBoundedMapEntry(
                this.streams,
                header.ssrc,
                stream,
                this.maxStreams,
                (_ssrc, evicted) => evicted.depacketizer.reset()
            )
        }
        const frames = stream.depacketizer.push(
            payload,
            header.timestamp,
            header.marker,
            header.sequenceNumber
        )
        for (const frame of frames) {
            if (frame.keyFrame) stream.keyFrameReceived = true
            // Paced per stream, and across streams so a peer minting SSRCs draws no more requests.
            if (
                !stream.keyFrameReceived &&
                now - stream.lastKeyFrameRequestAt >= KEY_FRAME_REQUEST_INTERVAL_MS &&
                now - this.lastKeyFrameRequestAt >= KEY_FRAME_REQUEST_INTERVAL_MS / this.maxStreams
            ) {
                stream.lastKeyFrameRequestAt = now
                this.lastKeyFrameRequestAt = now
                this.requestKeyFrame(header.ssrc)
            }
            if (this.traceEnabled) {
                this.logger.trace('video frame assembled', {
                    timestamp: frame.timestamp,
                    keyFrame: frame.keyFrame,
                    bytes: frame.data.length
                })
            }
            this.onFrame?.({
                codec: 'h264',
                ssrc: header.ssrc,
                timestamp: frame.timestamp,
                keyFrame: frame.keyFrame,
                data: frame.data,
                senderId
            })
        }
    }

    /** Bounds the video streams reassembled at once; a lower bound drops the oldest past it. */
    setMaxStreams(max: number): void {
        this.maxStreams = max
        for (const [ssrc, stream] of this.streams) {
            if (this.streams.size <= max) break
            stream.depacketizer.reset()
            this.streams.delete(ssrc)
        }
    }

    drop(ssrc: number): void {
        this.streams.get(ssrc)?.depacketizer.reset()
        this.streams.delete(ssrc)
    }

    clear(): void {
        for (const stream of this.streams.values()) stream.depacketizer.reset()
        this.streams.clear()
    }
}
