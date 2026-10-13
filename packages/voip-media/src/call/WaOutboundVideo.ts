import type { Logger } from '../logger.js'
import { packetizeH264Frame } from '../media/h264.js'
import { type RtpPacket, type RtpSession, WA_RTP_EXTENSION_PROFILE } from '../media/rtp.js'
import { HostCaptureTimeMapper, type WaMediaClock } from '../media/WaMediaClock.js'
import { VIDEO_CLOCK_RATE } from '../types.js'

import {
    buildExtensionViews,
    VIDEO_EXTENSION_SCRATCH_LENGTH,
    writeVideoExtension
} from './video-extension.js'

export interface WaOutboundVideoOptions {
    readonly logger: Logger
    readonly clock: WaMediaClock
    /** Protects and sends one packet; returns whether it left. */
    readonly sendRtp: (packet: RtpPacket) => boolean
    /** One frame went out on `ssrc`, before its frame number advances: the sender report hook. */
    readonly onFrameSent: (ssrc: number, timestamp: number, captureMs: number, now: number) => void
}

/**
 * Turns H.264 access units into RTP packets carrying WhatsApp's video extension. The stream
 * opens on a key frame, closes on a hold, and its timestamps only move forward.
 */
export class WaOutboundVideo {
    private readonly logger: Logger
    private readonly clock: WaMediaClock
    private readonly sendRtp: (packet: RtpPacket) => boolean
    private readonly onFrameSent: (
        ssrc: number,
        timestamp: number,
        captureMs: number,
        now: number
    ) => void
    /** Maps the host's video capture timestamps onto the clock, one video tick apart at least. */
    private readonly captureTimes = new HostCaptureTimeMapper(1000 / VIDEO_CLOCK_RATE)

    /** Whether our video is held for the peer; see `WaCallMediaVideo.sendHeld`. */
    private sendHeld = false
    /** Whether our video stream went out yet: it opens on a key frame, never on a delta. */
    private streamOpen = false

    private videoPacketCount = 0
    private videoOctetCount = 0
    /** Timestamp of the last video frame sent, valid once one was. */
    private videoTimestamp = 0
    private videoFrameNumber = 0
    private videoTransportSequence = 0
    private videoSendFrames = 0

    /** The video RTP header extension, rewritten in place per packet. */
    private readonly videoExtensionScratch = new Uint8Array(VIDEO_EXTENSION_SCRATCH_LENGTH)
    private readonly videoExtensionViews = buildExtensionViews(this.videoExtensionScratch)

    constructor(options: WaOutboundVideoOptions) {
        this.logger = options.logger
        this.clock = options.clock
        this.sendRtp = options.sendRtp
        this.onFrameSent = options.onFrameSent
    }

    get held(): boolean {
        return this.sendHeld
    }

    get packetCount(): number {
        return this.videoPacketCount
    }

    get octetCount(): number {
        return this.videoOctetCount
    }

    get framesSent(): number {
        return this.videoSendFrames
    }

    /** Holds or releases our frames; a hold closes the stream so it reopens on a key frame. */
    setHeld(held: boolean): void {
        if (held === this.sendHeld) return
        this.sendHeld = held
        if (held) this.streamOpen = false
        this.logger.debug('video send hold changed', { held })
    }

    /**
     * Packetizes and sends one access unit on `rtpSession` and returns the packet count, or 0
     * while the stream waits for a key frame. `receiverEstimate` rides on the first packet.
     */
    sendFrame(
        rtpSession: RtpSession,
        data: Uint8Array,
        timestampUs: number,
        receiverEstimate: number
    ): number {
        const { payloads, keyFrame } = packetizeH264Frame(data, 800)
        if (!this.streamOpen) {
            if (!keyFrame) return 0
            this.streamOpen = true
        }
        const now = this.clock.now()
        const captureMs = this.captureTimes.map(timestampUs / 1000, now)
        let timestamp = this.clock.ticksAt(captureMs, VIDEO_CLOCK_RATE)
        // Rounding can collapse two mapped instants; keep the wire strictly increasing.
        if (this.videoSendFrames > 0 && ((timestamp - this.videoTimestamp) | 0) <= 0) {
            timestamp = (this.videoTimestamp + 1) >>> 0
        }
        this.videoTimestamp = timestamp
        for (let index = 0; index < payloads.length; index++) {
            const firstPacket = index === 0
            const packet = rtpSession.createPacketAtTimestamp(
                payloads[index],
                timestamp,
                index === payloads.length - 1
            )
            packet.header.extension = true
            packet.header.extensionProfile = WA_RTP_EXTENSION_PROFILE
            packet.header.extensionData = this.buildVideoExtension(
                keyFrame,
                firstPacket,
                this.videoTransportSequence++,
                firstPacket ? receiverEstimate : 0
            )
            this.sendRtp(packet)
            this.videoPacketCount++
            this.videoOctetCount += payloads[index].length
        }
        this.onFrameSent(rtpSession.getSsrc(), timestamp, captureMs, now)
        this.videoFrameNumber = (this.videoFrameNumber + 1) & 0xffff
        this.videoSendFrames++
        if (this.videoSendFrames === 1 || this.videoSendFrames % 30 === 0) {
            this.logger.debug('video sent', {
                frames: this.videoSendFrames,
                bytes: data.length,
                packets: payloads.length
            })
        }
        return payloads.length
    }

    /**
     * Writes a video packet's header extension into the scratch and returns the slice, valid
     * until the next call. A `receiverEstimate` above zero appends the REMB element.
     */
    buildVideoExtension(
        keyFrame: boolean,
        firstPacket: boolean,
        transportSequence: number,
        receiverEstimate: number
    ): Uint8Array {
        const padded = writeVideoExtension(
            this.videoExtensionScratch,
            keyFrame,
            firstPacket,
            this.videoFrameNumber,
            transportSequence,
            receiverEstimate
        )
        return this.videoExtensionViews[padded >>> 2]
    }
}
