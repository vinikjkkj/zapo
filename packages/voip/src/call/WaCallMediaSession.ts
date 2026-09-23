import type { Logger } from 'zapo-js'
import { toUserJid } from 'zapo-js/protocol'
import { type BinaryNode, getFirstNodeChild, getNodeChildrenByTag } from 'zapo-js/transport'
import { toError, uint8TimingSafeEqual } from 'zapo-js/util'

import { concatBytes, EMPTY_BYTES, readUInt32BE, toArrayBuffer } from '../bytes.js'
import { derivePerJidSrtpKey } from '../crypto/encryption.js'
import { randomBytes } from '../crypto/primitives.js'
import { SrtcpContext, SrtcpSession, SrtpSession } from '../crypto/srtp.js'
import {
    generateSecureSsrc,
    WA_AUDIO_CALL_SSRC_SLOTS,
    WA_SSRC_SLOT,
    WA_VIDEO_CALL_SSRC_SLOTS
} from '../crypto/ssrc.js'
import { WA_FAST_REMB_ELEMENT_LENGTH, writeFastRembExtension } from '../media/fast-remb.js'
import { H264Depacketizer, isH264KeyFrame, packetizeH264AnnexB } from '../media/h264.js'
import { MLowCodec } from '../media/mlow-codec.js'
import {
    buildFullIntraRequest,
    buildPictureLossIndication,
    buildReceiverEstimatedMaxBitrate,
    buildSenderReportWithSdes,
    nextReceiverMaxBitrate,
    RTCP_CNAME_LENGTH,
    RtpStreamReception,
    SenderReportSchedule
} from '../media/rtcp.js'
import { RtpSession, WA_RTP_EXTENSION_PROFILE } from '../media/rtp.js'
import { WaAudioEngine } from '../media/WaAudioEngine.js'
import { parseRelayFromAck } from '../relay/relay-ack.js'
import { isRtcpPacket, isRtpPacket, isStunPacket } from '../relay/stun.js'
import { TRUE_WEB_CLIENT_RELAY_PORT, WaSctpRelay } from '../relay/WaSctpRelay.js'
import {
    buildAcceptReceiptStanza,
    buildAcceptStanza,
    buildMuteV2Stanza,
    buildPreacceptStanza,
    buildRejectStanza,
    buildRelaylatencyForwardStanza,
    buildRelayLatencyStanza,
    buildTerminateStanza,
    buildTransportStanza,
    decryptCallKey,
    extractNodeInfo,
    extractRelayEndpoints,
    needsDecryption
} from '../signaling/signaling.js'
import { parseVoipSettings, type WaVoipSettings } from '../signaling/voip-settings.js'
import {
    type AudioSender,
    CallDirection,
    CallMediaType,
    CallState,
    EndCallReason,
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
    type RelayEndpoint,
    SRTP_AUTH_TAG_LEN,
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN,
    type WaVoipDeps
} from '../types.js'

import { type CallInfo } from './call-state.js'

/**
 * Milliseconds between two sender reports of one stream. Neither stream kind is
 * paced by a packet count: an audio stream reports once its outgoing RTP
 * timestamp has advanced by this interval expressed in the ticks of its own
 * clock (`intervalMs * clockRate / 1000`, converted once when the stream is
 * created), and a video stream reports on elapsed wall time, whose counter
 * already counts milliseconds.
 *
 * The capture bounds the value instead of pinning it to the tick: across its 28
 * consecutive sender reports the packet count rose by exactly 25 at 960 ticks a
 * packet, which puts the threshold in `23040 < ticks <= 24000` (anything below
 * would have reported on the 24th packet, anything above on the 26th). On the
 * 16 kHz audio clock that is `1440 ms < interval <= 1500 ms`, and 1500 is the
 * one round value inside the band, so a later reading of 1470 would agree with
 * this rather than contradict it.
 *
 * The 16 kHz itself comes from the media clock, not from arrival times: the
 * capture holds codec buffer contents and carries no arrival timestamps at all.
 * It follows from the packetization, 960 ticks per 60 ms packet, and from the
 * per-subframe reading of another capture, 960 ticks over 60 ms.
 *
 * Only the mechanism is proven in the binary. The observed 1500 ms is neither
 * the compiled default (1000 ms, which would close in 17 packets, not 25) nor
 * the fallback (4500 to 5499 ms): the only path that writes the field reads the
 * `rtcp_interval_ms` parameter the server hands down in `<voip_settings>`. The
 * That node is parsed now, but it ships two profiles and only the audio one
 * carries `rc.rtcp_interval_ms`, where it is exactly 1500. A video call never
 * receives the key, so this compiled constant is what actually runs there. The
 * two numbers matching is a coincidence, not a design: the 1500 came from a
 * capture, not from this parameter, so changing it silently moves the real
 * interval of every video call while leaving audio calls untouched.
 */
const SENDER_REPORT_INTERVAL_MS = 1_500

/** Clock rate of the WhatsApp opus stream, the unit of its RTP timestamps. */
const AUDIO_CLOCK_RATE = 16_000
/** Clock rate of the H.264 stream, the unit of its RTP timestamps. */
const VIDEO_CLOCK_RATE = 90_000

/**
 * Ceiling announced before the first reception interval closes. It comes from
 * the bitrate rule itself, asked of it with an empty window, instead of being
 * duplicated as a number: the two transports of the estimate announce the same
 * initial value because they read the same source.
 */
const INITIAL_RECEIVER_ESTIMATE = nextReceiverMaxBitrate(0, 0, 0, 0)

/**
 * Bytes of the video extension before the padding, on the packet that opens a
 * frame. The other packets write 11, because only the opening one carries the
 * frame number, and the opening one is also the one that carries the bitrate
 * estimate, so it is the one that sizes the buffer.
 */
const VIDEO_EXTENSION_FIRST_PACKET_LENGTH = 13

/** `length` rounded up until it closes the 32-bit word. */
function padTo32Bits(length: number): number {
    return (length + 3) & ~3
}

/**
 * Size of the video extension scratch: the largest shape this session emits,
 * which is the frame-opening packet carrying the bitrate estimate as well.
 * Derived from the lengths instead of written by hand, so that changing the
 * packing of the estimate does not leave the buffer short in silence.
 */
const VIDEO_EXTENSION_SCRATCH_LENGTH = padTo32Bits(
    VIDEO_EXTENSION_FIRST_PACKET_LENGTH + WA_FAST_REMB_ELEMENT_LENGTH
)

/**
 * One slice of `scratch` per length the extension can have, indexed by the
 * 32-bit word: the one of `n` words is at `views[n]`.
 *
 * The table exists because `subarray` allocates a new object on every call. It
 * copies no bytes, but on a per-packet path that is garbage proportional to the
 * frame rate times the packets per frame, and the point of the scratch was to
 * have none. With the slices ready, building an extension is writes in place
 * and one indexing.
 */
function buildExtensionViews(scratch: Uint8Array): readonly Uint8Array[] {
    const views = new Array<Uint8Array>(scratch.length / 4 + 1)
    for (let words = 0; words < views.length; words++) {
        views[words] = scratch.subarray(0, words * 4)
    }
    return views
}

/**
 * Base and stride of the payload type family of WhatsApp's video FEC. The
 * client emits `103 + 3k` with `k` in one byte, and the RTP PT field is 7 bits,
 * so inside that field the family is 103, 106, 109 and so on up to 127.
 */
const REED_SOLOMON_FEC_PAYLOAD_BASE = 103
const REED_SOLOMON_FEC_PAYLOAD_STRIDE = 3

/**
 * Tells whether the payload type belongs to WhatsApp's video FEC stream, which
 * is proprietary Reed-Solomon: it is not RTX, not FlexFEC-03 and not ULPFEC.
 * The last two exist in the client binary but only emit 103; 106 comes out of
 * the Reed-Solomon one alone, and in one capture 103 and 106 arrived on the
 * same SSRC, distinct from the SSRC of PT 97 and matching slot 3
 * (`VIDEO.FEC`) of the SSRC derivation.
 *
 * The packet is `[12 bytes of RTP][parity]`, with the SSRC, sequence and
 * timestamp of the FEC stream itself. Everything past the header is opaque
 * parity: there is no 2-byte prefix and no OSN. Recovering a lost packet would
 * take WhatsApp's Reed-Solomon decoder over the same source block, which this
 * package does not implement, so the session counts and discards - by choice,
 * not for lack of knowing the format.
 *
 * The video branch used to accept 103 alongside 97 and cut `subarray(2)` off
 * the payload on an undocumented assumption, pushing parity into H.264 frame
 * assembly: the first parity byte having `& 0x1f` equal to 5, one chance in
 * 32, was enough for the session to announce a key frame that did not exist.
 * 106 never matched that condition, so two payload types of the same stream got
 * different treatment.
 *
 * The routing is by payload type because the PT comes from the packet itself,
 * while the SSRC of the FEC slot depends on deriving the device jid of the peer
 * - the derivation the session already corrects at runtime when the SSRC that
 * arrives is not in the precomputed list, and which is not even computed on an
 * audio call. The formula covers 109 onwards without waiting for a new capture,
 * and it reaches neither 97, below the base, nor the 120 of opus, off the
 * stride.
 */
function isReedSolomonFecPayloadType(pt: number): boolean {
    return (
        pt >= REED_SOLOMON_FEC_PAYLOAD_BASE &&
        (pt - REED_SOLOMON_FEC_PAYLOAD_BASE) % REED_SOLOMON_FEC_PAYLOAD_STRIDE === 0
    )
}

export interface WaCallMediaSessionDelegate {
    emitState(call: CallInfo): void
    emitIncoming(call: CallInfo): void
    emitEnded(call: CallInfo): void
    emitInboundAudio(call: CallInfo, data: Float32Array): void
    emitInboundVideoRtp(call: CallInfo, packet: InboundVideoRtpPacket): void
    emitInboundVideo(call: CallInfo, frame: InboundVideoFrame): void
    emitOutboundAudioFinished(call: CallInfo): void
}

export interface WaCallMediaSessionOptions {
    readonly deps: WaVoipDeps
    readonly logger: Logger
    readonly info: CallInfo
    readonly delegate: WaCallMediaSessionDelegate
    /** See `WaVoipCoordinatorOptions.useOriginalRelayPort`. */
    readonly useOriginalRelayPort?: boolean
}

export class WaCallMediaSession implements AudioSender {
    readonly info: CallInfo

    private readonly deps: WaVoipDeps
    private readonly logger: Logger
    private readonly delegate: WaCallMediaSessionDelegate
    private readonly useOriginalRelayPort: boolean

    private rtpSession: RtpSession | null = null
    private videoRtpSession: RtpSession | null = null
    private srtpSession: SrtpSession | null = null
    private srtcpContext: SrtcpContext | null = null
    private srtcpRecvSession: SrtcpSession | null = null
    private opusCodec: MLowCodec | null = null
    private readonly sctpRelay: WaSctpRelay
    private readonly audioEngine: WaAudioEngine
    private initialTransportSent = false
    private outgoingPreacceptSent = false

    private selfSsrc = 0
    private peerSsrcs: number[] = []
    private selfStreamSsrcs: number[] = []
    private peerStreamSsrcs: number[] = []

    private firstPacketSent = false
    private acceptedByJid: string | null = null
    private readonly debeEnabled = true

    private audioSendCount = 0
    private videoSendFrames = 0
    private videoRecvPackets = 0
    /**
     * Packets of the video Reed-Solomon FEC stream, received and discarded.
     * Kept out of `videoRecvPackets` because it is another stream, on another
     * SSRC.
     */
    private reedSolomonFecPackets = 0
    private audioDropCount = 0
    private realAudioSendCount = 0

    private static readonly EMPTY_BYTES = EMPTY_BYTES

    private encodeBufferA: Float32Array | null = null
    private encodeBufferB: Float32Array | null = null
    private encodeBuffer: Float32Array | null = null
    private encodeBufferPos = 0
    private authPaddingBuffer: Uint8Array | null = null

    private audioRecvCount = 0
    private recvRealCount = 0
    private recvDtxCount = 0
    private subscriptionRefreshInterval: ReturnType<typeof setInterval> | null = null
    private audioOctetCount = 0
    private videoPacketCount = 0
    private videoOctetCount = 0
    private videoFrameNumber = 0
    private videoTransportSequence = 0
    private videoFirSequence = 0
    private receivedVideoKeyFrame = false
    private lastVideoPliAt = 0
    private srtpErrorCount = 0
    private relayPacketCount = 0
    private stunResponseCount = 0
    private selfEchoCount = 0

    /**
     * CNAME of every sender report of this call. One value binds the audio and
     * video streams to the same participant, so it outlives both and is only
     * dropped when the call is cleaned up.
     */
    private rtcpCname: Uint8Array | null = null

    /**
     * Reception statistics of the two inbound streams, tracked apart because
     * their SSRCs, sequence numbers and clock rates are unrelated. Each sender
     * report carries the block of the stream its own SSRC identifies.
     */
    private readonly audioReception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    private readonly videoReception = new RtpStreamReception(VIDEO_CLOCK_RATE)

    /**
     * Report pacing of the two outbound streams, kept apart because each holds
     * its own mark of the last report and counts in its own clock: the audio
     * stream in the ticks of its RTP timestamp, the video stream in elapsed
     * milliseconds.
     */
    private audioReportSchedule = SenderReportSchedule.onMediaClock(
        SENDER_REPORT_INTERVAL_MS,
        AUDIO_CLOCK_RATE
    )
    private videoReportSchedule = SenderReportSchedule.onWallClock(SENDER_REPORT_INTERVAL_MS)

    /**
     * Pacing of the REMB, on the same interval as the sender reports and on the
     * same mechanism, so that no second RTCP clock exists in the session.
     *
     * It is an instance apart from the one of the video sender report because
     * the two measure different things: that one is driven by the send path,
     * this one by the receive path, and on a call where we only receive video
     * the first one never advances. Sharing the instance would make the REMB
     * inherit exactly the defect it exists not to have.
     */
    private receiverEstimateSchedule = SenderReportSchedule.onWallClock(SENDER_REPORT_INTERVAL_MS)

    /**
     * RTCP interval in force on this call: the compiled one, or the one the
     * server sent in `<voip_settings>`. The three schedules are rebuilt
     * together when it changes, because the parameter applies to the RTCP of the
     * call, not to one stream.
     */
    private rtcpIntervalMs = SENDER_REPORT_INTERVAL_MS

    /**
     * `vid_rc.disable_rtcp_remb` of this call, resolved once when the offer
     * arrives. The video receive path reads this per packet, so what is kept is
     * the boolean and not the whole configuration.
     */
    private rtcpRembDisabled = false

    /**
     * Video payload bytes received in the open REMB window, and when it opened.
     * The real duration is measured instead of assumed: the interval is drawn at
     * random inside a band and only closes when a packet arrives.
     */
    private videoRecvOctets = 0
    private receiverEstimateWindowStartedAt = 0

    /**
     * Ceiling announced in the last REMB, or 0 before the first one. It is
     * session state because the ceiling crosses the intervals: deriving it from
     * the rate measured in each window would hand the peer back what it already
     * sends, and its own ceiling would never move from where it is.
     */
    private receiverEstimateBitrate = 0

    /**
     * Buffer of the video RTP header extension, rewritten on every packet.
     *
     * It exists because this is the per-packet path: building the extension in a
     * fresh allocation per packet is garbage proportional to the frame rate
     * times the packets per frame. The size is that of the largest shape the
     * session emits, and `buildVideoExtension` returns a slice of it, valid
     * until the next call.
     */
    private readonly videoExtensionScratch = new Uint8Array(VIDEO_EXTENSION_SCRATCH_LENGTH)

    /**
     * The slices of the scratch, one per possible length. The contents are
     * rewritten before each use, so the returned slice always describes the
     * extension that was just built.
     */
    private readonly videoExtensionViews = buildExtensionViews(this.videoExtensionScratch)

    /**
     * Queues one decoded frame for playout. Bound once so the per-packet decode
     * path allocates no closure. The frames of a decode round are handed over
     * in playout order, concealment first, and the buffer accepts any length,
     * so nothing here needs the sequence number that produced them.
     */
    private readonly onDecodedAudio = (pcm: Float32Array): void => {
        this.audioEngine.onPlaybackData(pcm)
    }

    /**
     * Emits one playout tick to the delegate. The engine hands over its own
     * output buffer, which the next tick overwrites, so the samples are copied
     * before they leave the session and the consumer can keep them.
     */
    private readonly onPlaybackTick = (pcm: Float32Array): void => {
        const samples = new Float32Array(pcm.length)
        samples.set(pcm)
        this.delegate.emitInboundAudio(this.info, samples)
    }

    private actualPeerSsrc: number | null = null
    private ssrcResubscribed = false
    private readonly h264Depacketizers = new Map<number, H264Depacketizer>()

    constructor(options: WaCallMediaSessionOptions) {
        this.deps = options.deps
        this.logger = options.logger
        this.info = options.info
        this.delegate = options.delegate
        this.useOriginalRelayPort = options.useOriginalRelayPort ?? false

        this.sctpRelay = new WaSctpRelay({
            logger: this.logger.child({ component: 'sctp' })
        })

        this.audioEngine = new WaAudioEngine({
            logger: this.logger.child({ component: 'audio-engine' })
        })
        this.audioEngine.setAudioSender(this)
        this.audioEngine.setPlaybackSink(this.onPlaybackTick)
        this.audioEngine.setOnAudioFinished(() => {
            this.delegate.emitOutboundAudioFinished(this.info)
        })

        this.sctpRelay.on('relay_connected', () => {
            this.onRelayConnected()
        })
        this.sctpRelay.on(
            'relay_receive',
            (relayInfo: { ip: string; port: number; data: Uint8Array }) => {
                this.onRelayData(relayInfo.data)
            }
        )
    }

    get callId(): string {
        return this.info.callId
    }

    shouldIgnoreTerminate(peerJid: string | undefined, reason: string | undefined): boolean {
        return Boolean(
            reason === 'accepted_elsewhere' &&
            peerJid &&
            this.acceptedByJid &&
            peerJid !== this.acceptedByJid
        )
    }

    async initMedia(selfLid: string, peerJid: string): Promise<void> {
        const selfDeviceJid = this.ensureDeviceJid(selfLid)
        const peerDeviceJid = this.ensureDeviceJid(peerJid)
        const relaySlots =
            this.info.mediaType === CallMediaType.Video
                ? WA_VIDEO_CALL_SSRC_SLOTS
                : WA_AUDIO_CALL_SSRC_SLOTS
        this.selfStreamSsrcs = relaySlots.map((slot) =>
            generateSecureSsrc(this.info.callId, selfDeviceJid, slot)
        )
        this.peerStreamSsrcs = relaySlots.map((slot) =>
            generateSecureSsrc(this.info.callId, peerDeviceJid, slot)
        )
        if (this.info.mediaType === CallMediaType.Audio) {
            const peerBase = toUserJid(peerJid)
            const peerDevices = (this.info.relayData?.participantJids || [])
                .filter((jid) => toUserJid(jid) === peerBase)
                .map((jid) => this.ensureDeviceJid(jid))
            this.peerStreamSsrcs = Array.from(
                new Set(
                    [peerDeviceJid, ...peerDevices].map((jid) =>
                        generateSecureSsrc(this.info.callId, jid, WA_SSRC_SLOT.AUDIO.MAIN)
                    )
                )
            )
        }
        const ssrc = this.selfStreamSsrcs[0]
        this.rtpSession = RtpSession.whatsappOpus(ssrc)
        if (this.info.mediaType === CallMediaType.Video) {
            // WhatsApp derives every media stream from the same participant id and
            // changes the HKDF slot word. Slot 0 is audio and slot 2 is video.
            // Appending ":video" creates an SSRC the relay/peer does not recognize.
            const videoSsrc = generateSecureSsrc(
                this.info.callId,
                selfDeviceJid,
                WA_SSRC_SLOT.VIDEO.MAIN
            )
            this.videoRtpSession = new RtpSession(videoSsrc, 97, VIDEO_CLOCK_RATE, 3000)
        }
        this.selfSsrc = ssrc

        const peerSsrc = this.peerStreamSsrcs[0]
        this.peerSsrcs = [peerSsrc]

        this.logger.debug('call media initialized', {
            callId: this.info.callId,
            selfSsrc: `0x${ssrc.toString(16).toUpperCase()}`,
            peerSsrc: `0x${peerSsrc.toString(16).toUpperCase()}`
        })

        this.opusCodec = await MLowCodec.create({
            logger: this.logger.child({ component: 'mlow' })
        })
    }

    /**
     * Stores the configuration that came in the offer and resolves from it what
     * this session applies: the REMB gate and the RTCP interval. Called once per
     * call, before any media flows.
     *
     * `null` is not an error, it is the common case of an absent or unreadable
     * node, and it leaves the session exactly as it was: same defaults, same
     * behavior as before this node was read.
     */
    applyVoipSettings(settings: WaVoipSettings | null): void {
        if (!settings) return

        this.info.voipSettings = settings
        this.rtcpRembDisabled = settings.disableRtcpRemb

        const intervalMs = settings.rtcpIntervalMs
        if (intervalMs !== null && intervalMs !== this.rtcpIntervalMs) {
            this.rtcpIntervalMs = intervalMs
            this.audioReportSchedule = SenderReportSchedule.onMediaClock(
                intervalMs,
                AUDIO_CLOCK_RATE
            )
            this.videoReportSchedule = SenderReportSchedule.onWallClock(intervalMs)
            this.receiverEstimateSchedule = SenderReportSchedule.onWallClock(intervalMs)
        }

        this.logger.debug('voip settings applied', {
            callId: this.info.callId,
            sectionCount: settings.sectionCount,
            disableRtcpRemb: this.rtcpRembDisabled,
            rtcpIntervalMs: this.rtcpIntervalMs
        })
    }

    resetOutgoingFlags(): void {
        this.initialTransportSent = false
        this.outgoingPreacceptSent = false
    }

    async acceptCall(): Promise<void> {
        if (!this.info.canAccept) {
            throw new Error(
                `Call ${this.info.callId} cannot be accepted in state ${this.info.stateData.state}`
            )
        }

        this.info.applyTransition({ type: 'local_accepted' })
        this.delegate.emitState(this.info)

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const peerJid = this.info.peerJid
        const isVideo = this.info.mediaType === CallMediaType.Video

        const peerBase = toUserJid(peerJid)
        const participantPeers =
            this.info.relayData?.participantJids?.filter(
                (jid) => toUserJid(jid) === peerBase && /:\d+@/.test(jid)
            ) || []
        const participantPeerJid =
            participantPeers.find((jid) => !/:0@/.test(jid)) || participantPeers[0]
        this.acceptedByJid = participantPeerJid || peerJid
        const resolvedPeerSsrc = generateSecureSsrc(
            callId,
            this.ensureDeviceJid(this.acceptedByJid)
        )
        this.peerSsrcs = [resolvedPeerSsrc]
        this.sctpRelay.setSubscriptionSsrc(resolvedPeerSsrc)
        this.sctpRelay.setStreamSsrcs(this.selfStreamSsrcs, this.peerStreamSsrcs)
        this.initSrtpKeys()

        try {
            const muteNode = buildMuteV2Stanza(peerJid, callId, callCreator, 0, meId)
            await this.deps.lowLevelCoordinator.sendNode(muteNode)
        } catch (err: unknown) {
            this.logger.error('error sending mute_v2', {
                message: toError(err).message
            })
        }

        try {
            const transportNode = buildTransportStanza(peerJid, callId, callCreator, meId, '1', '1')
            await this.deps.lowLevelCoordinator.sendNode(transportNode)
        } catch (err: unknown) {
            this.logger.error('error sending transport', {
                message: toError(err).message
            })
        }

        if (this.info.encryptionKey) {
            const acceptStanza = await buildAcceptStanza(
                this.deps,
                this.info.callId,
                this.info.peerJid,
                this.info.callCreator,
                isVideo
            )

            try {
                await this.deps.lowLevelCoordinator.sendNode(acceptStanza)
            } catch (err: unknown) {
                this.logger.error('accept send error', {
                    message: toError(err).message
                })
            }
        }

        if (this.info.relayData) {
            await this.connectRelays(this.info.relayData.endpoints)
        }

        this.logger.debug('call accepted', { callId })
    }

    async rejectCall(reason: EndCallReason = EndCallReason.Declined): Promise<void> {
        this.info.applyTransition({ type: 'local_rejected', reason })
        this.delegate.emitState(this.info)

        const node = buildRejectStanza(this.info.peerJid, this.info.callId, this.info.callCreator)
        try {
            await this.deps.lowLevelCoordinator.sendNode(node)
        } catch (err) {
            this.logger.warn('reject send failed', { message: toError(err).message })
        }
        this.cleanup()
    }

    async endCall(reason: EndCallReason = EndCallReason.UserEnded): Promise<void> {
        if (this.info.isEnded) return

        const connectedAt = this.info.stateData.connectedAt
        const audioDurationMs = connectedAt ? Date.now() - connectedAt.getTime() : undefined

        this.info.applyTransition({ type: 'terminated', reason })

        const terminateTarget = this.acceptedByJid ?? this.info.peerJid
        const node = buildTerminateStanza(
            terminateTarget,
            this.info.callId,
            this.info.callCreator,
            audioDurationMs
        )
        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        try {
            await this.deps.lowLevelCoordinator.sendNode(node)
        } catch (err) {
            this.logger.warn('terminate send failed', { message: toError(err).message })
        }
        this.cleanup()
    }

    setMute(muted: boolean): void {
        if (!this.info.isActive) return

        this.info.applyTransition({ type: 'audio_mute_changed', muted })
        this.delegate.emitState(this.info)

        this.audioEngine.setMuted(muted)
    }

    async loadAudio(audioPath: string): Promise<void> {
        await this.audioEngine.loadAudioFile(audioPath)
        this.resetEncodeState()
        this.logger.debug('audio loaded for call', { callId: this.info.callId })
    }

    setExternalAudioMode(enabled: boolean): void {
        this.audioEngine.setExternalMode(enabled)
        if (enabled) {
            this.resetEncodeState()
            this.logger.debug('external audio mode enabled', { callId: this.info.callId })
        }
    }

    feedLiveAudio(data: Float32Array): number {
        return this.audioEngine.feedExternalAudio(data)
    }

    feedLiveVideo(data: Uint8Array, timestampUs: number): number {
        if (
            this.info.mediaType !== CallMediaType.Video ||
            !this.videoRtpSession ||
            !this.srtpSession ||
            !this.sctpRelay.hasConnection() ||
            !data.length
        )
            return 0
        const payloads = packetizeH264AnnexB(data, 800)
        const timestamp = Math.floor((Math.max(0, timestampUs) * 90) / 1000) >>> 0
        const keyFrame = isH264KeyFrame(data)
        const receiverEstimate = this.announcedReceiverEstimate
        for (let index = 0; index < payloads.length; index++) {
            const firstPacket = index === 0
            const packet = this.videoRtpSession.createPacketAtTimestamp(
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
            const encrypted = this.srtpSession.protect(packet)
            this.sctpRelay.broadcast(toArrayBuffer(encrypted))
            this.videoPacketCount++
            this.videoOctetCount += payloads[index].length
        }
        if (this.videoReportSchedule.shouldReport(Date.now())) {
            this.sendSenderReport(
                this.videoRtpSession.getSsrc(),
                this.videoPacketCount,
                this.videoOctetCount,
                timestamp,
                this.videoReception,
                true
            )
        }
        this.videoFrameNumber = (this.videoFrameNumber + 1) & 0xffff
        this.videoSendFrames++
        if (this.videoSendFrames === 1 || this.videoSendFrames % 30 === 0) {
            this.logger.debug('video sent', {
                callId: this.info.callId,
                frames: this.videoSendFrames,
                bytes: data.length,
                packets: payloads.length
            })
        }
        return payloads.length
    }

    /**
     * Ceiling the video extension announces now: the one the last reception
     * interval closed on, or the initial value of the bitrate rule itself while
     * none has closed.
     *
     * What moves this number is the receive path, and that is the reason it is
     * session state instead of being computed here: the announced value has to
     * be able to be larger than the rate that arrives, otherwise the sender
     * ceiling of the peer never rises. In the capture the peer does the same -
     * it announces around 150,000 while sending 29.5 kbps.
     */
    private get announcedReceiverEstimate(): number {
        return this.receiverEstimateBitrate > 0
            ? this.receiverEstimateBitrate
            : INITIAL_RECEIVER_ESTIMATE
    }

    /**
     * Builds the header extension of a video packet in the scratch of the
     * session and returns the slice that was written.
     *
     * It allocates nothing, neither the buffer nor the slice: both belong to the
     * session and live as long as it does. The contents of the slice are valid
     * until the next call, which is enough because what receives it is
     * `SrtpSession.protect`, which copies the header into the encrypted packet
     * before returning.
     *
     * A `receiverEstimate` greater than zero appends the element of the receive
     * bitrate estimate behind the elements that were already there. The cadence
     * is the caller's and it is measured: the official client puts that element
     * on the first packet of each frame, 35 times in 176 packets, and not on all
     * of them. It costs one comparison on the packets that do not carry it.
     *
     * The padding is zeroed on every call instead of being inherited from the
     * buffer: a short shape behind a long one would find the bytes of the
     * previous one, and RFC 8285 requires zero there.
     */
    private buildVideoExtension(
        keyFrame: boolean,
        firstPacket: boolean,
        transportSequence: number,
        receiverEstimate: number
    ): Uint8Array {
        const extension = this.videoExtensionScratch
        let offset = 0
        extension[offset++] = firstPacket ? 0x32 : 0x30
        extension[offset++] = keyFrame ? 0x08 : 0x20
        if (firstPacket) {
            extension[offset++] = (this.videoFrameNumber >>> 8) & 0xff
            extension[offset++] = this.videoFrameNumber & 0xff
        }
        extension[offset++] = 0x51
        extension[offset++] = 0
        extension[offset++] = 0
        extension[offset++] = 0x61
        extension[offset++] = 0
        extension[offset++] = 0
        extension[offset++] = 0x91
        extension[offset++] = (transportSequence >>> 8) & 0xff
        extension[offset++] = transportSequence & 0xff
        if (receiverEstimate > 0) {
            offset += writeFastRembExtension(extension, offset, receiverEstimate)
        }
        const padded = padTo32Bits(offset)
        if (padded > offset) extension.fill(0, offset, padded)
        return this.videoExtensionViews[padded >>> 2]
    }

    getLiveBufferMs(): number {
        return this.audioEngine.getLiveBufferMs()
    }

    async sendIncomingPreaccept(peerJid: string): Promise<void> {
        try {
            const preacceptNode = buildPreacceptStanza(
                peerJid,
                this.info.callId,
                this.info.callCreator
            )
            await this.deps.lowLevelCoordinator.sendNode(preacceptNode)
        } catch (err: unknown) {
            this.logger.error('error sending preaccept', {
                message: toError(err).message
            })
        }
    }

    async sendIncomingRelayLatency(): Promise<void> {
        if (!this.info.relayData) return

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const destinationJids = this.info.relayData.participantJids || []
        const seenRelayNames = new Set<string>()

        for (const ep of this.info.relayData.endpoints) {
            const name = ep.relayName || ''
            if (!name || seenRelayNames.has(name)) continue
            seenRelayNames.add(name)

            try {
                const relayData = [
                    {
                        relayName: name,
                        latency: ep.c2rRtt || 0,
                        addressBytes: ep.addressBytes
                    }
                ]
                const relayLatencyNode = buildRelayLatencyStanza(
                    this.info.peerJid,
                    callId,
                    callCreator,
                    relayData,
                    destinationJids,
                    meId
                )
                await this.deps.lowLevelCoordinator.sendNode(relayLatencyNode)
            } catch (err: unknown) {
                this.logger.error('error sending incoming relaylatency', {
                    relayName: name,
                    message: toError(err).message
                })
            }
        }
    }

    async handleCallAccept(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        let srtpFromPeerKey = false

        if (needsDecryption(nodeInfo.tag)) {
            try {
                const peerCallKey = await decryptCallKey(
                    this.deps,
                    nodeInfo.innerNode,
                    peerJid,
                    this.logger.child({ component: 'signaling' })
                )
                if (peerCallKey) {
                    const ourCallKey = this.info.encryptionKey
                    const keysMatch = ourCallKey
                        ? uint8TimingSafeEqual(ourCallKey, peerCallKey)
                        : false
                    if (!keysMatch && ourCallKey) {
                        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
                        const meJid = this.deps.authClient.getCurrentCredentials()?.meJid
                        const ourCredJid = meLid || meJid || ''
                        const ourBase = ourCredJid ? toUserJid(ourCredJid) : ''
                        const participants = this.info.relayData?.participantJids || []
                        const ourDeviceJid =
                            participants.find((jid) => {
                                const jBase = toUserJid(jid)
                                return jBase === ourBase && /:\d+@/.test(jid)
                            }) || ourCredJid

                        if (ourDeviceJid && peerJid) {
                            try {
                                const sendKeying = derivePerJidSrtpKey(
                                    ourCallKey,
                                    this.ensureDeviceJid(ourDeviceJid)
                                )
                                const recvKeying = derivePerJidSrtpKey(
                                    peerCallKey,
                                    this.ensureDeviceJid(peerJid)
                                )
                                this.srtpSession = new SrtpSession(
                                    sendKeying,
                                    recvKeying,
                                    SRTP_SEND_AUTH_TAG_LEN,
                                    SRTP_RECV_AUTH_TAG_LEN
                                )
                                this.srtcpContext = new SrtcpContext(sendKeying)
                                this.srtcpRecvSession = new SrtcpSession(recvKeying)
                                srtpFromPeerKey = true
                                this.logger.debug('srtp re-initialized with peer call_key', {
                                    callId: this.info.callId
                                })
                            } catch (err: unknown) {
                                this.logger.error('per-jid srtp re-derivation failed', {
                                    message: toError(err).message
                                })
                            }
                        }
                    }
                }
            } catch (err: unknown) {
                this.logger.error('accept decrypt error', {
                    message: toError(err).message
                })
            }
        }

        try {
            this.info.applyTransition({ type: 'remote_accepted' })
            this.delegate.emitState(this.info)
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
        const ourJid = meLid || meId
        const ourBase = ourJid ? toUserJid(ourJid) : ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const acceptingDeviceJid =
            this.info.mediaType === CallMediaType.Video && !/:\d+@/.test(peerJid)
                ? peerJid
                : this.info.mediaType === CallMediaType.Video
                  ? this.info.relayData?.participantJids?.find((jid) => {
                        const jidBase = toUserJid(jid)
                        return jidBase !== ourBase && /:[1-9]\d*@/.test(jid)
                    }) || peerJid
                  : peerJid

        this.acceptedByJid = acceptingDeviceJid

        if (this.actualPeerSsrc !== null) {
            const calculatedJid = this.ensureDeviceJid(acceptingDeviceJid)
            this.logger.debug('accept keeping actual peer ssrc', {
                callId,
                actualPeerSsrc: `0x${this.actualPeerSsrc.toString(16)}`,
                calculatedJid
            })
        } else {
            const peerDeviceJidForSsrc = this.ensureDeviceJid(acceptingDeviceJid)
            const acceptSsrc = generateSecureSsrc(callId, peerDeviceJidForSsrc)
            this.peerSsrcs = [acceptSsrc]
            this.logger.debug('accept ssrc assigned', {
                callId,
                jid: peerDeviceJidForSsrc,
                ssrc: `0x${acceptSsrc.toString(16)}`
            })
        }
        const relaySlots =
            this.info.mediaType === CallMediaType.Video
                ? WA_VIDEO_CALL_SSRC_SLOTS
                : WA_AUDIO_CALL_SSRC_SLOTS
        const acceptedPeerDeviceJid = this.ensureDeviceJid(acceptingDeviceJid)
        this.peerStreamSsrcs = relaySlots.map((slot) =>
            generateSecureSsrc(callId, acceptedPeerDeviceJid, slot)
        )
        if (this.info.mediaType === CallMediaType.Audio) {
            const peerBase = toUserJid(peerJid)
            const peerDevices = (this.info.relayData?.participantJids || [])
                .filter((jid) => toUserJid(jid) === peerBase)
                .map((jid) => this.ensureDeviceJid(jid))
            this.peerStreamSsrcs = Array.from(
                new Set(
                    [acceptedPeerDeviceJid, ...peerDevices].map((jid) =>
                        generateSecureSsrc(callId, jid, WA_SSRC_SLOT.AUDIO.MAIN)
                    )
                )
            )
        }
        this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)
        this.sctpRelay.setStreamSsrcs(this.selfStreamSsrcs, this.peerStreamSsrcs)
        this.sctpRelay.resendSubscriptions()

        if (!srtpFromPeerKey) {
            this.initSrtpKeys()
        }

        if (this.info.relayData?.participantJids) {
            const otherDevices = this.info.relayData.participantJids.filter((jid) => {
                if (jid === acceptingDeviceJid) return false
                const jidBase = toUserJid(jid)
                if (jidBase === ourBase) return false
                return true
            })

            for (const deviceJid of otherDevices) {
                try {
                    const terminateNode = buildTerminateStanza(
                        deviceJid,
                        callId,
                        callCreator,
                        undefined,
                        'accepted_elsewhere'
                    )
                    await this.deps.lowLevelCoordinator.sendNode(terminateNode)
                } catch (err: unknown) {
                    this.logger.error('error sending terminate_elsewhere', {
                        deviceJid,
                        message: toError(err).message
                    })
                }
            }
        }

        try {
            const transportNode = buildTransportStanza(
                acceptingDeviceJid,
                callId,
                callCreator,
                meId,
                '1',
                '1'
            )
            await this.deps.lowLevelCoordinator.sendNode(transportNode)
        } catch (err: unknown) {
            this.logger.error('error sending transport', {
                message: toError(err).message
            })
        }

        try {
            const muteNode = buildMuteV2Stanza(acceptingDeviceJid, callId, callCreator, 0, meId)
            await this.deps.lowLevelCoordinator.sendNode(muteNode)
        } catch (err: unknown) {
            this.logger.error('error sending mute_v2', {
                message: toError(err).message
            })
        }

        const acceptMsgId = node.attrs?.id
        if (acceptMsgId) {
            try {
                const receiptNode = buildAcceptReceiptStanza(
                    acceptingDeviceJid,
                    acceptMsgId,
                    callId,
                    callCreator,
                    ourJid
                )
                await this.deps.lowLevelCoordinator.sendNode(receiptNode)
            } catch (err: unknown) {
                this.logger.error('error sending accept receipt', {
                    message: toError(err).message
                })
            }
        }

        if (this.sctpRelay.hasConnection()) {
            try {
                this.info.applyTransition({ type: 'media_connected' })
                this.delegate.emitState(this.info)
                this.startMediaFlow()
            } catch (err) {
                this.logger.trace('call transition skipped', { message: toError(err).message })
            }
        } else if (this.info.relayData) {
            await this.connectRelays(this.info.relayData.endpoints)
        }
    }

    async handleCallPreaccept(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (this.info.direction === CallDirection.Outgoing && this.info.relayData) {
            const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
            const callId = this.info.callId
            const callCreator = this.info.callCreator

            const destinationJids = this.info.relayData.participantJids || []
            const seenRelayNames = new Set<string>()

            for (const ep of this.info.relayData.endpoints) {
                const name = ep.relayName || ''
                if (!name || seenRelayNames.has(name)) continue
                seenRelayNames.add(name)

                try {
                    const relayData = [
                        {
                            relayName: name,
                            latency: ep.c2rRtt || 0,
                            addressBytes: ep.addressBytes
                        }
                    ]
                    const relayLatencyNode = buildRelayLatencyStanza(
                        this.info.peerJid,
                        callId,
                        callCreator,
                        relayData,
                        destinationJids,
                        meId
                    )
                    await this.deps.lowLevelCoordinator.sendNode(relayLatencyNode)
                } catch (err: unknown) {
                    this.logger.error('error sending relaylatency', {
                        relayName: name,
                        message: toError(err).message
                    })
                }
            }

            if (!this.initialTransportSent) {
                try {
                    const basePeerJid = toUserJid(peerJid)
                    const transportNode = buildTransportStanza(
                        basePeerJid,
                        callId,
                        callCreator,
                        meId
                    )
                    await this.deps.lowLevelCoordinator.sendNode(transportNode)
                    this.initialTransportSent = true
                } catch (err: unknown) {
                    this.logger.error('error sending initial transport', {
                        message: toError(err).message
                    })
                }
            }
        }
    }

    async handleCallTransport(_node: BinaryNode): Promise<void> {
        const nodeInfo = extractNodeInfo(_node)
        if (!nodeInfo) return

        const relays = extractRelayEndpoints(nodeInfo.innerNode)
        if (relays.length > 0 && !this.sctpRelay.hasConnection()) {
            this.info.relayData = {
                ...this.info.relayData,
                endpoints: relays
            }
            await this.connectRelays(relays)
        }
    }

    async handleCallAck(node: BinaryNode): Promise<void> {
        const ackType = node.attrs?.type
        if (ackType !== 'offer') return

        const error = node.attrs?.error
        if (error) {
            this.logger.error('ack error', { callId: this.info.callId, error })
            return
        }

        /**
         * `<voip_settings>` is per-call and does not change between the offer
         * acks of one call, so a repeat delivery of this ack (the transport
         * retries an unacked stanza, or the server redelivers) parses the same
         * ~34 KB base64+JSON payload again for no observable effect: applying
         * it twice is harmless, but re-decoding and re-parsing it is not free.
         * Skip once this call already has settings applied.
         */
        if (!this.info.voipSettings) {
            this.applyVoipSettings(parseVoipSettings(node, this.logger))
        }

        const { relays, participantJids, uuid, selfPid, peerPid, hbhKey } = parseRelayFromAck(node)

        if (relays.length > 0) {
            this.info.relayData = {
                endpoints: relays,
                participantJids,
                uuid,
                selfPid,
                peerPid,
                hbhKey
            }

            this.logger.debug('offer ack relays parsed', {
                callId: this.info.callId,
                relayCount: relays.length,
                participantCount: participantJids.length
            })

            const callKey = this.info.encryptionKey
            if (participantJids.length > 0) {
                const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
                const meId = this.deps.authClient.getCurrentCredentials()?.meJid
                const ourCredJid = meLid || meId || ''
                const ourBase = ourCredJid ? toUserJid(ourCredJid) : ''

                const ourDeviceJid = this.ensureDeviceJid(
                    participantJids.find((jid) => {
                        const jidBase = toUserJid(jid)
                        return jidBase === ourBase && /:\d+@/.test(jid)
                    }) || ourCredJid
                )

                const peerJids = participantJids.filter((jid) => {
                    const jidBase = toUserJid(jid)
                    return jidBase !== ourBase
                })
                const peerCandidate =
                    peerJids.find((jid) => /:\d+@/.test(jid) && !/:0@/.test(jid)) || peerJids[0]
                const peerDeviceJid = peerCandidate
                    ? this.ensureDeviceJid(peerCandidate)
                    : undefined

                const newSelfSsrc = generateSecureSsrc(this.info.callId, ourDeviceJid)
                if (newSelfSsrc !== this.selfSsrc) {
                    this.selfSsrc = newSelfSsrc
                    this.rtpSession = RtpSession.whatsappOpus(newSelfSsrc)
                }

                if (this.info.mediaType === CallMediaType.Video) {
                    const relaySlots = WA_VIDEO_CALL_SSRC_SLOTS
                    this.selfStreamSsrcs = relaySlots.map((slot) =>
                        generateSecureSsrc(this.info.callId, ourDeviceJid, slot)
                    )
                    this.selfSsrc = this.selfStreamSsrcs[0]
                    this.rtpSession = RtpSession.whatsappOpus(this.selfSsrc)
                    this.videoRtpSession = new RtpSession(
                        generateSecureSsrc(this.info.callId, ourDeviceJid, WA_SSRC_SLOT.VIDEO.MAIN),
                        97,
                        VIDEO_CLOCK_RATE,
                        3000
                    )
                    if (peerDeviceJid) {
                        this.peerStreamSsrcs = relaySlots.map((slot) =>
                            generateSecureSsrc(this.info.callId, peerDeviceJid, slot)
                        )
                    }
                    this.sctpRelay.setSsrc(this.selfSsrc)
                    this.sctpRelay.setStreamSsrcs(this.selfStreamSsrcs, this.peerStreamSsrcs)
                }

                if (peerDeviceJid) {
                    const peerDeviceSsrc = generateSecureSsrc(this.info.callId, peerDeviceJid)
                    this.peerSsrcs = [peerDeviceSsrc]
                }

                if (callKey) {
                    this.initSrtpKeys()
                } else {
                    this.logger.debug('no call_key, srtp not initialized', {
                        callId: this.info.callId
                    })
                }
            }

            if (this.info.isInitiator && !this.outgoingPreacceptSent) {
                try {
                    const preacceptNode = buildPreacceptStanza(
                        this.info.peerJid,
                        this.info.callId,
                        this.info.callCreator
                    )
                    await this.deps.lowLevelCoordinator.sendNode(preacceptNode)
                    this.outgoingPreacceptSent = true
                } catch (err: unknown) {
                    this.logger.error('error sending preaccept (caller)', {
                        message: toError(err).message
                    })
                }
            }

            await this.connectRelays(relays)

            if (
                this.srtpSession &&
                this.rtpSession &&
                this.opusCodec &&
                this.sctpRelay.hasConnection()
            ) {
                this.audioEngine.startSilenceCapture()
            }
        }
    }

    async handleCallRelaylatency(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const inner = nodeInfo.innerNode
        const callId = inner.attrs?.['call-id'] || this.info.callId
        const callCreator = inner.attrs?.['call-creator'] || this.info.callCreator

        const teNodes = getNodeChildrenByTag(inner, 'te')

        if (teNodes.length === 0) return

        const destinationJids = this.info.relayData?.participantJids || []
        if (destinationJids.length > 0) {
            const forwardNode = buildRelaylatencyForwardStanza(
                peerJid,
                callId,
                callCreator,
                teNodes,
                destinationJids
            )

            try {
                await this.deps.lowLevelCoordinator.sendNode(forwardNode)
            } catch (err: unknown) {
                this.logger.error('error forwarding relaylatency', {
                    message: toError(err).message
                })
            }
        }
    }

    handleRelayElection(node: BinaryNode): void {
        const inner = getFirstNodeChild(node)
        if (!inner) return

        let electedRelayIdx: number | undefined
        if (inner.attrs?.['elected_relay_idx'] !== undefined) {
            const parsed = Number(inner.attrs['elected_relay_idx'])
            if (Number.isSafeInteger(parsed) && parsed >= 0) electedRelayIdx = parsed
        } else if (inner.attrs?.['relay_id'] !== undefined) {
            const parsed = Number(inner.attrs['relay_id'])
            if (Number.isSafeInteger(parsed) && parsed >= 0) electedRelayIdx = parsed
        } else if (inner.content instanceof Uint8Array) {
            const bytes = inner.content
            if (bytes.length >= 4) electedRelayIdx = readUInt32BE(bytes, 0)
            else if (bytes.length > 0) electedRelayIdx = bytes[0]
        }

        if (electedRelayIdx !== undefined) {
            this.info.electedRelayIdx = electedRelayIdx
            this.logger.debug('elected relay index', {
                callId: this.info.callId,
                electedRelayIdx
            })
        }
    }

    async handleCallMuteV2(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator

        try {
            const muteNode = buildMuteV2Stanza(peerJid, callId, callCreator, 0, meId)
            await this.deps.lowLevelCoordinator.sendNode(muteNode)
        } catch (err: unknown) {
            this.logger.error('error sending mute_v2 response', {
                message: toError(err).message
            })
        }
    }

    handleCallTerminate(): void {
        try {
            this.info.applyTransition({
                type: 'terminated',
                reason: EndCallReason.UserEnded
            })
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }

        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        this.cleanup()
    }

    sendCapturedAudio(data: Float32Array): void {
        const hasRelay = this.sctpRelay.hasConnection()
        if (!this.rtpSession || !this.srtpSession || !this.opusCodec || !hasRelay) {
            this.audioDropCount++
            if (this.audioDropCount === 1 || this.audioDropCount % 500 === 0) {
                const missing = [
                    !this.rtpSession && 'rtpSession',
                    !this.srtpSession && 'srtpSession',
                    !this.opusCodec && 'opusCodec',
                    !hasRelay && 'relayConnection'
                ]
                    .filter(Boolean)
                    .join(', ')
                this.logger.debug('audio dropped', {
                    callId: this.info.callId,
                    dropCount: this.audioDropCount,
                    missing
                })
            }
            return
        }

        for (let i = 0; i < data.length; i++) {
            if (!Number.isFinite(data[i])) {
                data[i] = 0
            }
        }

        const frameSamples = this.encodeFrameSamples
        if (!this.encodeBuffer) {
            if (!this.encodeBufferA) {
                this.encodeBufferA = new Float32Array(frameSamples)
                this.encodeBufferB = new Float32Array(frameSamples)
            }
            this.encodeBuffer = this.encodeBufferA
            this.encodeBufferPos = 0
        }

        let offset = 0
        while (offset < data.length) {
            const toCopy = Math.min(data.length - offset, frameSamples - this.encodeBufferPos)
            this.encodeBuffer.set(data.subarray(offset, offset + toCopy), this.encodeBufferPos)
            this.encodeBufferPos += toCopy
            offset += toCopy

            if (this.encodeBufferPos < frameSamples) break

            const frameData: Float32Array = this.encodeBuffer
            this.encodeBuffer =
                frameData === this.encodeBufferA ? this.encodeBufferB! : this.encodeBufferA!
            this.encodeBufferPos = 0

            try {
                const opusFrame = this.opusCodec.encode(frameData)
                this.sendOpusFrame(opusFrame, false)
                this.realAudioSendCount++
            } catch (err: unknown) {
                this.logger.error('encode error', {
                    callId: this.info.callId,
                    message: toError(err).message
                })
            }
        }
    }

    cleanup(): void {
        const opusStats = this.opusCodec?.getStats()
        this.logger.debug('call stats', {
            callId: this.info.callId,
            relayPackets: this.relayPacketCount,
            recvOk: this.audioRecvCount,
            srtpErrors: this.srtpErrorCount,
            sent: this.audioSendCount,
            dropped: this.audioDropCount,
            videoFecDiscarded: this.reedSolomonFecPackets,
            opusOk: opusStats?.success ?? 0,
            opusErr: opusStats?.errors ?? 0
        })

        this.audioEngine.setOnAudioFinished(null)
        this.audioEngine.setPlaybackSink(null)
        this.audioEngine.stop()
        if (this.subscriptionRefreshInterval) {
            clearInterval(this.subscriptionRefreshInterval)
            this.subscriptionRefreshInterval = null
        }
        this.sctpRelay.cleanup()

        if (this.opusCodec) {
            this.opusCodec.destroy()
            this.opusCodec = null
        }

        this.rtpSession = null
        this.videoRtpSession = null
        this.srtpSession = null
        this.srtcpContext = null
        this.srtcpRecvSession = null
        for (const depacketizer of this.h264Depacketizers.values()) depacketizer.reset()
        this.h264Depacketizers.clear()

        this.audioSendCount = 0
        this.audioOctetCount = 0
        this.audioDropCount = 0
        this.audioRecvCount = 0
        this.srtpErrorCount = 0
        this.relayPacketCount = 0
        this.stunResponseCount = 0
        this.selfEchoCount = 0
        this.reedSolomonFecPackets = 0
        this.audioReception.reset()
        this.videoReception.reset()
        this.audioReportSchedule.reset()
        this.videoReportSchedule.reset()
        this.receiverEstimateSchedule.reset()
        this.videoRecvOctets = 0
        this.receiverEstimateWindowStartedAt = 0
        this.receiverEstimateBitrate = 0
        this.rtcpCname = null
        this.actualPeerSsrc = null
        this.ssrcResubscribed = false
        this.recvRealCount = 0
        this.recvDtxCount = 0
        this.initialTransportSent = false
        this.outgoingPreacceptSent = false
        this.firstPacketSent = false
        this.realAudioSendCount = 0
        this.encodeBuffer = null
        this.encodeBufferPos = 0
        this.acceptedByJid = null
    }

    private get encodeFrameSamples(): number {
        return this.opusCodec?.getFrameSize() ?? 960
    }

    private get rtpTsDelta(): number {
        return this.encodeFrameSamples
    }

    private sendOpusFrame(opusFrame: Uint8Array, isSilence: boolean): void {
        if (!this.rtpSession || !this.srtpSession) return

        try {
            let rtpPayload: Uint8Array = opusFrame

            const authPadding = SRTP_AUTH_TAG_LEN - SRTP_SEND_AUTH_TAG_LEN
            if (authPadding > 0) {
                if (!this.authPaddingBuffer || this.authPaddingBuffer.length !== authPadding) {
                    this.authPaddingBuffer = new Uint8Array(authPadding)
                }
                rtpPayload = concatBytes([rtpPayload, this.authPaddingBuffer])
            }

            const marker = !this.firstPacketSent
            const tsDelta = this.rtpTsDelta
            const rtpPacket = this.rtpSession.createPacketWithDuration(rtpPayload, tsDelta, marker)

            if (this.debeEnabled) {
                rtpPacket.header.extension = true
                rtpPacket.header.extensionProfile = WA_RTP_EXTENSION_PROFILE
                rtpPacket.header.extensionData = WaCallMediaSession.EMPTY_BYTES
            }

            if (!this.firstPacketSent) {
                this.firstPacketSent = true
            }

            const srtpData = this.srtpSession.protect(rtpPacket)
            this.sctpRelay.broadcast(toArrayBuffer(srtpData))

            this.audioSendCount++
            this.audioOctetCount += rtpPayload.length
            if (this.audioReportSchedule.shouldReport(rtpPacket.header.timestamp)) {
                this.sendSenderReport(
                    this.rtpSession.getSsrc(),
                    this.audioSendCount,
                    this.audioOctetCount,
                    rtpPacket.header.timestamp,
                    this.audioReception
                )
            }
            if (this.audioSendCount === 1 || this.audioSendCount % 500 === 0) {
                this.logger.debug('audio sent', {
                    callId: this.info.callId,
                    sendCount: this.audioSendCount,
                    opusBytes: opusFrame.length,
                    srtpBytes: srtpData.length,
                    silence: isSilence
                })
            }
        } catch (err: unknown) {
            this.logger.error('error sending audio', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }

    private ensureDeviceJid(jid: string): string {
        if (/:\d+@/.test(jid)) return jid
        return jid.replace('@', ':0@')
    }

    private initSrtpKeys(): void {
        const callKey = this.info.encryptionKey
        if (!callKey) {
            this.logger.debug('no call_key, srtp not initialized', { callId: this.info.callId })
            return
        }

        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
        const meId = this.deps.authClient.getCurrentCredentials()?.meJid
        const ourCredJid = meLid || meId || ''
        const ourBase = toUserJid(ourCredJid)
        const participants = this.info.relayData?.participantJids || []

        const ourDeviceJid = this.ensureDeviceJid(
            participants.find((jid) => {
                const jBase = toUserJid(jid)
                return jBase === ourBase && /:\d+@/.test(jid)
            }) || ourCredJid
        )

        let rawPeerJid = this.acceptedByJid || this.info.peerJid
        if (!this.acceptedByJid) {
            const peerFromParticipants = participants.find((jid) => {
                const jBase = toUserJid(jid)
                return jBase !== ourBase
            })
            if (peerFromParticipants) rawPeerJid = peerFromParticipants
        }
        const peerDeviceJid = this.ensureDeviceJid(rawPeerJid)

        try {
            const sendKeying = derivePerJidSrtpKey(callKey, ourDeviceJid)
            const recvKeying = derivePerJidSrtpKey(callKey, peerDeviceJid)

            this.srtpSession = new SrtpSession(
                sendKeying,
                recvKeying,
                SRTP_SEND_AUTH_TAG_LEN,
                SRTP_RECV_AUTH_TAG_LEN
            )
            this.srtcpContext = new SrtcpContext(sendKeying)
            this.srtcpRecvSession = new SrtcpSession(recvKeying)
            this.logger.debug('srtp per-jid keys initialized', {
                callId: this.info.callId,
                sendJid: ourDeviceJid,
                recvJid: peerDeviceJid
            })
        } catch (err: unknown) {
            this.logger.debug('srtp key derivation failed', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }

    private resetEncodeState(): void {
        this.encodeBuffer = null
        this.encodeBufferPos = 0
        this.realAudioSendCount = 0
        this.audioReception.reset()
        this.opusCodec?.resetSequence()
    }

    private onRelayConnected(): void {
        if (this.info.stateData.state === CallState.Connecting) {
            try {
                this.info.applyTransition({ type: 'media_connected' })
                this.delegate.emitState(this.info)
                this.startMediaFlow()
                this.logger.debug('relay connected, call active', { callId: this.info.callId })
            } catch (err) {
                this.logger.trace('call transition skipped', { message: toError(err).message })
            }
        }
    }

    private onRelayData(data: Uint8Array): void {
        this.relayPacketCount++

        if (isStunPacket(data)) {
            this.stunResponseCount++
            return
        }

        if (isRtcpPacket(data)) {
            if (!this.srtcpRecvSession) return
            try {
                const rtcp = this.srtcpRecvSession.unprotect(data)
                const arrivedAt = Date.now()
                this.audioReception.observeSenderReport(rtcp, arrivedAt)
                this.videoReception.observeSenderReport(rtcp, arrivedAt)
                this.logger.trace('srtcp packet received', {
                    callId: this.info.callId,
                    packetType: rtcp[1],
                    feedbackFormat: rtcp[0] & 0x1f,
                    bytes: rtcp.length
                })
            } catch (err: unknown) {
                this.logger.trace('srtcp unprotect failed', {
                    callId: this.info.callId,
                    message: toError(err).message
                })
            }
            return
        }

        if (!isRtpPacket(data)) return

        const pt = data[1] & 0x7f
        if (!this.srtpSession) return

        if (data.length >= 12) {
            const ssrc = ((data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11]) >>> 0
            if (ssrc === this.selfSsrc || this.selfStreamSsrcs.includes(ssrc)) {
                this.selfEchoCount++
                return
            }

            if (!this.ssrcResubscribed && this.actualPeerSsrc === null) {
                this.actualPeerSsrc = ssrc
                const knownSsrc = this.peerSsrcs.includes(ssrc)
                if (!knownSsrc) {
                    this.peerSsrcs = [ssrc]
                    this.ssrcResubscribed = true
                    this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)
                    this.sctpRelay.resendSubscriptions()
                }
            }
        }

        try {
            const rtpPacket = this.srtpSession.unprotect(data)
            if (pt !== 120) {
                if (pt === 97) {
                    this.videoRecvPackets++
                    this.videoReception.observe(
                        rtpPacket.header.ssrc,
                        rtpPacket.header.sequenceNumber,
                        rtpPacket.header.timestamp,
                        Date.now()
                    )
                    this.videoRecvOctets += rtpPacket.payload.length
                    this.sendReceiverEstimate(rtpPacket.header.ssrc)
                    if (this.videoRecvPackets === 1 || this.videoRecvPackets % 100 === 0) {
                        this.logger.debug('video packet received', {
                            callId: this.info.callId,
                            packets: this.videoRecvPackets,
                            payloadType: pt,
                            ssrc: `0x${rtpPacket.header.ssrc.toString(16)}`
                        })
                    }
                    if (this.videoRecvPackets <= 20) {
                        const nalType = rtpPacket.payload[0] & 0x1f
                        const fuHeader =
                            nalType === 28 && rtpPacket.payload.length > 1
                                ? rtpPacket.payload[1]
                                : 0
                        this.logger.debug('video rtp details', {
                            callId: this.info.callId,
                            packet: this.videoRecvPackets,
                            sequenceNumber: rtpPacket.header.sequenceNumber,
                            timestamp: rtpPacket.header.timestamp,
                            marker: rtpPacket.header.marker,
                            nalType,
                            fuStart: (fuHeader & 0x80) !== 0,
                            fuEnd: (fuHeader & 0x40) !== 0,
                            bytes: rtpPacket.payload.length
                        })
                    }
                    if (!rtpPacket.payload.length) return
                    this.delegate.emitInboundVideoRtp(this.info, {
                        payloadType: pt,
                        sequenceNumber: rtpPacket.header.sequenceNumber,
                        timestamp: rtpPacket.header.timestamp,
                        ssrc: rtpPacket.header.ssrc,
                        marker: rtpPacket.header.marker,
                        payload: rtpPacket.payload
                    })
                    let depacketizer = this.h264Depacketizers.get(rtpPacket.header.ssrc)
                    if (!depacketizer) {
                        depacketizer = new H264Depacketizer()
                        if (this.h264Depacketizers.size >= 8) {
                            const oldest = this.h264Depacketizers.keys().next().value
                            if (oldest !== undefined) {
                                this.h264Depacketizers.get(oldest)?.reset()
                                this.h264Depacketizers.delete(oldest)
                            }
                        }
                        this.h264Depacketizers.set(rtpPacket.header.ssrc, depacketizer)
                    }
                    const frames = depacketizer.push(
                        rtpPacket.payload,
                        rtpPacket.header.timestamp,
                        rtpPacket.header.marker,
                        rtpPacket.header.sequenceNumber
                    )
                    for (const frame of frames) {
                        if (frame.keyFrame) this.receivedVideoKeyFrame = true
                        if (
                            !this.receivedVideoKeyFrame &&
                            Date.now() - this.lastVideoPliAt >= 300
                        ) {
                            this.lastVideoPliAt = Date.now()
                            if (this.srtcpContext && this.videoRtpSession) {
                                const senderSsrc = this.videoRtpSession.getSsrc()
                                const pli = buildPictureLossIndication(
                                    senderSsrc,
                                    rtpPacket.header.ssrc,
                                    true
                                )
                                this.sctpRelay.broadcast(
                                    toArrayBuffer(this.srtcpContext.protect(pli, senderSsrc))
                                )
                                const fir = buildFullIntraRequest(
                                    senderSsrc,
                                    rtpPacket.header.ssrc,
                                    this.videoFirSequence++
                                )
                                this.sctpRelay.broadcast(
                                    toArrayBuffer(this.srtcpContext.protect(fir, senderSsrc))
                                )
                                this.logger.debug('video key frame requested', {
                                    callId: this.info.callId,
                                    mediaSsrc: `0x${rtpPacket.header.ssrc.toString(16)}`
                                })
                            }
                        }
                        this.logger.debug('video frame assembled', {
                            callId: this.info.callId,
                            timestamp: frame.timestamp,
                            keyFrame: frame.keyFrame,
                            bytes: frame.data.length
                        })
                        this.delegate.emitInboundVideo(this.info, {
                            codec: 'h264',
                            timestamp: frame.timestamp,
                            keyFrame: frame.keyFrame,
                            data: frame.data
                        })
                    }
                } else if (isReedSolomonFecPayloadType(pt)) {
                    const fecPackets = ++this.reedSolomonFecPackets
                    if (fecPackets === 1 || fecPackets % 100 === 0) {
                        this.logger.debug('reed-solomon fec packet discarded', {
                            callId: this.info.callId,
                            packets: fecPackets,
                            payloadType: pt,
                            ssrc: `0x${rtpPacket.header.ssrc.toString(16)}`
                        })
                    }
                }
                return
            }
            if (!this.opusCodec) return
            const opusPayload = rtpPacket.payload

            this.audioRecvCount++
            const seq = rtpPacket.header.sequenceNumber
            this.audioReception.observe(
                rtpPacket.header.ssrc,
                seq,
                rtpPacket.header.timestamp,
                Date.now()
            )

            if (opusPayload.length === 0) return

            const isDtx = opusPayload.length <= 2
            if (isDtx) this.recvDtxCount++
            else this.recvRealCount++

            this.opusCodec.decodeSequenced(seq, opusPayload, this.onDecodedAudio)

            if (this.audioRecvCount % 100 === 0) {
                this.opusCodec.setExpectedPacketLossPercent(this.audioReception.lossPercent)
                const stats = this.opusCodec.getStats()
                this.logger.debug('audio recv stats', {
                    callId: this.info.callId,
                    recvCount: this.audioRecvCount,
                    real: this.recvRealCount,
                    dtx: this.recvDtxCount,
                    decodeOk: stats.success,
                    decodeErr: stats.errors,
                    plc: stats.plc,
                    fec: stats.fec,
                    late: stats.late
                })
            }
        } catch (err: unknown) {
            this.srtpErrorCount++
            if (this.srtpErrorCount <= 5) {
                const ssrc = data.length >= 12 ? readUInt32BE(data, 8) : 0
                this.logger.debug('srtp recv error', {
                    callId: this.info.callId,
                    errorCount: this.srtpErrorCount,
                    message: toError(err).message,
                    ssrc: `0x${ssrc.toString(16)}`
                })
            }
        }
    }

    private async connectRelays(endpoints: RelayEndpoint[]): Promise<void> {
        this.logger.debug('connecting relays', {
            callId: this.info.callId,
            endpointCount: endpoints.length
        })

        const seen = new Set<string>()
        const uniqueEndpoints: RelayEndpoint[] = []
        for (const ep of endpoints) {
            if ((ep.protocol ?? 0) !== 0) continue
            const key = `${ep.ip}:${ep.port}`
            if (!seen.has(key)) {
                seen.add(key)
                uniqueEndpoints.push(ep)
            }
        }

        // A relay answers only on the port it advertises, and the endpoints
        // carry a mix. WhatsApp Web dials them all on the web client port and
        // keeps the advertised one as `originalPort`, gating the alternative
        // behind `shouldUseOriginalRelayPort`; this mirrors both sides of that.
        const dialPort = (ep: RelayEndpoint) =>
            this.useOriginalRelayPort ? ep.port : TRUE_WEB_CLIENT_RELAY_PORT
        const relays = uniqueEndpoints
            .filter((ep) => ep.key && ep.rawToken)
            .map((ep) => ({
                ip: ep.ip,
                port: dialPort(ep),
                token: ep.token,
                authToken: ep.authToken,
                rawAuthToken: ep.rawAuthToken,
                rawToken: ep.rawToken,
                key: ep.key,
                relayId: ep.relayId,
                name: ep.relayName || `${ep.ip}:${dialPort(ep)}`,
                authTokenId: ep.authTokenId,
                isFna: ep.isFna
            }))

        if (relays.length === 0) {
            this.logger.error('no relay configs', { callId: this.info.callId })
            return
        }

        this.sctpRelay.setSsrc(this.selfSsrc)
        this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)
        this.sctpRelay.setStreamSsrcs(this.selfStreamSsrcs, this.peerStreamSsrcs)
        this.sctpRelay.setParticipantIds(this.info.relayData?.selfPid, this.info.relayData?.peerPid)

        try {
            await this.sctpRelay.configureRelays(relays)
            this.logger.debug('sctp relays configured', {
                callId: this.info.callId,
                connected: this.sctpRelay.getConnectedCount()
            })
        } catch (err: unknown) {
            this.logger.error('sctp relay error', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }

    private startMediaFlow(): void {
        this.resetEncodeState()
        this.audioEngine.startPlayback()
        this.audioEngine.startCapture()
        if (!this.subscriptionRefreshInterval) {
            this.subscriptionRefreshInterval = setInterval(() => {
                this.sctpRelay.resendSubscriptions()
            }, 5000)
        }
    }

    /**
     * Emits one compound sender report for the stream `senderSsrc` identifies,
     * carrying that stream's own counters, its own RTP timestamp and the report
     * block of the inbound stream it is paired with.
     *
     * Called from the send path once the stream's own schedule says the report
     * interval has closed. `rtpTimestamp` is the timestamp of the packet that
     * closed it, taken from the stream itself, so the report stays on the
     * stream's clock instead of extrapolating wall time.
     *
     * `whatsappVideoProfile` separates the two callers: the video path turns
     * WhatsApp's profile bit on in byte 0 of the sender report, taking it to
     * 0x91, and the audio one stays on the canonical byte. Only this send path
     * knows which stream the report belongs to, so the distinction comes down
     * from here as a parameter instead of being deduced from the SSRC further
     * down.
     *
     * The block count and the trailer stay as the builder defines them: the
     * count derived from `packetCount`, which is already monotonic per call, and
     * the form with a trailer, which is the one of the one-to-one call this
     * client places.
     */
    private sendSenderReport(
        senderSsrc: number,
        packetCount: number,
        octetCount: number,
        rtpTimestamp: number,
        reception: RtpStreamReception,
        whatsappVideoProfile = false
    ): void {
        const srtcpContext = this.srtcpContext
        if (!srtcpContext) return

        let cname = this.rtcpCname
        if (!cname) {
            cname = randomBytes(RTCP_CNAME_LENGTH)
            this.rtcpCname = cname
        }

        try {
            const report = buildSenderReportWithSdes(
                senderSsrc,
                packetCount,
                octetCount,
                rtpTimestamp,
                cname,
                reception.report(Date.now()),
                undefined,
                true,
                whatsappVideoProfile
            )
            this.sctpRelay.broadcast(toArrayBuffer(srtcpContext.protect(report, senderSsrc)))
        } catch (err: unknown) {
            this.logger.trace('sender report send failed', {
                callId: this.info.callId,
                senderSsrc: `0x${senderSsrc.toString(16)}`,
                message: toError(err).message
            })
        }
    }

    /**
     * Emits a REMB when the reception interval closes, announcing to the peer
     * the bitrate this end estimates it can receive - capacity, not the rate
     * that is arriving. The value becomes the ceiling of the estimator of the
     * sender, so handing back what arrives would lock the call in the collapsed
     * state.
     *
     * Called from the receive path, per video packet, and not from the send
     * path: that is the difference that matters. The video sender report only
     * goes out from inside the send path, so on a call where we receive video
     * without sending, no video feedback leaves this end. The REMB does not
     * inherit that - it goes out for as long as video is arriving, with or
     * without video going out, because it is the estimate of the receiver and
     * what feeds it is precisely the reception.
     *
     * `mediaSsrc` is the SSRC that came in the received packet, the same one the
     * key frame request addresses, and not the precomputed SSRC of the peer: the
     * session already corrects the derivation at runtime when what arrives does
     * not match the list, so what is on the wire is the only source that cannot
     * diverge.
     *
     * The per-packet cost is one addition and one subtraction; the rest only
     * runs on the packet that closes the interval.
     *
     * `vid_rc.disable_rtcp_remb` in the offer cancels the send. The server turns
     * that feedback transport off per call, and a REMB emitted anyway is a
     * correct packet the peer does not process - which is exactly what happened
     * before the session read the configuration. Only the send is conditional:
     * the ceiling is computed and stored before the gate, on purpose, because it
     * does not belong to RTCP. What also reads it is the video RTP header
     * extension, and it is precisely on the calls where the server turns the
     * REMB off that this other transport is the only one left - leaving the
     * computation behind the gate would keep it stuck at zero exactly where it
     * matters.
     */
    private sendReceiverEstimate(mediaSsrc: number): void {
        const now = Date.now()
        if (this.receiverEstimateWindowStartedAt === 0) {
            this.receiverEstimateWindowStartedAt = now
        }
        if (!this.receiverEstimateSchedule.shouldReport(now)) return

        const bitrate = nextReceiverMaxBitrate(
            this.receiverEstimateBitrate,
            this.videoRecvOctets,
            now - this.receiverEstimateWindowStartedAt,
            this.videoReception.lossPercent
        )
        this.receiverEstimateBitrate = bitrate
        this.videoRecvOctets = 0
        this.receiverEstimateWindowStartedAt = now

        if (this.rtcpRembDisabled) return

        const srtcpContext = this.srtcpContext
        const videoRtpSession = this.videoRtpSession
        if (!srtcpContext || !videoRtpSession) return

        const senderSsrc = videoRtpSession.getSsrc()
        try {
            const remb = buildReceiverEstimatedMaxBitrate(senderSsrc, mediaSsrc, bitrate)
            this.sctpRelay.broadcast(toArrayBuffer(srtcpContext.protect(remb, senderSsrc)))
            this.logger.trace('receiver estimate sent', {
                callId: this.info.callId,
                mediaSsrc: `0x${mediaSsrc.toString(16)}`,
                bitrate
            })
        } catch (err: unknown) {
            this.logger.trace('receiver estimate send failed', {
                callId: this.info.callId,
                senderSsrc: `0x${senderSsrc.toString(16)}`,
                message: toError(err).message
            })
        }
    }
}
