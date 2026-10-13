import { hexSsrc } from '../bytes.js'
import { randomBytes } from '../crypto/random.js'
import type { SrtcpContext } from '../crypto/srtp.js'
import { toError } from '../errors.js'
import { isLogLevelEnabled, type Logger } from '../logger.js'
import { AudioReceiveSet } from '../media/audio-receive-set.js'
import {
    nextAudioReceiverEstimate,
    nextReceiverMaxBitrate,
    SenderReportSchedule
} from '../media/rtcp-policy.js'
import {
    buildFullIntraRequest,
    buildPictureLossIndication,
    buildReceiverEstimatedMaxBitrate,
    buildSenderReportWithSdes,
    RTCP_CNAME_LENGTH,
    type SenderReportReception
} from '../media/rtcp.js'
import type { RtpStreamReception } from '../media/rtp-stream-reception.js'
import type { RtpSession } from '../media/rtp.js'
import type { WaMediaClock } from '../media/WaMediaClock.js'
import { AUDIO_SAMPLE_RATE } from '../types.js'

/** Default RTCP interval; an audio call runs the server's `rc.rtcp_interval_ms` instead. */
const SENDER_REPORT_INTERVAL_MS = 1_000

/** Ceiling announced before the first REMB window closes: the bitrate rule on an empty one. */
const INITIAL_RECEIVER_ESTIMATE = nextReceiverMaxBitrate(0, 0, 0, 0)

export interface WaCallRtcpOptions {
    readonly logger: Logger
    readonly clock: WaMediaClock
    /** Puts one protected RTCP datagram on the media socket. */
    readonly sendMedia: (datagram: Uint8Array) => boolean
}

/**
 * Paces and builds our outbound RTCP: sender reports, the audio and video REMB, PLI and FIR.
 * The keys and sessions are the caller's, handed in on every call.
 */
export class WaCallRtcp {
    private readonly logger: Logger
    private readonly traceEnabled: boolean
    private readonly clock: WaMediaClock
    private readonly sendMedia: (datagram: Uint8Array) => boolean

    /** RTCP interval in force: the compiled one, or the server's; the schedules below follow it. */
    private rtcpIntervalMs = SENDER_REPORT_INTERVAL_MS
    /** Audio reports pace on RTP timestamp ticks, video reports on wall time. */
    audioReportSchedule!: SenderReportSchedule
    videoReportSchedule!: SenderReportSchedule
    /** Paced from the receive path, unlike the video report, which the send path drives. */
    receiverEstimateSchedule!: SenderReportSchedule
    audioReceiverEstimateSchedule!: SenderReportSchedule

    /** Whether the server turned the RTCP REMB off; gates the video REMB send. */
    private rtcpRembDisabled = false

    /** CNAME of every sender report, binding the call's audio and video to one participant. */
    private rtcpCname: Uint8Array | null = null

    /** Video payload bytes in the open REMB window, and when it opened. */
    private videoRecvOctets = 0
    private receiverEstimateWindowStartedAt = 0

    /** Ceiling announced in the last REMB, or 0 before the first; it carries across windows. */
    private receiverEstimateBitrate = 0
    private audioReceiverEstimateBitrate = 0

    private videoFirSequence = 0

    constructor(options: WaCallRtcpOptions) {
        this.logger = options.logger
        this.traceEnabled = isLogLevelEnabled(this.logger, 'trace')
        this.clock = options.clock
        this.sendMedia = options.sendMedia
        this.resetSchedules(SENDER_REPORT_INTERVAL_MS)
    }

    get intervalMs(): number {
        return this.rtcpIntervalMs
    }

    get rembDisabled(): boolean {
        return this.rtcpRembDisabled
    }

    /** Applies the REMB gate and the RTCP interval; a `null` interval restores the compiled one. */
    configure(intervalMs: number | null, rembDisabled: boolean): void {
        this.rtcpRembDisabled = rembDisabled

        const interval = intervalMs ?? SENDER_REPORT_INTERVAL_MS
        if (interval !== this.rtcpIntervalMs) this.resetSchedules(interval)
    }

    private resetSchedules(intervalMs: number): void {
        this.rtcpIntervalMs = intervalMs
        this.audioReportSchedule = SenderReportSchedule.onMediaClock(intervalMs, AUDIO_SAMPLE_RATE)
        this.videoReportSchedule = SenderReportSchedule.onWallClock(intervalMs)
        this.receiverEstimateSchedule = SenderReportSchedule.onWallClock(intervalMs)
        this.audioReceiverEstimateSchedule = SenderReportSchedule.onWallClock(intervalMs)
    }

    /** Whether the audio packet stamped `timestamp` is due a sender report. */
    audioReportDue(timestamp: number): boolean {
        return this.audioReportSchedule.shouldReport(timestamp)
    }

    /** Whether the video frame sent at `now` is due a sender report. */
    videoReportDue(now: number): boolean {
        return this.videoReportSchedule.shouldReport(now)
    }

    /** Ceiling the video extension announces: the last REMB window's, or the initial one. */
    get announcedReceiverEstimate(): number {
        return this.receiverEstimateBitrate > 0
            ? this.receiverEstimateBitrate
            : INITIAL_RECEIVER_ESTIMATE
    }

    /**
     * The stream's timestamp carried forward from the frame captured at `captureMs` to now,
     * so audio and video reports pair timestamp and wall time at the same instant.
     */
    timestampAtAssembly(timestamp: number, captureMs: number, clockRate: number): number {
        return (timestamp + Math.round(((this.clock.now() - captureMs) * clockRate) / 1000)) >>> 0
    }

    /**
     * Emits one compound sender report for `senderSsrc` with the report blocks of the inbound
     * stream it pairs with. `whatsappVideoProfile` sets WhatsApp's profile bit (byte 0 0x91) on
     * a video report; only a single block carries the packet trailer.
     */
    sendSenderReport(
        srtcpContext: SrtcpContext | null,
        senderSsrc: number,
        packetCount: number,
        octetCount: number,
        rtpTimestamp: number,
        reception: RtpStreamReception | AudioReceiveSet,
        whatsappVideoProfile = false
    ): void {
        if (!srtcpContext) return

        let cname = this.rtcpCname
        if (!cname) {
            cname = randomBytes(RTCP_CNAME_LENGTH)
            this.rtcpCname = cname
        }

        try {
            const now = Date.now()
            let blocks: SenderReportReception | readonly SenderReportReception[]
            if (reception instanceof AudioReceiveSet) {
                blocks = whatsappVideoProfile
                    ? reception.videoReceptionReports(now)
                    : reception.receptionReports(now)
            } else {
                blocks = reception.report(now)
            }
            const report = buildSenderReportWithSdes(
                senderSsrc,
                packetCount,
                octetCount,
                rtpTimestamp,
                cname,
                blocks,
                undefined,
                !Array.isArray(blocks) || blocks.length <= 1,
                whatsappVideoProfile
            )
            this.send(srtcpContext, report, senderSsrc)
        } catch (err: unknown) {
            if (this.traceEnabled) {
                this.logger.trace('sender report send failed', {
                    senderSsrc: hexSsrc(senderSsrc),
                    message: toError(err).message
                })
            }
        }
    }

    /**
     * The audio REMB once per RTCP interval, which the peer's quality control needs to leave
     * probing; the video REMB gate does not apply. A group call sends one, on one sender's stream.
     */
    sendAudioReceiverEstimate(
        srtcpContext: SrtcpContext | null,
        rtpSession: RtpSession | null,
        mediaSsrc: number,
        group: AudioReceiveSet | null,
        reception: RtpStreamReception
    ): void {
        if (!this.audioReceiverEstimateSchedule.shouldReport(this.clock.now())) return
        if (!srtcpContext || !rtpSession) return

        const bitrate = nextAudioReceiverEstimate(
            this.audioReceiverEstimateBitrate,
            group ? group.takeLossPercent(mediaSsrc) : reception.takeLossPercent()
        )
        this.audioReceiverEstimateBitrate = bitrate
        const senderSsrc = rtpSession.getSsrc()
        try {
            const remb = buildReceiverEstimatedMaxBitrate(senderSsrc, mediaSsrc, bitrate)
            this.send(srtcpContext, remb, senderSsrc)
            if (this.traceEnabled) {
                this.logger.trace('audio receiver estimate sent', {
                    mediaSsrc: hexSsrc(mediaSsrc),
                    bitrate
                })
            }
        } catch (err: unknown) {
            if (this.traceEnabled) {
                this.logger.trace('audio receiver estimate send failed', {
                    message: toError(err).message
                })
            }
        }
    }

    /**
     * Counts one inbound video payload into the REMB window and sends the video REMB when the
     * interval closes: the capacity we estimate, not the rate arriving. The ceiling updates even
     * with the REMB off: the extension carries it.
     */
    noteVideoReceived(
        octets: number,
        mediaSsrc: number,
        now: number,
        srtcpContext: SrtcpContext | null,
        videoRtpSession: RtpSession | null,
        group: AudioReceiveSet | null,
        reception: RtpStreamReception
    ): void {
        this.videoRecvOctets += octets
        if (this.receiverEstimateWindowStartedAt === 0) {
            this.receiverEstimateWindowStartedAt = now
        }
        if (!this.receiverEstimateSchedule.shouldReport(now)) return

        const bitrate = nextReceiverMaxBitrate(
            this.receiverEstimateBitrate,
            this.videoRecvOctets,
            now - this.receiverEstimateWindowStartedAt,
            group ? group.videoPeakLossPercent() : reception.lossPercent
        )
        this.receiverEstimateBitrate = bitrate
        this.videoRecvOctets = 0
        this.receiverEstimateWindowStartedAt = now

        if (this.rtcpRembDisabled) return

        if (!srtcpContext || !videoRtpSession) return

        const senderSsrc = videoRtpSession.getSsrc()
        const heard = group?.videoSourceSsrcs()
        try {
            const remb = buildReceiverEstimatedMaxBitrate(
                senderSsrc,
                heard && heard.length > 0 ? heard : mediaSsrc,
                bitrate
            )
            this.send(srtcpContext, remb, senderSsrc)
            if (this.traceEnabled) {
                this.logger.trace('receiver estimate sent', {
                    mediaSsrc: hexSsrc(mediaSsrc),
                    bitrate
                })
            }
        } catch (err: unknown) {
            if (this.traceEnabled) {
                this.logger.trace('receiver estimate send failed', {
                    senderSsrc: hexSsrc(senderSsrc),
                    message: toError(err).message
                })
            }
        }
    }

    /** Asks the sender of `mediaSsrc` for a key frame: a PLI, then a FIR. */
    requestKeyFrame(
        srtcpContext: SrtcpContext | null,
        videoRtpSession: RtpSession | null,
        mediaSsrc: number
    ): void {
        if (!srtcpContext || !videoRtpSession) return
        const senderSsrc = videoRtpSession.getSsrc()
        const pli = buildPictureLossIndication(senderSsrc, mediaSsrc, true)
        this.send(srtcpContext, pli, senderSsrc)
        const fir = buildFullIntraRequest(senderSsrc, mediaSsrc, this.videoFirSequence++)
        this.send(srtcpContext, fir, senderSsrc)
        this.logger.debug('video key frame requested', { mediaSsrc: hexSsrc(mediaSsrc) })
    }

    private send(srtcpContext: SrtcpContext, packet: Uint8Array, senderSsrc: number): boolean {
        return this.sendMedia(srtcpContext.protect(packet, senderSsrc))
    }
}
