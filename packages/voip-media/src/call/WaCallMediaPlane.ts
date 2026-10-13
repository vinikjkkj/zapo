import type { WaCallReaction } from '../app-data/protocol.js'
import { WaAppDataStream } from '../app-data/WaAppDataStream.js'
import { bytesToHex, EMPTY_BYTES, readUInt32BE, toArrayBuffer } from '../bytes.js'
import { setBoundedMapEntry } from '../collections.js'
import type { WaMediaCrypto } from '../crypto/primitives.js'
import { randomBytes } from '../crypto/random.js'
import {
    SrtcpContext,
    SrtcpSession,
    SRTP_MAX_RECV_CONTEXTS,
    SrtpError,
    SrtpSession
} from '../crypto/srtp.js'
import { toError } from '../errors.js'
import type { WaMediaHost } from '../host.js'
import { createNoopLogger, isLogLevelEnabled, type Logger } from '../logger.js'
import { type AudioReceiveSenderStats, AudioReceiveSet } from '../media/audio-receive-set.js'
import { WA_FAST_REMB_ELEMENT_LENGTH, writeFastRembExtension } from '../media/fast-remb.js'
import { H264Depacketizer, packetizeH264Frame } from '../media/h264.js'
import {
    MLOW_MAX_PACKET_BYTES,
    MLOW_TOC_VAD,
    MLowCodec,
    type MLowCompanionModelSource,
    type MLowDecodeOutcome,
    MlowPacketRead,
    type MLowRedOptions
} from '../media/mlow-codec.js'
import {
    buildFullIntraRequest,
    buildPictureLossIndication,
    buildReceiverEstimatedMaxBitrate,
    buildSenderReportWithSdes,
    nextAudioReceiverEstimate,
    nextReceiverMaxBitrate,
    RTCP_CNAME_LENGTH,
    RtpStreamReception,
    type SenderReportReception,
    SenderReportSchedule
} from '../media/rtcp.js'
import {
    type RtpHeader,
    type RtpPacket,
    RtpSession,
    WA_RTP_EXTENSION_PROFILE
} from '../media/rtp.js'
import { WaJitterBuffer, type WaJitterBufferStats } from '../media/WaJitterBuffer.js'
import { HostCaptureTimeMapper, WaMediaClock } from '../media/WaMediaClock.js'
import {
    buildRxSubscriptions,
    isRtcpPacket,
    isRtpPacket,
    isStunPacket,
    type RxVideoSubscription
} from '../relay/stun.js'
import { readWarpFrame } from '../relay/warp-frame.js'
import {
    type RawUdpLeg,
    type RawUdpLegOptions,
    TRUE_WEB_CLIENT_RELAY_PORT,
    WaSctpRelay
} from '../relay/WaSctpRelay.js'
import { unrefTimer } from '../timers.js'
import {
    AUDIO_SAMPLE_RATE,
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
    PayloadType,
    type SrtpKeyingMaterial
} from '../types.js'

import {
    dialableRelayEndpoints,
    type WaCallMediaGroup,
    type WaCallMediaKeys,
    type WaCallMediaPlanUpdate,
    type WaCallMediaRelays,
    type WaCallMediaSettings,
    type WaCallMediaSsrcs,
    type WaCallMediaVideo
} from './plan.js'

/** Default RTCP interval; an audio call runs the server's `rc.rtcp_interval_ms` instead. */
const SENDER_REPORT_INTERVAL_MS = 1_000

/** Clock rate of the H.264 stream, the unit of its RTP timestamps. */
const VIDEO_CLOCK_RATE = 90_000

/** Samples in one frame of the codec, used until the codec itself is loaded. */
const DEFAULT_FRAME_SAMPLES = 960

/** Most frames bundled per audio packet: the two the official 1:1 client sends. */
const MAX_AUDIO_FRAMES_PER_PACKET = 2

/**
 * How far a frame's capture instant may drift from the stream's timeline: 120 ms. Later
 * and the stream jumps to the clock with the marker set; earlier and the frame is shed.
 */
const AUDIO_TIMELINE_SLACK_TICKS = (120 * AUDIO_SAMPLE_RATE) / 1000

/**
 * Playout queue capacity: three of the largest packets the decoder produces,
 * 120 ms frames aggregated two at a time, at 16 kHz. 720 ms.
 */
const PLAYOUT_CAPACITY_SAMPLES = 11_520

/** How often the relay subscriptions are replayed while media flows. */
const SUBSCRIPTION_REFRESH_INTERVAL_MS = 5_000

/** Shortest gap between two key frame requests while no key frame has arrived. */
const KEY_FRAME_REQUEST_INTERVAL_MS = 300

/** Ceiling announced before the first REMB window closes: the bitrate rule on an empty one. */
const INITIAL_RECEIVER_ESTIMATE = nextReceiverMaxBitrate(0, 0, 0, 0)

/** Video extension bytes before padding on a frame's first packet; the other packets write 11. */
const VIDEO_EXTENSION_FIRST_PACKET_LENGTH = 13

/** Memory guard on a set fed from the plan, one entry per peer device; a group plan replaces it whole. */
const MAX_TRACKED_PEER_APP_DATA_SSRCS = 32

/**
 * Silence after which a group sender counts as no longer received, by default: the time a peer
 * waits before it reports another participant invisible.
 */
const DEFAULT_SENDER_SILENCE_MS = 20_000
/** How often group senders are checked for that silence, at most. */
const SENDER_SILENCE_CHECK_MS = 1_000
/** Video streams a group sender may send at once: main and secondary. */
const VIDEO_STREAMS_PER_SENDER = 2

/**
 * Remote senders of a group call given a decoder at once: the compiled participant ceiling.
 * A sender is a device, so a roster of many multi-device accounts can pass it.
 */
const MAX_GROUP_SENDERS = 64

/** Reassembly buffers kept per inbound video SSRC, at least; the oldest is dropped on overflow. */
const MAX_H264_DEPACKETIZERS = 8

/** `length` rounded up until it closes the 32-bit word. */
function padTo32Bits(length: number): number {
    return (length + 3) & ~3
}

/** The largest video extension: a frame's first packet, carrying the bitrate estimate too. */
const VIDEO_EXTENSION_SCRATCH_LENGTH = padTo32Bits(
    VIDEO_EXTENSION_FIRST_PACKET_LENGTH + WA_FAST_REMB_ELEMENT_LENGTH
)

/** One slice of `scratch` per length in 32-bit words, so no packet calls `subarray`. */
function buildExtensionViews(scratch: Uint8Array): readonly Uint8Array[] {
    const views = new Array<Uint8Array>(scratch.length / 4 + 1)
    for (let words = 0; words < views.length; words++) {
        views[words] = scratch.subarray(0, words * 4)
    }
    return views
}

const REED_SOLOMON_FEC_PAYLOAD_STRIDE = 3

/**
 * WhatsApp's proprietary Reed-Solomon video FEC (`103 + 3k`): opaque parity, counted and
 * discarded. The formula also reaches 121, which the receive path claims as audio first.
 */
function isReedSolomonFecPayloadType(pt: number): boolean {
    return (
        pt >= PayloadType.WhatsAppVideoFec &&
        (pt - PayloadType.WhatsAppVideoFec) % REED_SOLOMON_FEC_PAYLOAD_STRIDE === 0
    )
}

/** An SSRC as logged. */
function hexSsrc(ssrc: number): string {
    return `0x${ssrc.toString(16)}`
}

/** Reassembly and key frame requests of one inbound video SSRC; a request names one stream. */
interface InboundVideoStream {
    readonly depacketizer: H264Depacketizer
    keyFrameReceived: boolean
    lastKeyFrameRequestAt: number
}

/** Whether two SSRC lists are the same, order included: the order is what the relay gets. */
function sameSsrcs(left: readonly number[], right: readonly number[]): boolean {
    if (left.length !== right.length) return false
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) return false
    }
    return true
}

/** `base` followed by whatever of `extra` it lacks, in order. */
function unionInOrder(base: readonly number[], extra: readonly number[]): number[] {
    const merged = [...base]
    for (const ssrc of extra) {
        if (!merged.includes(ssrc)) merged.push(ssrc)
    }
    return merged
}

export interface WaCallMediaPlaneEvents {
    /** Media started flowing: the call is accepted and a relay leg is up. Fired once. */
    readonly onActive?: () => void
    /**
     * The call has no relay leg left, open or dialling, and nothing redials. The
     * media is gone; ending the call is signaling's decision.
     */
    readonly onRelayLost?: (reason: string) => void
    /** A relay answered one of our legs for the first time; see `WaSctpRelayOptions.onRelayAnswered`. */
    readonly onRelayAnswered?: (name: string, rttMs?: number) => void
    /**
     * One in-band emoji reaction, deduplicated: the sender repeats it, this fires once. In a
     * group call `senderId` names the sender whose stream carried it.
     */
    readonly onReaction?: (reaction: WaCallReaction, senderId?: string) => void
    readonly onInboundVideoRtp?: (packet: InboundVideoRtpPacket) => void
    readonly onInboundVideo?: (frame: InboundVideoFrame) => void
    /**
     * One group sender's decoded audio, before the mix {@link WaCallMediaPlane.pullPlayout}
     * plays. `pcm` is reused after the call returns.
     */
    readonly onSenderAudio?: (senderId: string, pcm: Float32Array) => void
    /**
     * A group sender's media started arriving (`true`, on its first authenticated packet) or
     * stopped (`false`, after {@link WaCallMediaPlaneOptions.senderSilenceMs} without one).
     */
    readonly onSenderMedia?: (senderId: string, receiving: boolean) => void
}

export interface WaCallMediaPlaneOptions extends WaMediaHost, WaCallMediaPlaneEvents {
    readonly logger?: Logger
    /** See `WaSctpRelayOptions.createRawUdpLeg`. */
    readonly createRawUdpLeg?: (options: RawUdpLegOptions) => RawUdpLeg
    /**
     * Which relays `createRawUdpLeg` dials: `all` (the default), or only the endpoints the plan
     * marks `transport: 'raw-udp'`, the others going over the peer connection.
     */
    readonly rawUdpLegs?: 'all' | 'required'
    /**
     * Silence after which a group sender counts as no longer received; a local choice, 20 s by
     * default.
     */
    readonly senderSilenceMs?: number
    /**
     * Asks the relay for `group.videoSubscriptions`. Off by default, until the relay's handling
     * of them is confirmed; off, the plan's subscriptions are ignored.
     */
    readonly videoSubscriptions?: boolean
    /** Dials every relay on the port it advertises instead of the web client's port. */
    readonly useOriginalRelayPort?: boolean
    /**
     * Monotonic time source of the media clock, in ms; `performance.now()` by default.
     * Every `capturedAtMs` given to {@link WaCallMediaPlane.pushCapture} is on this scale.
     */
    readonly now?: () => number
    /**
     * Weights of the MLow Companion, the neural post-filter WhatsApp runs in its MLow decoder:
     * its `mlow_companion_v1.pte` (a `DNNw` blob), as bytes or a loader called each time a call
     * loads the codec. Not shipped with any package; weights that fail to load are skipped.
     */
    readonly mlowCompanionModel?: MLowCompanionModelSource
    /**
     * Sends MLow RED as a plain multiframe, the low-rate copy of the previous frame then the
     * frame, stamped on the copy. Off by default. Turns DTX off and overrides the bundling the
     * plan asks for.
     */
    readonly mlowRed?: boolean | MLowRedOptions
}

export interface WaCallMediaStats {
    readonly relayPackets: number
    readonly audioSent: number
    readonly audioDropped: number
    /** Capture pauses the audio timeline jumped over, each sent with the marker set. */
    readonly audioTimelineResyncs: number
    /** Captured audio frames discarded because the host delivered them ahead of the clock. */
    readonly audioFramesShed: number
    /**
     * Capture instant minus timestamp of the last audio frame sent, in ms: positive when the
     * timeline runs behind. Bounded by the timeline's slack.
     */
    readonly audioCaptureSkewMs: number
    readonly audioReceived: number
    /** PT 121 packets discarded for not parsing as MLow; the rest decode with the PT 120 audio. */
    readonly audioRedDiscarded: number
    /** Inbound RTP dropped by SRTP: the sum of the three below. */
    readonly srtpErrors: number
    /** Packets already received, as is every copy after the first that another relay leg delivers. */
    readonly srtpReplays: number
    /** Packets whose SRTP auth tag did not verify. */
    readonly srtpAuthFailures: number
    /** Any other failure: a malformed packet, or an exception past decryption. */
    readonly srtpOtherErrors: number
    readonly videoFramesSent: number
    readonly videoPacketsReceived: number
    readonly videoFecDiscarded: number
    readonly decoded: number
    readonly decodeErrors: number
    readonly playout: WaJitterBufferStats
    /** Per remote sender of a group call; absent on a 1:1 call. */
    readonly senders?: readonly WaCallMediaSenderStats[]
    /** Group packets on an SSRC the plan keys for no sender, dropped; absent on a 1:1 call. */
    readonly unplannedPackets?: number
    /** Inbound datagrams the relay framed around RTP, unframed and passed on. */
    readonly warpFrames?: number
    /** Relay frames with no RTP inside, dropped. */
    readonly warpControlFrames?: number
    /** Relay frames whose header ran past the datagram, dropped. */
    readonly warpOverruns?: number
}

/** The audio of one remote sender of a group call. */
export type WaCallMediaSenderStats = AudioReceiveSenderStats

/**
 * The media of one call, driven by a plan from signaling ({@link apply}) and by the host's
 * capture and playout. Audio and video are stamped on one {@link WaMediaClock} per call.
 */
export class WaCallMediaPlane {
    private readonly logger: Logger
    private readonly traceEnabled: boolean
    private readonly events: WaCallMediaPlaneEvents
    private readonly crypto: WaMediaCrypto
    private readonly sctpRelay: WaSctpRelay
    private readonly useOriginalRelayPort: boolean
    private readonly companionModel: MLowCompanionModelSource | undefined
    private readonly senderSilenceMs: number
    private readonly videoSubscriptionsEnabled: boolean
    private readonly redOptions: boolean | MLowRedOptions | undefined
    private readonly playout: WaJitterBuffer
    /** The call's media clock; its origin is the caller's warmup or the start of the flow. */
    private readonly clock: WaMediaClock
    /** Maps the host's video capture timestamps onto the clock, one video tick apart at least. */
    private readonly videoCaptureTimes = new HostCaptureTimeMapper(1000 / VIDEO_CLOCK_RATE)

    private mediaType: 'audio' | 'video' = 'audio'
    private accepted = false
    private muted = false
    private relays: WaCallMediaRelays | null = null
    private ssrcs: WaCallMediaSsrcs | null = null
    private keyEpoch: number | null = null
    /** Generation of the relays held; see `WaCallMediaRelays.generation`. */
    private relayGeneration = 0

    /** Set by a non-null `group` section: a decoder per remote sender, mixed for playout. */
    private groupAudio: AudioReceiveSet | null = null
    private groupSenders: WaCallMediaGroup['senders'] = []
    /** SSRCs the group's receive keying is installed on, in SRTP and SRTCP alike. */
    private readonly groupRecvSsrcs = new Set<number>()
    /** The one group stream the audio REMB names: the first heard, until its sender leaves. */
    private groupRembSsrc = 0
    private senderSilenceTimer: ReturnType<typeof setInterval> | null = null
    /** Whether the relay was handed a video subscription; see `WaCallMediaGroup.videoSubscriptions`. */
    private rxSubscriptionsDeclared = false
    /** Inbound video streams reassembled at once: the default, or two per group sender. */
    private maxVideoStreams = MAX_H264_DEPACKETIZERS

    private codec: MLowCodec | null = null
    private rtpSession: RtpSession | null = null
    private videoRtpSession: RtpSession | null = null
    private srtpSession: SrtpSession | null = null
    private srtcpContext: SrtcpContext | null = null
    private srtcpRecvSession: SrtcpSession | null = null

    /** Our streams and the peer's the relay is told about, plan plus what video opened. */
    private selfStreams: number[] = []
    /** `selfStreams` as a set, for the echo filter on every inbound packet. */
    private selfStreamSet = new Set<number>()
    private peerStreams: number[] = []
    /** The peer stream the relay subscription names: the plan's, or the one that arrived. */
    private subscriptionSsrc = 0
    /** Our stream the relay registration names, as last handed to the relay. */
    private registeredSelfSsrc = 0
    /** Whether the relay was handed our streams by layer; see `WaCallMediaSsrcs.selfLayers`. */
    private selfLayersDeclared = false
    /** Set while an update is applied, so the relay replays its registrations once at the end. */
    private deferResend = false
    private resendPending = false

    /** The in-band app-data stream of this call; see {@link WaAppDataStream}. */
    private appDataStream: WaAppDataStream | null = null
    /**
     * App-data SSRCs of the peer's devices: inbound app data is recognized by SSRC,
     * never by payload type, which nothing negotiates.
     */
    private readonly peerAppDataSsrcs = new Set<number>()

    /** Whether the peer's video was let in on a call negotiated as audio. */
    private videoReceivePathOpened = false
    /**
     * Whether an accepted upgrade opened our video sender on a call negotiated as
     * audio. Until it does {@link sendVideoFrame} drops every frame.
     */
    private videoSendPathOpened = false
    /** Whether our video is held for the peer; see {@link WaCallMediaVideo.sendHeld}. */
    private videoSendHeld = false

    private applying: Promise<void> = Promise.resolve()
    private starting: Promise<void> | null = null
    private flowing = false
    /** Whether our video stream went out yet: it opens on a key frame, never on a delta. */
    private videoStreamOpen = false
    private stopped = false
    /**
     * Set when a leg is up before the call is accepted, the caller's warmup: captured
     * audio then goes out as silence until the flow starts for real.
     */
    private silenceWarmup = false

    /**
     * Unanchored, the next audio frame takes its timestamp from the clock; anchored, frames
     * follow on from `nextAudioTimestamp` while their capture stays within the slack.
     */
    private audioTimelineAnchored = false
    private nextAudioTimestamp = 0
    /**
     * Samples the plane dropped since the last frame sent (no leg, keys or codec, a failed
     * encode). The next frame steps over them, so the wire gap matches the audio lost.
     */
    private pendingSkipSamples = 0
    /** Capture instant, on the clock, of the first sample in the encode buffer. */
    private encodeBufferCaptureMs = 0
    private audioTimelineResyncs = 0
    private audioFramesShed = 0
    /** Clock ticks of the last frame's capture instant minus its timestamp. */
    private audioCaptureSkewTicks = 0

    /** Frames bundled per audio packet: the plan's `rc.maxfpp`, 1 until it says otherwise. */
    private audioFramesPerPacket = 1
    /** Two encode targets, so a frame waiting for its bundle survives the next encode. */
    private readonly encodeSlots = [
        new Uint8Array(MLOW_MAX_PACKET_BYTES),
        new Uint8Array(MLOW_MAX_PACKET_BYTES)
    ]
    /** The two frames of a bundle, handed to the repacketizer without a fresh array. */
    private readonly bundlePair: Uint8Array[] = [EMPTY_BYTES, EMPTY_BYTES]
    /** A speech frame waiting for the next to share its packet: a view into one of the slots. */
    private pendingAudio: Uint8Array | null = null
    private pendingAudioTimestamp = 0
    private pendingAudioMarker = false
    private pendingAudioCaptureMs = 0
    /** RED: the redundant copy of the last frame sent, which the next packet carries first. */
    private previousSecondary: Uint8Array | null = null
    private previousSecondaryTimestamp = 0
    private previousSecondaryCaptureMs = 0

    private audioSendCount = 0
    private audioOctetCount = 0
    private audioDropCount = 0
    private audioRecvCount = 0
    private audioRedDiscardCount = 0
    /** The PT 121 packet being received, read once for the check and the decode. */
    private readonly pt121Read = new MlowPacketRead()
    private recvRealCount = 0
    private recvDtxCount = 0
    private videoSendFrames = 0
    private videoRecvPackets = 0
    /** Video Reed-Solomon FEC packets, discarded; another stream, so not in `videoRecvPackets`. */
    private reedSolomonFecPackets = 0
    private srtpReplayCount = 0
    private srtpAuthFailureCount = 0
    private srtpOtherErrorCount = 0
    private relayPacketCount = 0
    private warpFrameCount = 0
    private warpControlFrameCount = 0
    private warpOverrunCount = 0
    /** Group packets on an SSRC the plan keys for no sender, dropped before SRTP. */
    private unplannedPacketCount = 0

    private encodeBufferA: Float32Array | null = null
    private encodeBufferB: Float32Array | null = null
    private encodeBuffer: Float32Array | null = null
    private encodeBufferPos = 0
    /** Zeros, sliced to the length of whatever capture has to go out as silence. */
    private silenceScratch = new Float32Array(DEFAULT_FRAME_SAMPLES)

    private subscriptionRefreshTimer: ReturnType<typeof setInterval> | null = null
    private videoPacketCount = 0
    private videoOctetCount = 0
    /** Timestamp of the last video frame sent, valid once one was. */
    private videoTimestamp = 0
    private videoFrameNumber = 0
    private videoTransportSequence = 0
    private videoFirSequence = 0
    private lastKeyFrameRequestAt = 0

    /** CNAME of every sender report, binding the call's audio and video to one participant. */
    private rtcpCname: Uint8Array | null = null

    private readonly audioReception = new RtpStreamReception(AUDIO_SAMPLE_RATE)
    private readonly videoReception = new RtpStreamReception(VIDEO_CLOCK_RATE)

    /** RTCP interval in force: the compiled one, or the server's; the schedules below follow it. */
    private rtcpIntervalMs = SENDER_REPORT_INTERVAL_MS
    /** Audio reports pace on RTP timestamp ticks, video reports on wall time. */
    private audioReportSchedule!: SenderReportSchedule
    private videoReportSchedule!: SenderReportSchedule
    /** Paced from the receive path, unlike the video report, which the send path drives. */
    private receiverEstimateSchedule!: SenderReportSchedule
    private audioReceiverEstimateSchedule!: SenderReportSchedule

    /** Whether the server turned the RTCP REMB off; gates the video REMB send. */
    private rtcpRembDisabled = false

    /** Video payload bytes in the open REMB window, and when it opened. */
    private videoRecvOctets = 0
    private receiverEstimateWindowStartedAt = 0

    /** Ceiling announced in the last REMB, or 0 before the first; it carries across windows. */
    private receiverEstimateBitrate = 0
    private audioReceiverEstimateBitrate = 0

    /** The video RTP header extension, rewritten in place per packet. */
    private readonly videoExtensionScratch = new Uint8Array(VIDEO_EXTENSION_SCRATCH_LENGTH)
    private readonly videoExtensionViews = buildExtensionViews(this.videoExtensionScratch)

    /** Queues one decoded frame for playout; bound once so the decode path allocates no closure. */
    private readonly onDecodedAudio = (pcm: Float32Array): void => {
        this.playout.write(pcm)
    }

    private actualPeerSsrc: number | null = null
    private readonly inboundVideoStreams = new Map<number, InboundVideoStream>()

    constructor(options: WaCallMediaPlaneOptions) {
        this.logger = options.logger ?? createNoopLogger()
        this.traceEnabled = isLogLevelEnabled(this.logger, 'trace')
        this.events = options
        this.crypto = options.crypto
        this.useOriginalRelayPort = options.useOriginalRelayPort ?? false
        this.companionModel = options.mlowCompanionModel
        this.redOptions = options.mlowRed
        this.senderSilenceMs = options.senderSilenceMs ?? DEFAULT_SENDER_SILENCE_MS
        this.videoSubscriptionsEnabled = options.videoSubscriptions ?? false
        this.resetRtcpSchedules(SENDER_REPORT_INTERVAL_MS)
        this.clock = new WaMediaClock(options.now)
        this.playout = new WaJitterBuffer(
            PLAYOUT_CAPACITY_SAMPLES,
            this.logger.child({ component: 'playout' })
        )
        this.sctpRelay = new WaSctpRelay({
            logger: this.logger.child({ component: 'sctp' }),
            crypto: options.crypto,
            createPeerConnection: options.createPeerConnection,
            createRawUdpLeg: options.createRawUdpLeg,
            rawUdpLegs: options.rawUdpLegs ?? 'all',
            now: options.now,
            onConnected: () => this.onRelayConnected(),
            onLost: (reason) => this.onRelayLost(reason),
            onRelayAnswered: (name, rttMs) => {
                if (!this.stopped) this.events.onRelayAnswered?.(name, rttMs)
            },
            onReceive: (data, connectionId) => this.onRelayData(data, connectionId)
        })
    }

    /** Whether media is flowing: accepted, a leg up, and not stopped. */
    get isFlowing(): boolean {
        return this.flowing
    }

    /**
     * Whether a leg came up before the accept (the caller's warmup): capture pushed now goes
     * out as silence, so a host must run its capture clock before media flows.
     */
    get isWarmingUp(): boolean {
        return this.silenceWarmup
    }

    /** Loads the codec. Nothing is encoded or decoded before it resolves. */
    start(): Promise<void> {
        this.starting ??= this.loadCodec()
        return this.starting
    }

    private async loadCodec(): Promise<void> {
        const codec = await MLowCodec.create({
            logger: this.logger.child({ component: 'mlow' }),
            companionModel: this.companionModel,
            red: this.redOptions
        })
        if (this.stopped) {
            codec.destroy()
            return
        }
        this.codec = codec
    }

    /**
     * Applies a plan change. Updates run one at a time in call order, even while one dials
     * relays; a failed update rejects for its caller and leaves the queue running.
     */
    apply(update: WaCallMediaPlanUpdate): Promise<void> {
        const run = this.applying.then(() => this.applyNow(update))
        this.applying = run.catch(() => {})
        return run
    }

    private async applyNow(update: WaCallMediaPlanUpdate): Promise<void> {
        if (this.stopped) return

        this.deferResend = true
        try {
            if (update.mediaType !== undefined) this.mediaType = update.mediaType
            if (update.settings !== undefined) this.applySettings(update.settings)
            if (update.ssrcs !== undefined) this.applySsrcs(update.ssrcs)
            if (update.keys !== undefined) this.applyKeys(update.keys)
            if (update.group !== undefined) this.applyGroup(update.group)
            if (update.muted !== undefined) this.muted = update.muted
            if (update.video !== undefined) this.applyVideo(update.video)
            if (update.relays !== undefined) await this.applyRelays(update.relays)
            if (update.accepted !== undefined) await this.applyAccepted(update.accepted)
        } finally {
            this.deferResend = false
            if (this.resendPending) {
                this.resendPending = false
                if (!this.stopped) this.sctpRelay.resendSubscriptions()
            }
        }
    }

    /** Replays the registrations on the open legs; inside an update it waits for its end. */
    private requestResend(): void {
        if (this.deferResend) {
            this.resendPending = true
            return
        }
        this.sctpRelay.resendSubscriptions()
    }

    /**
     * Applies the REMB gate, RTCP interval and audio bundling; a `null` section changes nothing,
     * a `null` interval inside one restores the compiled interval.
     */
    private applySettings(settings: WaCallMediaSettings | null): void {
        if (!settings) return

        this.rtcpRembDisabled = settings.disableRtcpRemb

        const intervalMs = settings.rtcpIntervalMs ?? SENDER_REPORT_INTERVAL_MS
        if (intervalMs !== this.rtcpIntervalMs) this.resetRtcpSchedules(intervalMs)

        const framesPerPacket = Math.trunc(settings.audioFramesPerPacket ?? 1)
        this.audioFramesPerPacket =
            framesPerPacket > 1 ? Math.min(framesPerPacket, MAX_AUDIO_FRAMES_PER_PACKET) : 1

        this.logger.debug('media settings applied', {
            disableRtcpRemb: this.rtcpRembDisabled,
            rtcpIntervalMs: this.rtcpIntervalMs,
            appDataSframe: settings.appDataSframe,
            audioFramesPerPacket: this.audioFramesPerPacket
        })
    }

    private resetRtcpSchedules(intervalMs: number): void {
        this.rtcpIntervalMs = intervalMs
        this.audioReportSchedule = SenderReportSchedule.onMediaClock(intervalMs, AUDIO_SAMPLE_RATE)
        this.videoReportSchedule = SenderReportSchedule.onWallClock(intervalMs)
        this.receiverEstimateSchedule = SenderReportSchedule.onWallClock(intervalMs)
        this.audioReceiverEstimateSchedule = SenderReportSchedule.onWallClock(intervalMs)
    }

    private applySsrcs(ssrcs: WaCallMediaSsrcs | null): void {
        if (!ssrcs) return
        this.ssrcs = ssrcs

        if (this.rtpSession?.getSsrc() !== ssrcs.selfAudio) {
            this.rtpSession = RtpSession.whatsappOpus(ssrcs.selfAudio)
            this.audioTimelineAnchored = false
            this.pendingSkipSamples = 0
            this.pendingAudio = null
            this.previousSecondary = null
        }
        if (this.carriesVideo) {
            this.ensureVideoRtpSession()
        }

        this.refreshPeerAppData()
        this.openAppDataStream(ssrcs.selfAppData)

        const subscriptionSsrc = this.actualPeerSsrc ?? ssrcs.peerAudio
        if (subscriptionSsrc !== this.subscriptionSsrc) this.setSubscription(subscriptionSsrc)
        if (ssrcs.selfAudio !== this.registeredSelfSsrc) {
            this.registeredSelfSsrc = ssrcs.selfAudio
            this.sctpRelay.setSsrc(ssrcs.selfAudio)
            this.requestResend()
        }
        this.refreshStreams()
        const selfLayers = ssrcs.selfLayers ?? null
        if (selfLayers || this.selfLayersDeclared) {
            this.selfLayersDeclared = selfLayers !== null
            this.sctpRelay.setSelfLayers(selfLayers)
        }

        this.logger.debug('media ssrcs applied', {
            selfSsrc: hexSsrc(ssrcs.selfAudio),
            peerSsrc: hexSsrc(this.subscriptionSsrc)
        })
    }

    /** Points the relay subscription at the peer stream `ssrc`. */
    private setSubscription(ssrc: number): void {
        this.subscriptionSsrc = ssrc
        this.sctpRelay.setSubscriptionSsrc(ssrc)
        this.requestResend()
    }

    private applyKeys(keys: WaCallMediaKeys | null): void {
        if (!keys || keys.epoch === this.keyEpoch) return
        this.keyEpoch = keys.epoch

        this.srtpSession = new SrtpSession(this.crypto, keys.send, keys.recv)
        this.srtcpContext = new SrtcpContext(this.crypto, keys.send)
        this.srtcpRecvSession = new SrtcpSession(this.crypto, keys.recv)
        this.groupRecvSsrcs.clear()
        this.installGroupRecvKeys()
        this.logger.debug('srtp keys applied', { epoch: keys.epoch })
    }

    /**
     * Applies a group call's senders: each gets a decoder and its receive keying on every one
     * of its SSRCs. `null` leaves group mode, the 1:1 receive path taking over again.
     */
    private applyGroup(group: WaCallMediaGroup | null): void {
        if (!group) {
            if (!this.groupAudio) return
            this.groupSenders = []
            this.installGroupRecvKeys()
            for (const senderId of this.groupAudio.sync([])) this.emitSenderMedia(senderId, false)
            this.groupAudio.clear()
            this.groupAudio = null
            this.groupRembSsrc = 0
            this.stopSenderSilenceCheck()
            this.setMaxVideoStreams(MAX_H264_DEPACKETIZERS)
            this.refreshPeerAppData()
            this.applyVideoSubscriptions(null)
            this.logger.debug('group senders cleared')
            return
        }

        const senders =
            group.senders.length > MAX_GROUP_SENDERS
                ? group.senders.slice(0, MAX_GROUP_SENDERS)
                : group.senders
        if (!this.groupAudio) {
            this.groupAudio = new AudioReceiveSet({
                clockRate: AUDIO_SAMPLE_RATE,
                videoClockRate: VIDEO_CLOCK_RATE,
                playoutCapacity: PLAYOUT_CAPACITY_SAMPLES,
                maxSenders: MAX_GROUP_SENDERS,
                createDecoder: () => this.createSenderDecoder(),
                onSenderAudio: this.events.onSenderAudio,
                logger: this.logger.child({ component: 'group-audio' })
            })
            this.playout.reset()
        }
        this.groupSenders = senders
        for (const senderId of this.groupAudio.sync(senders)) this.emitSenderMedia(senderId, false)
        if (!this.groupAudio.has(this.groupRembSsrc)) this.groupRembSsrc = 0
        this.installGroupRecvKeys()
        this.setMaxVideoStreams(
            Math.max(MAX_H264_DEPACKETIZERS, senders.length * VIDEO_STREAMS_PER_SENDER)
        )
        this.refreshPeerAppData()
        this.applyVideoSubscriptions(group)
        this.startSenderSilenceCheck()
        this.logger.debug('group senders applied', {
            senders: senders.length,
            ignored: group.senders.length - senders.length,
            keyedSsrcs: this.groupRecvSsrcs.size
        })
    }

    /**
     * Keys every SSRC of the group's senders on the receive sessions and drops the ones no longer
     * listed. Same material keeps a context and its replay window; the bound grows first.
     */
    private installGroupRecvKeys(): void {
        const srtp = this.srtpSession
        const srtcp = this.srtcpRecvSession
        if (!srtp || !srtcp) return

        const wanted = new Map<number, SrtpKeyingMaterial>()
        for (const sender of this.groupSenders) {
            wanted.set(sender.audio, sender.recv)
            for (const ssrc of sender.streams) wanted.set(ssrc, sender.recv)
        }
        for (const ssrc of this.groupRecvSsrcs) {
            if (wanted.has(ssrc)) continue
            srtp.deleteRecvContext(ssrc)
            srtcp.deleteRecvContext(ssrc)
            this.groupRecvSsrcs.delete(ssrc)
            this.inboundVideoStreams.get(ssrc)?.depacketizer.reset()
            this.inboundVideoStreams.delete(ssrc)
        }

        const bound = wanted.size + SRTP_MAX_RECV_CONTEXTS
        if (bound > srtp.maxRecvContexts) {
            srtp.setMaxRecvContexts(bound)
            srtcp.setMaxRecvContexts(bound)
        }
        for (const [ssrc, keying] of wanted) {
            srtp.setRecvKeying(ssrc, keying)
            srtcp.setRecvKeying(ssrc, keying)
            this.groupRecvSsrcs.add(ssrc)
        }
        if (bound < srtp.maxRecvContexts) {
            srtp.setMaxRecvContexts(bound)
            srtcp.setMaxRecvContexts(bound)
        }
    }

    /** Bounds the video streams reassembled at once; a lower bound drops the oldest past it. */
    private setMaxVideoStreams(max: number): void {
        this.maxVideoStreams = max
        for (const [ssrc, stream] of this.inboundVideoStreams) {
            if (this.inboundVideoStreams.size <= max) break
            stream.depacketizer.reset()
            this.inboundVideoStreams.delete(ssrc)
        }
    }

    /**
     * Recognizes inbound app data by the plan's SSRCs: a group plan's list replaces the set
     * whole, a 1:1 one only adds to it, up to its bound.
     */
    private refreshPeerAppData(): void {
        const listed = this.ssrcs?.peerAppData ?? []
        if (this.groupAudio) {
            this.peerAppDataSsrcs.clear()
            for (const ssrc of listed) this.peerAppDataSsrcs.add(ssrc)
            return
        }
        for (const ssrc of listed) {
            if (this.peerAppDataSsrcs.size >= MAX_TRACKED_PEER_APP_DATA_SSRCS) break
            this.peerAppDataSsrcs.add(ssrc)
        }
    }

    /**
     * Hands the relay the video asked of each sender, by the sender's pid; a sender without one
     * yet is left out. Off unless the plane was built with `videoSubscriptions`.
     */
    private applyVideoSubscriptions(group: WaCallMediaGroup | null): void {
        if (!this.videoSubscriptionsEnabled) return
        const wanted = group?.videoSubscriptions ?? []
        if (wanted.length === 0 && !this.rxSubscriptionsDeclared) return

        const pids = new Map<string, number>()
        for (const sender of group?.senders ?? []) {
            if (sender.pid !== undefined) pids.set(sender.id, sender.pid)
        }
        const infos: RxVideoSubscription[] = []
        for (const subscription of wanted) {
            const pid = pids.get(subscription.senderId)
            if (pid !== undefined) infos.push({ pid, quality: subscription.quality })
        }
        if (infos.length < wanted.length) {
            this.logger.debug('video subscriptions without a pid left out', {
                asked: wanted.length,
                sent: infos.length
            })
        }
        this.rxSubscriptionsDeclared = infos.length > 0
        this.sctpRelay.setRxSubscriptions(infos.length > 0 ? buildRxSubscriptions(infos) : null)
    }

    private startSenderSilenceCheck(): void {
        if (this.senderSilenceTimer || this.stopped) return
        this.senderSilenceTimer = setInterval(
            () => {
                const group = this.groupAudio
                if (!group) return
                for (const senderId of group.takeSilent(this.clock.now(), this.senderSilenceMs)) {
                    this.emitSenderMedia(senderId, false)
                }
            },
            Math.min(SENDER_SILENCE_CHECK_MS, this.senderSilenceMs)
        )
        unrefTimer(this.senderSilenceTimer)
    }

    private stopSenderSilenceCheck(): void {
        if (!this.senderSilenceTimer) return
        clearInterval(this.senderSilenceTimer)
        this.senderSilenceTimer = null
    }

    private emitSenderMedia(senderId: string, receiving: boolean): void {
        if (this.stopped) return
        this.logger.debug('group sender media', { senderId, receiving })
        try {
            this.events.onSenderMedia?.(senderId, receiving)
        } catch (err: unknown) {
            this.logger.warn('sender media handler failed', { message: toError(err).message })
        }
    }

    /** The decoder of one group sender: no encoder, the call's Companion if it has one. */
    private createSenderDecoder(): Promise<MLowCodec> {
        return MLowCodec.create({
            logger: this.logger.child({ component: 'mlow' }),
            companionModel: this.companionModel,
            decodeOnly: true
        })
    }

    private applyVideo(video: WaCallMediaVideo): void {
        if (video.receive) this.ensureVideoReceivePath()
        if (video.send) this.openVideoSendPath()
        this.holdVideoSend(video.sendHeld === true)
    }

    /** Holds or releases our frames; a hold closes the stream so it reopens on a key frame. */
    private holdVideoSend(held: boolean): void {
        if (held === this.videoSendHeld) return
        this.videoSendHeld = held
        if (held) this.videoStreamOpen = false
        this.logger.debug('video send hold changed', { held })
    }

    private async applyRelays(relays: WaCallMediaRelays | null): Promise<void> {
        if (!relays) return
        const generation = relays.generation ?? 0
        if (generation < this.relayGeneration) {
            this.logger.debug('relays of an older generation ignored', {
                generation,
                held: this.relayGeneration
            })
            return
        }
        const moved = generation > this.relayGeneration
        this.relays = relays
        this.relayGeneration = generation

        // With a leg open, the same generation waits for a redial; a newer one dials now.
        if (this.sctpRelay.hasConnection() && !moved) return
        await this.connectRelays(relays)

        if (
            !this.accepted &&
            this.srtpSession &&
            this.rtpSession &&
            this.codec &&
            this.sctpRelay.hasConnection()
        ) {
            this.silenceWarmup = true
            this.clock.start()
        }
    }

    private async applyAccepted(accepted: boolean): Promise<void> {
        if (!accepted || this.accepted) return
        this.accepted = true

        if (this.sctpRelay.hasConnection()) {
            this.startFlow()
        } else if (this.relays) {
            await this.connectRelays(this.relays)
        }
    }

    /**
     * Hands in captured 16 kHz mono audio, any length, sent as whole codec frames. Dropped
     * before media flows; sent as silence during the warmup or while muted. `capturedAtMs` is
     * when `samples[0]` was captured, on the `now` scale; absent, the block ends now.
     */
    pushCapture(samples: Float32Array, capturedAtMs?: number): void {
        if (this.stopped || (!this.flowing && !this.silenceWarmup)) return
        const capturedAt =
            capturedAtMs ?? this.clock.now() - (samples.length * 1000) / AUDIO_SAMPLE_RATE
        const sent = this.flowing && !this.muted ? samples : this.silence(samples.length)
        this.encodeCaptured(sent, capturedAt)
    }

    /**
     * Fills `out` with the next speaker samples and returns how many are the peer's audio;
     * the rest is silence. In a group call it is every sender's audio, summed and clipped.
     * Called on the host's own clock, any block size.
     */
    pullPlayout(out: Float32Array): number {
        if (!this.flowing) {
            out.fill(0)
            return 0
        }
        return this.groupAudio ? this.groupAudio.pullPlayout(out) : this.playout.read(out)
    }

    /**
     * Sends one Annex-B H.264 access unit and returns the RTP packet count, or 0 when video
     * cannot go out yet or is held for the peer. The stream opens on a key frame.
     * `timestampUs` may use any epoch: it is mapped onto the call's media clock.
     */
    sendVideoFrame(data: Uint8Array, timestampUs: number): number {
        if (
            !this.flowing ||
            !this.videoSendActive ||
            this.videoSendHeld ||
            !this.videoRtpSession ||
            !this.srtpSession ||
            !this.sctpRelay.hasConnection() ||
            !data.length
        )
            return 0
        const { payloads, keyFrame } = packetizeH264Frame(data, 800)
        if (!this.videoStreamOpen) {
            if (!keyFrame) return 0
            this.videoStreamOpen = true
        }
        const now = this.clock.now()
        const captureMs = this.videoCaptureTimes.map(timestampUs / 1000, now)
        let timestamp = this.clock.ticksAt(captureMs, VIDEO_CLOCK_RATE)
        // Rounding can collapse two mapped instants; keep the wire strictly increasing.
        if (this.videoSendFrames > 0 && ((timestamp - this.videoTimestamp) | 0) <= 0) {
            timestamp = (this.videoTimestamp + 1) >>> 0
        }
        this.videoTimestamp = timestamp
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
            this.sendRtp(this.srtpSession, packet)
            this.videoPacketCount++
            this.videoOctetCount += payloads[index].length
        }
        if (this.videoReportSchedule.shouldReport(now)) {
            this.sendSenderReport(
                this.videoRtpSession.getSsrc(),
                this.videoPacketCount,
                this.videoOctetCount,
                this.timestampAtAssembly(timestamp, captureMs, VIDEO_CLOCK_RATE),
                this.groupAudio ?? this.videoReception,
                true
            )
        }
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
     * Sends one emoji reaction in-band on the media socket. Returns whether the first
     * packet left; a `false` does not lose it, the retransmission carries it.
     */
    sendReaction(reaction: string): boolean {
        if (!this.appDataStream) {
            this.logger.debug('reaction dropped, app data stream not open')
            return false
        }
        if (!this.flowing) {
            this.logger.debug('reaction dropped, media not flowing')
            return false
        }
        return this.appDataStream.sendReaction(reaction)
    }

    getStats(): WaCallMediaStats {
        const codecStats = this.codec?.getStats()
        const senders = this.groupAudio?.stats()
        let decoded = codecStats?.success ?? 0
        let decodeErrors = codecStats?.errors ?? 0
        if (senders) {
            for (const sender of senders) {
                decoded += sender.decoded
                decodeErrors += sender.decodeErrors
            }
        }
        return {
            relayPackets: this.relayPacketCount,
            audioSent: this.audioSendCount,
            audioDropped: this.audioDropCount,
            audioTimelineResyncs: this.audioTimelineResyncs,
            audioFramesShed: this.audioFramesShed,
            audioCaptureSkewMs: (this.audioCaptureSkewTicks * 1000) / AUDIO_SAMPLE_RATE,
            audioReceived: this.audioRecvCount,
            audioRedDiscarded: this.audioRedDiscardCount,
            srtpErrors: this.srtpReplayCount + this.srtpAuthFailureCount + this.srtpOtherErrorCount,
            srtpReplays: this.srtpReplayCount,
            srtpAuthFailures: this.srtpAuthFailureCount,
            srtpOtherErrors: this.srtpOtherErrorCount,
            videoFramesSent: this.videoSendFrames,
            videoPacketsReceived: this.videoRecvPackets,
            videoFecDiscarded: this.reedSolomonFecPackets,
            decoded,
            decodeErrors,
            playout: this.groupAudio ? this.groupAudio.playoutStats : this.playout.stats,
            ...(senders ? { senders, unplannedPackets: this.unplannedPacketCount } : {}),
            warpFrames: this.warpFrameCount,
            warpControlFrames: this.warpControlFrameCount,
            warpOverruns: this.warpOverrunCount
        }
    }

    /** Tears the media down for good and returns what it carried. */
    stop(): WaCallMediaStats {
        const stats = this.getStats()
        if (this.stopped) return stats
        this.stopped = true
        this.flowing = false
        this.silenceWarmup = false

        const { senders, ...totals } = stats
        this.logger.debug('call media stats', { ...totals, groupSenders: senders?.length })

        if (this.subscriptionRefreshTimer) {
            clearInterval(this.subscriptionRefreshTimer)
            this.subscriptionRefreshTimer = null
        }
        this.stopSenderSilenceCheck()
        this.sctpRelay.cleanup()

        this.codec?.destroy()
        this.codec = null
        this.rtpSession = null
        this.videoRtpSession = null
        this.srtpSession = null
        this.srtcpContext = null
        this.srtcpRecvSession = null
        this.appDataStream?.close()
        this.appDataStream = null
        this.peerAppDataSsrcs.clear()
        for (const stream of this.inboundVideoStreams.values()) stream.depacketizer.reset()
        this.inboundVideoStreams.clear()
        this.playout.reset()
        this.groupAudio?.clear()
        this.groupAudio = null
        this.groupRecvSsrcs.clear()
        this.encodeBuffer = null
        this.encodeBufferPos = 0
        this.pendingAudio = null
        this.previousSecondary = null
        return stats
    }

    private get carriesVideo(): boolean {
        return this.mediaType === 'video' || this.videoReceivePathOpened || this.videoSendPathOpened
    }

    private get videoSendActive(): boolean {
        return this.mediaType === 'video' || this.videoSendPathOpened
    }

    private ensureVideoRtpSession(): void {
        const ssrc = this.ssrcs?.selfVideo
        if (!ssrc || this.videoRtpSession?.getSsrc() === ssrc) return
        this.videoRtpSession = new RtpSession(ssrc, PayloadType.WhatsAppH264)
    }

    /** Tells the relay our streams and the peer's to forward; an unchanged list is not replayed. */
    private refreshStreams(): void {
        const ssrcs = this.ssrcs
        if (!ssrcs) return
        const selfStreams = this.videoSendPathOpened
            ? unionInOrder(ssrcs.selfStreams, ssrcs.selfVideoStreams)
            : [...ssrcs.selfStreams]
        const peerStreams = this.videoReceivePathOpened
            ? unionInOrder(ssrcs.peerStreams, ssrcs.peerVideoStreams)
            : [...ssrcs.peerStreams]
        if (sameSsrcs(selfStreams, this.selfStreams) && sameSsrcs(peerStreams, this.peerStreams)) {
            return
        }
        this.selfStreams = selfStreams
        this.selfStreamSet = new Set(selfStreams)
        this.peerStreams = peerStreams
        this.sctpRelay.setStreamSsrcs(selfStreams, peerStreams)
        this.requestResend()
    }

    /**
     * Opens the video receive path on a call negotiated as audio: the relay subscription and the
     * video RTP session key frame requests and the REMB ride on. Idempotent; a no-op on video.
     */
    private ensureVideoReceivePath(): void {
        if (this.videoReceivePathOpened || this.mediaType === 'video') return
        this.videoReceivePathOpened = true
        this.openVideoPath('receive')
    }

    /**
     * Opens our video sender on a call negotiated as audio, once both sides agreed the upgrade,
     * and registers our video SSRCs with the relay. Idempotent; a no-op on video.
     */
    private openVideoSendPath(): void {
        this.ensureVideoReceivePath()
        if (this.videoSendPathOpened || this.mediaType === 'video') return
        this.videoSendPathOpened = true
        this.openVideoPath('send')
    }

    private openVideoPath(path: 'receive' | 'send'): void {
        this.ensureVideoRtpSession()
        this.refreshStreams()
        this.logger.debug(`video ${path} path opened mid-call`, {
            hasVideoRtpSession: this.videoRtpSession !== null
        })
    }

    /** Ceiling the video extension announces: the last REMB window's, or the initial one. */
    private get announcedReceiverEstimate(): number {
        return this.receiverEstimateBitrate > 0
            ? this.receiverEstimateBitrate
            : INITIAL_RECEIVER_ESTIMATE
    }

    /**
     * Writes a video packet's header extension into the scratch and returns the slice, valid
     * until the next call. A `receiverEstimate` above zero appends the REMB element.
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

    private silence(length: number): Float32Array {
        if (this.silenceScratch.length < length) {
            this.silenceScratch = new Float32Array(length)
        }
        return this.silenceScratch.subarray(0, length)
    }

    /**
     * Frames `data` (first sample captured at `capturedAtMs`) and sends each complete frame.
     * A drop discards the partial frame, so the timeline steps over exactly what was lost.
     */
    private encodeCaptured(data: Float32Array, capturedAtMs: number): void {
        const codec = this.codec
        const hasRelay = this.sctpRelay.hasConnection()
        if (!this.rtpSession || !this.srtpSession || !codec || !hasRelay) {
            this.skipAudioSamples(this.encodeBufferPos + data.length)
            this.encodeBufferPos = 0
            this.audioDropCount++
            if (this.audioDropCount === 1 || this.audioDropCount % 500 === 0) {
                const missing = [
                    !this.rtpSession && 'rtpSession',
                    !this.srtpSession && 'srtpSession',
                    !codec && 'codec',
                    !hasRelay && 'relayConnection'
                ]
                    .filter(Boolean)
                    .join(', ')
                this.logger.debug('audio dropped', { dropCount: this.audioDropCount, missing })
            }
            return
        }

        const frameSamples = this.frameSamples
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
            if (this.encodeBufferPos === 0) {
                this.encodeBufferCaptureMs = capturedAtMs + (offset * 1000) / AUDIO_SAMPLE_RATE
            }
            const toCopy = Math.min(data.length - offset, frameSamples - this.encodeBufferPos)
            const target = this.encodeBuffer
            for (let i = 0; i < toCopy; i++) {
                const sample = data[offset + i]
                target[this.encodeBufferPos + i] = Number.isFinite(sample) ? sample : 0
            }
            this.encodeBufferPos += toCopy
            offset += toCopy

            if (this.encodeBufferPos < frameSamples) break

            const frameData: Float32Array = this.encodeBuffer
            this.encodeBuffer =
                frameData === this.encodeBufferA ? this.encodeBufferB! : this.encodeBufferA!
            this.encodeBufferPos = 0
            this.sendCapturedFrame(codec, frameData, this.encodeBufferCaptureMs)
        }
    }

    /**
     * Stamps one captured frame on the audio timeline, then encodes and sends it. A frame that
     * does not continue the last one exactly (a pause or a drop) goes out with the marker set.
     */
    private sendCapturedFrame(codec: MLowCodec, frame: Float32Array, captureMs: number): void {
        const onClock = this.clock.ticksAt(captureMs, AUDIO_SAMPLE_RATE)
        let timestamp = onClock
        let resync = false
        if (this.audioTimelineAnchored) {
            const next = (this.nextAudioTimestamp + this.pendingSkipSamples) >>> 0
            const drift = (onClock - next) | 0
            if (drift <= -AUDIO_TIMELINE_SLACK_TICKS) {
                const shed = ++this.audioFramesShed
                if (shed === 1 || shed % 100 === 0) {
                    this.logger.debug('audio frame shed, capture ahead of the clock', {
                        shed,
                        aheadMs: (-drift * 1000) / AUDIO_SAMPLE_RATE
                    })
                }
                return
            }
            if (drift < AUDIO_TIMELINE_SLACK_TICKS) {
                timestamp = next
            } else {
                resync = true
            }
        }

        const slot =
            this.pendingAudio?.buffer === this.encodeSlots[0].buffer
                ? this.encodeSlots[1]
                : this.encodeSlots[0]
        let encodedLength: number
        try {
            encodedLength = codec.encodeInto(frame, slot)
        } catch (err: unknown) {
            this.logger.error('encode error', { message: toError(err).message })
            this.skipAudioSamples(frame.length)
            return
        }

        const marker = !this.audioTimelineAnchored || timestamp !== this.nextAudioTimestamp
        if (resync) {
            this.audioTimelineResyncs++
            this.logger.debug('audio timeline resynced to the clock', {
                pauseMs: (((onClock - this.nextAudioTimestamp) | 0) * 1000) / AUDIO_SAMPLE_RATE
            })
        }
        this.audioTimelineAnchored = true
        this.nextAudioTimestamp = (timestamp + frame.length) >>> 0
        this.pendingSkipSamples = 0
        this.audioCaptureSkewTicks = (onClock - timestamp) | 0
        this.packetizeAudio(codec, slot.subarray(0, encodedLength), timestamp, marker, captureMs)
    }

    /**
     * Puts one encoded frame on the wire, behind the copy of the frame before with RED. Otherwise
     * a speech frame waits to share a packet when the plan bundles, and a frame that breaks the
     * run (VAD clear, or not following on) sends what waits on its own first.
     */
    private packetizeAudio(
        codec: MLowCodec,
        frame: Uint8Array,
        timestamp: number,
        marker: boolean,
        captureMs: number
    ): void {
        if (codec.redActive) {
            this.packetizeRed(codec, frame, timestamp, marker, captureMs)
            return
        }

        const bundles = this.audioFramesPerPacket > 1 && (frame[0] & MLOW_TOC_VAD) !== 0
        const pending = this.pendingAudio
        if (pending && bundles && !marker) {
            const packet = this.packAudio(codec, pending, frame)
            if (packet) {
                this.pendingAudio = null
                this.sendAudioPacket(
                    packet,
                    this.pendingAudioTimestamp,
                    this.pendingAudioMarker,
                    this.pendingAudioCaptureMs
                )
                return
            }
        }
        this.flushPendingAudio()
        if (bundles) {
            this.pendingAudio = frame
            this.pendingAudioTimestamp = timestamp
            this.pendingAudioMarker = marker
            this.pendingAudioCaptureMs = captureMs
            return
        }
        this.sendAudioPacket(frame, timestamp, marker, captureMs)
    }

    /**
     * `[copy of frame n-1][frame n]` at frame n-1's timestamp: the copy lands on the slot the
     * previous packet filled, a duplicate unless that packet was lost. A marked frame goes alone.
     */
    private packetizeRed(
        codec: MLowCodec,
        frame: Uint8Array,
        timestamp: number,
        marker: boolean,
        captureMs: number
    ): void {
        const copy = this.previousSecondary
        const copyTimestamp = this.previousSecondaryTimestamp
        const copyCaptureMs = this.previousSecondaryCaptureMs
        this.previousSecondary = codec.lastSecondary
        this.previousSecondaryTimestamp = timestamp
        this.previousSecondaryCaptureMs = captureMs
        const packet = copy && !marker ? this.packAudio(codec, copy, frame) : null
        if (packet) {
            this.sendAudioPacket(packet, copyTimestamp, false, copyCaptureMs)
        } else {
            this.sendAudioPacket(frame, timestamp, marker, captureMs)
        }
    }

    private packAudio(codec: MLowCodec, first: Uint8Array, second: Uint8Array): Uint8Array | null {
        const pair = this.bundlePair
        pair[0] = first
        pair[1] = second
        try {
            return codec.packFrames(pair)
        } catch (err: unknown) {
            this.logger.trace('audio frames not packed, sent apart', {
                message: toError(err).message
            })
            return null
        }
    }

    /** Sends the frame waiting for its bundle on its own, so nothing captured stays behind. */
    private flushPendingAudio(): void {
        const pending = this.pendingAudio
        if (!pending) return
        this.pendingAudio = null
        this.sendAudioPacket(
            pending,
            this.pendingAudioTimestamp,
            this.pendingAudioMarker,
            this.pendingAudioCaptureMs
        )
    }

    /** Records samples the plane lost, for the next frame to step over once anchored. */
    private skipAudioSamples(samples: number): void {
        if (this.audioTimelineAnchored) this.pendingSkipSamples += samples
    }

    /** Samples in one codec frame, the audio timeline's step per frame. */
    private get frameSamples(): number {
        return this.codec?.getFrameSize() ?? DEFAULT_FRAME_SAMPLES
    }

    /** Sends one encoded audio payload; `captureMs` lets the sender report carry its timestamp. */
    private sendAudioPacket(
        payload: Uint8Array,
        timestamp: number,
        marker: boolean,
        captureMs: number
    ): void {
        const rtpSession = this.rtpSession
        const srtpSession = this.srtpSession
        if (!rtpSession || !srtpSession) return

        try {
            const rtpPacket = rtpSession.createPacketAtTimestamp(payload, timestamp, marker)
            rtpPacket.header.extension = true
            rtpPacket.header.extensionProfile = WA_RTP_EXTENSION_PROFILE
            rtpPacket.header.extensionData = EMPTY_BYTES
            this.sendRtp(srtpSession, rtpPacket)

            this.audioSendCount++
            this.audioOctetCount += payload.length
            if (this.audioReportSchedule.shouldReport(timestamp)) {
                this.sendSenderReport(
                    rtpSession.getSsrc(),
                    this.audioSendCount,
                    this.audioOctetCount,
                    this.timestampAtAssembly(timestamp, captureMs, AUDIO_SAMPLE_RATE),
                    this.groupAudio ?? this.audioReception
                )
            }
            if (this.audioSendCount === 1 || this.audioSendCount % 500 === 0) {
                this.logger.debug('audio sent', {
                    sendCount: this.audioSendCount,
                    bytes: payload.length
                })
            }
        } catch (err: unknown) {
            this.logger.error('error sending audio', { message: toError(err).message })
        }
    }

    private sendRtp(srtpSession: SrtpSession, packet: RtpPacket): boolean {
        return this.sctpRelay.sendMedia(toArrayBuffer(srtpSession.protect(packet)))
    }

    private sendRtcp(srtcpContext: SrtcpContext, packet: Uint8Array, senderSsrc: number): boolean {
        return this.sctpRelay.sendMedia(toArrayBuffer(srtcpContext.protect(packet, senderSsrc)))
    }

    /**
     * Opens this device's app-data stream on its own SSRC, reusing the plane's SRTP and relay.
     * Reopening on the same SSRC is a no-op, so a plan update confirming the guess keeps it.
     */
    private openAppDataStream(ssrc: number): void {
        if (this.appDataStream?.ssrc === ssrc) return

        this.appDataStream?.close()
        this.appDataStream = new WaAppDataStream({
            logger: this.logger.child({ component: 'app-data' }),
            ssrc,
            sendPacket: (packet) =>
                this.srtpSession ? this.sendRtp(this.srtpSession, packet) : false
        })
    }

    /**
     * Reads one inbound app-data packet and hands the reactions in it over; it was
     * recognized by SSRC, so its payload type is whatever the peer chose.
     */
    private onAppDataPacket(
        data: Uint8Array,
        ssrc: number,
        connectionId: string | undefined
    ): void {
        const stream = this.appDataStream
        if (!stream || !this.srtpSession) return

        let reactions: readonly WaCallReaction[]
        try {
            const packet = this.srtpSession.unprotect(data)
            if (!packet) {
                this.countReplay(ssrc)
                return
            }
            this.notePeerMedia(connectionId, ssrc)
            reactions = stream.receive(packet.payload, ssrc)
        } catch (err: unknown) {
            this.countReceiveError(err, ssrc)
            return
        }

        const senderId = reactions.length > 0 ? this.groupAudio?.senderIdOf(ssrc) : undefined
        for (const reaction of reactions) {
            try {
                this.events.onReaction?.(reaction, senderId)
            } catch (err: unknown) {
                this.logger.warn('reaction handler failed', { message: toError(err).message })
            }
        }
    }

    private resetEncodeState(): void {
        this.flushPendingAudio()
        this.skipAudioSamples(this.encodeBufferPos)
        this.encodeBuffer = null
        this.encodeBufferPos = 0
        this.audioReception.reset()
        this.codec?.resetSequence()
    }

    private startFlow(): void {
        if (this.flowing || this.stopped) return
        this.clock.start()
        this.resetEncodeState()
        this.playout.reset()
        this.groupAudio?.resetPlayout()
        this.flowing = true
        this.silenceWarmup = false
        this.sctpRelay.setMediaFlowing()
        if (!this.subscriptionRefreshTimer) {
            this.subscriptionRefreshTimer = setInterval(() => {
                this.sctpRelay.resendSubscriptions()
            }, SUBSCRIPTION_REFRESH_INTERVAL_MS)
            unrefTimer(this.subscriptionRefreshTimer)
        }
        this.logger.debug('media flow started')
        this.events.onActive?.()
    }

    private onRelayConnected(): void {
        if (this.accepted) this.startFlow()
    }

    /** No relay leg is left and nothing redials: the call is mute until signaling ends it. */
    private onRelayLost(reason: string): void {
        if (this.stopped) return
        this.logger.warn('call lost its last relay leg', { reason })
        this.events.onRelayLost?.(reason)
    }

    /**
     * Peer media on `ssrc` that authenticated on a relay leg, which the relay follows (see
     * `notePeerMedia`); in a group call it also marks the sender as heard.
     */
    private notePeerMedia(connectionId: string | undefined, ssrc: number): void {
        if (connectionId !== undefined) this.sctpRelay.notePeerMedia(connectionId)
        const started = this.groupAudio?.noteHeard(ssrc, this.clock.now())
        if (started !== undefined) this.emitSenderMedia(started, true)
    }

    /** Takes the conference relay's frame off a datagram; `null` for a frame with no media in it. */
    private unframeRelayData(data: Uint8Array): Uint8Array | null {
        const frame = readWarpFrame(data)
        switch (frame.kind) {
            case 'not_framed':
                return data
            case 'framed':
                if (++this.warpFrameCount === 1) {
                    this.logger.debug('relay frame taken off inbound media', {
                        headerLength: frame.headerLength
                    })
                }
                return frame.rtp
            case 'no_rtp_inside':
                this.warpControlFrameCount++
                return null
            case 'header_overruns': {
                const overruns = ++this.warpOverrunCount
                if (overruns === 1 || overruns % 100 === 0) {
                    this.logger.debug('relay frame header runs past the datagram', {
                        overruns,
                        headerLength: frame.headerLength,
                        bytes: data.length
                    })
                }
                return null
            }
        }
    }

    private onRelayData(datagram: Uint8Array, connectionId?: string): void {
        this.relayPacketCount++

        const data = this.unframeRelayData(datagram)
        if (!data || isStunPacket(data)) return

        if (isRtcpPacket(data)) {
            this.onRtcpPacket(data, connectionId)
            return
        }

        const srtpSession = this.srtpSession
        if (!isRtpPacket(data) || !srtpSession) return

        const pt = data[1] & 0x7f
        const ssrc = data.length >= 12 ? readUInt32BE(data, 8) : 0
        if (data.length >= 12) {
            if (ssrc === this.rtpSession?.getSsrc() || this.selfStreamSet.has(ssrc)) return
            // Before latching, which would resubscribe the call to a stream with no audio.
            if (this.peerAppDataSsrcs.has(ssrc)) {
                this.onAppDataPacket(data, ssrc, connectionId)
                return
            }
            if (this.dropsUnplanned(ssrc)) return
        }

        try {
            const rtpPacket = srtpSession.unprotect(data)
            if (!rtpPacket) {
                this.countReplay(ssrc)
                return
            }
            const header = rtpPacket.header
            const payload = rtpPacket.payload
            this.notePeerMedia(connectionId, header.ssrc)
            if (pt === PayloadType.WhatsAppOpus) {
                this.onAudioPacket(header, payload, 0)
            } else if (pt === PayloadType.WhatsAppMlowRed) {
                if (this.pt121Read.read(payload)) {
                    this.onAudioPacket(header, payload, 1, this.pt121Read)
                } else {
                    this.discardRedAudio(payload, header.ssrc)
                }
            } else if (pt === PayloadType.WhatsAppMlowAlt) {
                const outcome = this.onAudioPacket(header, payload, 0)
                this.groupAudio?.countPt122(header.ssrc, outcome)
            } else if (pt === PayloadType.WhatsAppH264) {
                this.onVideoPacket(header, payload)
            } else if (isReedSolomonFecPayloadType(pt)) {
                const fecPackets = ++this.reedSolomonFecPackets
                if (fecPackets === 1 || fecPackets % 100 === 0) {
                    this.logger.debug('reed-solomon fec packet discarded', {
                        packets: fecPackets,
                        payloadType: pt,
                        ssrc: hexSsrc(header.ssrc)
                    })
                }
            }
        } catch (err: unknown) {
            this.countReceiveError(err, ssrc)
        }
    }

    private onRtcpPacket(data: Uint8Array, connectionId: string | undefined): void {
        const srtcpRecvSession = this.srtcpRecvSession
        if (!srtcpRecvSession) return
        const ssrc = readUInt32BE(data, 4)
        if (this.dropsUnplanned(ssrc)) return
        try {
            const rtcp = srtcpRecvSession.unprotect(data)
            if (!rtcp) return
            this.notePeerMedia(connectionId, ssrc)
            const arrivedAt = Date.now()
            if (this.groupAudio) {
                this.groupAudio.observeSenderReport(rtcp, arrivedAt)
            } else {
                this.audioReception.observeSenderReport(rtcp, arrivedAt)
                this.videoReception.observeSenderReport(rtcp, arrivedAt)
            }
            if (this.traceEnabled) {
                this.logger.trace('srtcp packet received', {
                    packetType: rtcp[1],
                    feedbackFormat: rtcp[0] & 0x1f,
                    bytes: rtcp.length
                })
            }
        } catch (err: unknown) {
            if (err instanceof SrtpError && err.type === 'auth_failed') {
                this.groupAudio?.noteAuthFailure(ssrc)
            }
            if (this.traceEnabled) {
                this.logger.trace('srtcp unprotect failed', { message: toError(err).message })
            }
        }
    }

    /**
     * Decodes one peer audio packet: `stream` 0 is PT 120, 1 is PT 121, numbered apart on the
     * one timeline. PT 121 on an SSRC other than the one the reception follows stays out of it.
     */
    private onAudioPacket(
        header: RtpHeader,
        payload: Uint8Array,
        stream: 0 | 1,
        read?: MlowPacketRead
    ): MLowDecodeOutcome | null {
        if (this.groupAudio) {
            return this.onGroupAudioPacket(this.groupAudio, header, payload, stream, read)
        }
        const ssrc = header.ssrc
        this.latchPeerSsrc(ssrc)
        const codec = this.codec
        if (!codec) return null

        this.audioRecvCount++
        const seq = header.sequenceNumber
        const followed = this.audioReception.sourceSsrc
        if (stream === 0 || followed === 0 || followed === ssrc) {
            this.audioReception.observe(ssrc, seq, header.timestamp, Date.now())
            this.sendAudioReceiverEstimate(ssrc)
        }

        if (payload.length === 0) return 'empty'

        this.countAudioPayload(payload)
        const outcome = codec.decodeSequenced(
            seq,
            payload,
            this.onDecodedAudio,
            header.timestamp,
            stream,
            read
        )

        if (this.audioRecvCount % 100 === 0) {
            const stats = codec.getStats()
            this.reportAudioRecvStats('audio recv stats', this.audioReception.lossPercent, {
                decodeOk: stats.success,
                decodeErr: stats.errors,
                plc: stats.plc,
                fec: stats.fec,
                late: stats.late,
                redundant: stats.redundant,
                redRecovered: stats.redRecovered
            })
        }
        return outcome
    }

    private countAudioPayload(payload: Uint8Array): void {
        if (payload.length <= 2) this.recvDtxCount++
        else this.recvRealCount++
    }

    /** Hands the encoder the loss its FEC plans for, and logs the receive counters. */
    private reportAudioRecvStats(
        message: string,
        lossPercent: number,
        details: Readonly<Record<string, unknown>>
    ): void {
        this.codec?.setExpectedPacketLossPercent(lossPercent)
        this.logger.debug(message, {
            recvCount: this.audioRecvCount,
            real: this.recvRealCount,
            dtx: this.recvDtxCount,
            ...details
        })
    }

    /**
     * In a group call, drops a packet on an SSRC the plan keys for no sender before SRTP sees
     * it: a context keyed lazily with the call's own key could evict one of a sender's.
     */
    private dropsUnplanned(ssrc: number): boolean {
        if (!this.groupAudio || this.groupRecvSsrcs.has(ssrc)) return false
        const dropped = ++this.unplannedPacketCount
        if (dropped === 1 || dropped % 500 === 0) {
            this.logger.debug('group packet on an unplanned ssrc dropped', {
                packets: dropped,
                ssrc: hexSsrc(ssrc)
            })
        }
        return true
    }

    /**
     * Decodes one group sender's audio on that sender's own decoder. Nothing latches: every
     * sender's SSRC comes from the plan.
     */
    private onGroupAudioPacket(
        group: AudioReceiveSet,
        header: RtpHeader,
        payload: Uint8Array,
        stream: 0 | 1,
        read?: MlowPacketRead
    ): MLowDecodeOutcome | null {
        const ssrc = header.ssrc
        this.audioRecvCount++
        this.countAudioPayload(payload)
        const outcome = group.receive(
            ssrc,
            header.sequenceNumber,
            header.timestamp,
            payload,
            stream,
            Date.now(),
            read
        )
        if (this.groupRembSsrc === 0) this.groupRembSsrc = ssrc
        if (ssrc === this.groupRembSsrc) this.sendAudioReceiverEstimate(ssrc)

        if (this.audioRecvCount % 100 === 0) {
            this.reportAudioRecvStats('group audio recv stats', group.peakLossPercent(), {
                senders: group.size
            })
        }
        return outcome
    }

    /** Counts a PT 121 packet that does not parse as MLow; the first ones log their header. */
    private discardRedAudio(payload: Uint8Array, ssrc: number): void {
        const packets = ++this.audioRedDiscardCount
        if (packets > 5 && packets % 500 !== 0) return
        this.logger.debug('pt 121 packet discarded, not mlow', {
            packets,
            ssrc: hexSsrc(ssrc),
            bytes: payload.length,
            header: bytesToHex(payload.subarray(0, 4))
        })
    }

    /** Counts an inbound RTP packet SRTP refused with an error: a bad auth tag, or else. */
    private countReceiveError(err: unknown, ssrc: number): void {
        const type = err instanceof SrtpError ? err.type : 'other'
        let errorCount: number
        if (type === 'auth_failed') {
            errorCount = ++this.srtpAuthFailureCount
            this.groupAudio?.noteAuthFailure(ssrc)
        } else {
            errorCount = ++this.srtpOtherErrorCount
        }
        if (errorCount <= 5) this.logReceiveError(type, errorCount, ssrc, toError(err).message)
    }

    /** Counts an inbound RTP packet already received, such as a copy from another relay leg. */
    private countReplay(ssrc: number): void {
        const errorCount = ++this.srtpReplayCount
        if (errorCount <= 5) this.logReceiveError('replay', errorCount, ssrc)
    }

    private logReceiveError(
        type: string,
        errorCount: number,
        ssrc: number,
        message?: string
    ): void {
        this.logger.debug('srtp recv error', { type, errorCount, message, ssrc: hexSsrc(ssrc) })
    }

    /**
     * Subscribes the call to the first peer audio stream that authenticated, once. The
     * subscription names the peer's audio, so its video and FEC streams never latch.
     */
    private latchPeerSsrc(ssrc: number): void {
        if (this.actualPeerSsrc !== null) return
        this.actualPeerSsrc = ssrc
        if (ssrc !== this.subscriptionSsrc) this.setSubscription(ssrc)
    }

    private onVideoPacket(header: RtpHeader, payload: Uint8Array): void {
        // The upgrade may never have reached the plan: the media itself opens the path.
        this.ensureVideoReceivePath()
        this.videoRecvPackets++
        const now = Date.now()
        const group = this.groupAudio
        if (group) {
            group.observeVideo(header.ssrc, header.sequenceNumber, header.timestamp, now)
        } else {
            this.videoReception.observe(header.ssrc, header.sequenceNumber, header.timestamp, now)
        }
        this.videoRecvOctets += payload.length
        this.sendReceiverEstimate(header.ssrc, now)
        if (this.videoRecvPackets === 1 || this.videoRecvPackets % 100 === 0) {
            this.logger.debug('video packet received', {
                packets: this.videoRecvPackets,
                payloadType: PayloadType.WhatsAppH264,
                ssrc: hexSsrc(header.ssrc)
            })
        }
        if (this.videoRecvPackets <= 20) {
            const nalType = payload[0] & 0x1f
            const fuHeader = nalType === 28 && payload.length > 1 ? payload[1] : 0
            this.logger.debug('video rtp details', {
                packet: this.videoRecvPackets,
                sequenceNumber: header.sequenceNumber,
                timestamp: header.timestamp,
                marker: header.marker,
                nalType,
                fuStart: (fuHeader & 0x80) !== 0,
                fuEnd: (fuHeader & 0x40) !== 0,
                bytes: payload.length
            })
        }
        if (!payload.length) return
        const senderId = group?.senderIdOf(header.ssrc)
        this.events.onInboundVideoRtp?.({
            payloadType: PayloadType.WhatsAppH264,
            sequenceNumber: header.sequenceNumber,
            timestamp: header.timestamp,
            ssrc: header.ssrc,
            marker: header.marker,
            payload,
            senderId
        })
        let stream = this.inboundVideoStreams.get(header.ssrc)
        if (!stream) {
            stream = {
                depacketizer: new H264Depacketizer(),
                keyFrameReceived: false,
                lastKeyFrameRequestAt: 0
            }
            setBoundedMapEntry(
                this.inboundVideoStreams,
                header.ssrc,
                stream,
                this.maxVideoStreams,
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
            // Paced per stream, and plane-wide so a peer minting SSRCs draws no more requests.
            if (
                !stream.keyFrameReceived &&
                now - stream.lastKeyFrameRequestAt >= KEY_FRAME_REQUEST_INTERVAL_MS &&
                now - this.lastKeyFrameRequestAt >=
                    KEY_FRAME_REQUEST_INTERVAL_MS / this.maxVideoStreams
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
            this.events.onInboundVideo?.({
                codec: 'h264',
                ssrc: header.ssrc,
                timestamp: frame.timestamp,
                keyFrame: frame.keyFrame,
                data: frame.data,
                senderId
            })
        }
    }

    private requestKeyFrame(mediaSsrc: number): void {
        if (!this.srtcpContext || !this.videoRtpSession) return
        const senderSsrc = this.videoRtpSession.getSsrc()
        const pli = buildPictureLossIndication(senderSsrc, mediaSsrc, true)
        this.sendRtcp(this.srtcpContext, pli, senderSsrc)
        const fir = buildFullIntraRequest(senderSsrc, mediaSsrc, this.videoFirSequence++)
        this.sendRtcp(this.srtcpContext, fir, senderSsrc)
        this.logger.debug('video key frame requested', { mediaSsrc: hexSsrc(mediaSsrc) })
    }

    private async connectRelays(relays: WaCallMediaRelays): Promise<void> {
        this.logger.debug('connecting relays', {
            endpointCount: relays.endpoints.length,
            generation: relays.generation ?? 0
        })

        const configs = dialableRelayEndpoints(relays.endpoints).map((ep) => {
            const port = this.useOriginalRelayPort ? ep.port : TRUE_WEB_CLIENT_RELAY_PORT
            return {
                ip: ep.ip,
                port,
                token: ep.token,
                authToken: ep.authToken,
                rawAuthToken: ep.rawAuthToken,
                rawToken: ep.rawToken,
                key: ep.key,
                relayId: ep.relayId,
                name: ep.name || `${ep.ip}:${port}`,
                authTokenId: ep.authTokenId,
                originalPort: ep.port,
                transport: ep.transport
            }
        })

        if (configs.length === 0) {
            this.logger.error('no relay configs')
            return
        }

        this.sctpRelay.setSsrc(this.registeredSelfSsrc)
        this.sctpRelay.setSubscriptionSsrc(this.subscriptionSsrc)
        this.sctpRelay.setStreamSsrcs(this.selfStreams, this.peerStreams)
        this.sctpRelay.setParticipantIds(relays.selfPid, relays.peerPid)

        try {
            await this.sctpRelay.configureRelays(configs, {
                generation: relays.generation ?? 0
            })
            this.logger.debug('sctp relays configured', {
                connected: this.sctpRelay.getConnectedCount()
            })
        } catch (err: unknown) {
            this.logger.error('sctp relay error', { message: toError(err).message })
        }
    }

    /**
     * Emits one compound sender report for `senderSsrc` with the report blocks of the inbound
     * stream it pairs with. `whatsappVideoProfile` sets WhatsApp's profile bit (byte 0 0x91) on
     * a video report; only a single block carries the packet trailer.
     */
    private sendSenderReport(
        senderSsrc: number,
        packetCount: number,
        octetCount: number,
        rtpTimestamp: number,
        reception: RtpStreamReception | AudioReceiveSet,
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
            this.sendRtcp(srtcpContext, report, senderSsrc)
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
     * The stream's timestamp carried forward from the frame captured at `captureMs` to now,
     * so audio and video reports pair timestamp and wall time at the same instant.
     */
    private timestampAtAssembly(timestamp: number, captureMs: number, clockRate: number): number {
        return (timestamp + Math.round(((this.clock.now() - captureMs) * clockRate) / 1000)) >>> 0
    }

    /**
     * The audio REMB once per RTCP interval, which the peer's quality control needs to leave
     * probing; the video REMB gate does not apply. A group call sends one, on one sender's stream.
     */
    private sendAudioReceiverEstimate(mediaSsrc: number): void {
        if (!this.flowing || !this.audioReceiverEstimateSchedule.shouldReport(this.clock.now())) {
            return
        }
        const srtcpContext = this.srtcpContext
        const rtpSession = this.rtpSession
        if (!srtcpContext || !rtpSession) return

        const bitrate = nextAudioReceiverEstimate(
            this.audioReceiverEstimateBitrate,
            this.groupAudio
                ? this.groupAudio.takeLossPercent(mediaSsrc)
                : this.audioReception.takeLossPercent()
        )
        this.audioReceiverEstimateBitrate = bitrate
        const senderSsrc = rtpSession.getSsrc()
        try {
            const remb = buildReceiverEstimatedMaxBitrate(senderSsrc, mediaSsrc, bitrate)
            this.sendRtcp(srtcpContext, remb, senderSsrc)
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
     * The video REMB, from the receive path when the interval closes: the capacity we estimate,
     * not the rate arriving. The ceiling updates even with the REMB off: the extension carries it.
     */
    private sendReceiverEstimate(mediaSsrc: number, now: number): void {
        if (this.receiverEstimateWindowStartedAt === 0) {
            this.receiverEstimateWindowStartedAt = now
        }
        if (!this.receiverEstimateSchedule.shouldReport(now)) return

        const group = this.groupAudio
        const bitrate = nextReceiverMaxBitrate(
            this.receiverEstimateBitrate,
            this.videoRecvOctets,
            now - this.receiverEstimateWindowStartedAt,
            group ? group.videoPeakLossPercent() : this.videoReception.lossPercent
        )
        this.receiverEstimateBitrate = bitrate
        this.videoRecvOctets = 0
        this.receiverEstimateWindowStartedAt = now

        if (this.rtcpRembDisabled) return

        const srtcpContext = this.srtcpContext
        const videoRtpSession = this.videoRtpSession
        if (!srtcpContext || !videoRtpSession) return

        const senderSsrc = videoRtpSession.getSsrc()
        const heard = group?.videoSourceSsrcs()
        try {
            const remb = buildReceiverEstimatedMaxBitrate(
                senderSsrc,
                heard && heard.length > 0 ? heard : mediaSsrc,
                bitrate
            )
            this.sendRtcp(srtcpContext, remb, senderSsrc)
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
}
