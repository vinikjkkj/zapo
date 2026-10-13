import type { WaCallReaction } from '../app-data/protocol.js'
import { WaAppDataStream } from '../app-data/WaAppDataStream.js'
import { bytesToHex, concatBytes, EMPTY_BYTES, readUInt32BE, toArrayBuffer } from '../bytes.js'
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
import { createNoopLogger, type Logger } from '../logger.js'
import { type AudioReceiveSenderStats, AudioReceiveSet } from '../media/audio-receive-set.js'
import { WA_FAST_REMB_ELEMENT_LENGTH, writeFastRembExtension } from '../media/fast-remb.js'
import { H264Depacketizer, isH264KeyFrame, packetizeH264AnnexB } from '../media/h264.js'
import {
    MLOW_MAX_PACKET_BYTES,
    MLOW_MAX_RED_BLOCKS,
    MLOW_MAX_SUBFRAMES,
    MLOW_TOC_VAD,
    MLowCodec,
    type MLowCompanionModelSource,
    type MLowDecodeOutcome,
    mlowPacketSamples,
    type MLowRedOptions,
    readMlowRed,
    writeMlowRed
} from '../media/mlow-codec.js'
import { AudioPayloadProbe } from '../media/payload-probe.js'
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
import { type RtpHeader, RtpSession, WA_RTP_EXTENSION_PROFILE } from '../media/rtp.js'
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
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
    PayloadType,
    SRTP_AUTH_TAG_LEN,
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN,
    type SrtpKeyingMaterial
} from '../types.js'

import {
    dialableRelayEndpoints,
    type WaCallMediaGroup,
    type WaCallMediaKeys,
    type WaCallMediaPlanUpdate,
    type WaCallMediaRelay,
    type WaCallMediaRelays,
    type WaCallMediaSettings,
    type WaCallMediaSsrcs,
    type WaCallMediaVideo
} from './plan.js'

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
 * An audio call runs the server's `rc.rtcp_interval_ms` (1500) from the plan's
 * settings instead; a video call never gets that key, so this default runs there.
 */
const SENDER_REPORT_INTERVAL_MS = 1_000

/**
 * Clock rate of the WhatsApp opus stream, the unit of its RTP timestamps. The
 * capture runs at the same rate, so one captured sample is one tick.
 */
const AUDIO_CLOCK_RATE = 16_000
/** Clock rate of the H.264 stream, the unit of its RTP timestamps. */
const VIDEO_CLOCK_RATE = 90_000

/** Samples in one frame of the codec, used until the codec itself is loaded. */
const DEFAULT_FRAME_SAMPLES = 960

/** Most frames bundled per audio packet: the two the official 1:1 client sends. */
const MAX_AUDIO_FRAMES_PER_PACKET = 2

/**
 * RED layout sent: `timestamp`, the copy-first multiframe stamped on the copy, which interoperates
 * without negotiation, or the experimental `official` on PT 121, see {@link writeMlowRed}.
 */
const MLOW_RED_LAYOUT: 'official' | 'timestamp' = 'timestamp'
/** Room for the primary header and primary behind the most copies, each 2 header bytes and 255 at most. */
const RED_PACKET_BYTES = 1 + MLOW_MAX_PACKET_BYTES + MLOW_MAX_RED_BLOCKS * (2 + 0xff)

/**
 * How far a frame's capture instant may drift from the stream's timeline: 120 ms. Later
 * and the stream jumps to the clock with the marker set; earlier and the frame is shed.
 */
const AUDIO_TIMELINE_SLACK_TICKS = (120 * AUDIO_CLOCK_RATE) / 1000

/**
 * Playout queue capacity: three of the largest packets the decoder produces,
 * 120 ms frames aggregated two at a time, at 16 kHz. 720 ms.
 */
const PLAYOUT_CAPACITY_SAMPLES = 11_520

/** How often the relay subscriptions are replayed while media flows. */
const SUBSCRIPTION_REFRESH_INTERVAL_MS = 5_000

/** Shortest gap between two key frame requests while no key frame has arrived. */
const KEY_FRAME_REQUEST_INTERVAL_MS = 300

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
 * `mlow-1`: plain MLow on a payload type of its own, on PT 120's clock, SSRC and numbering, so it
 * shares that stream's timeline. A sender moves to it when a group call falls to two members.
 */
const MLOW_ALT_PAYLOAD_TYPE = 122

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

/**
 * Size of the video extension scratch: the largest shape this plane emits,
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
 * package does not implement, so the plane counts and discards - by choice,
 * not for lack of knowing the format.
 *
 * The video branch used to accept 103 alongside 97 and cut `subarray(2)` off
 * the payload on an undocumented assumption, pushing parity into H.264 frame
 * assembly: the first parity byte having `& 0x1f` equal to 5, one chance in
 * 32, was enough to announce a key frame that did not exist. 106 never matched
 * that condition, so two payload types of the same stream got different
 * treatment.
 *
 * The routing is by payload type because the PT comes from the packet itself,
 * while the SSRC of the FEC slot depends on the derivation signaling ran. The
 * formula covers 109 onwards without waiting for a new capture, and it reaches
 * neither 97, below the base, nor the 120 of opus, off the stride. It does reach
 * 121 (`103 + 3 * 6`), which is audio: the receive path claims it before asking.
 */
function isReedSolomonFecPayloadType(pt: number): boolean {
    return (
        pt >= REED_SOLOMON_FEC_PAYLOAD_BASE &&
        (pt - REED_SOLOMON_FEC_PAYLOAD_BASE) % REED_SOLOMON_FEC_PAYLOAD_STRIDE === 0
    )
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
     * Weights of the MLow Companion, the neural post-filter WhatsApp runs inside its decoder on
     * wideband mono MLow: the `DNNw` blob it downloads as `mlow_companion_v1.pte` (despite the
     * name, not ExecuTorch), as bytes or as a loader called each time a call loads the codec.
     * Not shipped with any package. The library documents it for 20 ms frames; measured on
     * 0.2.0 it also reshapes the 60 ms frames a 1:1 call carries, at roughly 40 times the
     * decode CPU. Weights that fail to load leave the call decoding without it, with a warning.
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
    /** Inbound RTP dropped on an exception in the receive path: the sum of the three below. */
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

/** The send time as WhatsApp Web stamps it in extension id 9: wall ms / 16, 12 bits. */
function wallSendTime16(): number {
    return Math.floor(Date.now() / 16) & 0x0fff
}

/**
 * The media of one call, driven by a plan from signaling ({@link apply}) and by the host's
 * capture and playout. Audio and video are stamped on one {@link WaMediaClock} per call.
 */
export class WaCallMediaPlane {
    private readonly logger: Logger
    private readonly events: WaCallMediaPlaneEvents
    private readonly crypto: WaMediaCrypto
    private readonly sctpRelay: WaSctpRelay
    private readonly useOriginalRelayPort: boolean
    private readonly rawUdpLegs: 'all' | 'required'
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
    /**
     * Whether the server announced SFrame for this call's app data. Recorded, never
     * gated on - see {@link WaAppDataStream.setSframe} for why gating the send on it
     * loses every reaction.
     */
    private appDataSframeRequired = false

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
    /** A speech frame waiting for the next to share its packet: a view into one of the slots. */
    private pendingAudio: Uint8Array | null = null
    private pendingAudioTimestamp = 0
    private pendingAudioMarker = false
    private pendingAudioCaptureMs = 0
    /** RED: the redundant copy of the last frame sent, which the next packet carries first. */
    private previousSecondary: Uint8Array | null = null
    private previousSecondaryTimestamp = 0
    private previousSecondaryCaptureMs = 0
    /** RED layout this plane sends; see {@link MLOW_RED_LAYOUT}. */
    private redLayout: 'official' | 'timestamp' = MLOW_RED_LAYOUT
    /** In-band RED: copies per packet, and the copies of the last frames sent with their timestamps. */
    private redLevel = 1
    private readonly redCopies: Uint8Array[] = []
    private readonly redCopyTimestamps: number[] = []
    private redScratch: Uint8Array | null = null

    private audioSendCount = 0
    private audioOctetCount = 0
    private audioDropCount = 0
    private audioRecvCount = 0
    private audioRedDiscardCount = 0
    /** Sub-frame or in-band RED bounds of the PT 121 packet being checked; fits both. */
    private readonly redPayloadBounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    private recvRealCount = 0
    private recvDtxCount = 0
    private videoSendFrames = 0
    private videoRecvPackets = 0
    /**
     * Packets of the video Reed-Solomon FEC stream, received and discarded.
     * Kept out of `videoRecvPackets` because it is another stream, on another
     * SSRC.
     */
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
    private readonly pt122Probe = new AudioPayloadProbe()

    private encodeBufferA: Float32Array | null = null
    private encodeBufferB: Float32Array | null = null
    private encodeBuffer: Float32Array | null = null
    private encodeBufferPos = 0
    private authPaddingBuffer: Uint8Array | null = null
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

    /**
     * CNAME of every sender report of this call. One value binds the audio and
     * video streams to the same participant, so it outlives both.
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
     * same mechanism, so that no second RTCP clock exists in the plane.
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
     * server sent. The three schedules are rebuilt together when it changes,
     * because the parameter applies to the RTCP of the call, not to one stream.
     */
    private rtcpIntervalMs = SENDER_REPORT_INTERVAL_MS

    /** Whether the server turned the RTCP REMB off; read per video packet. */
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
     * state because the ceiling crosses the intervals: deriving it from the rate
     * measured in each window would hand the peer back what it already sends,
     * and its own ceiling would never move from where it is.
     */
    private receiverEstimateBitrate = 0

    /** Pacing of the audio REMB on the call's RTCP interval, and the bitrate it last announced. */
    private audioReceiverEstimateSchedule =
        SenderReportSchedule.onWallClock(SENDER_REPORT_INTERVAL_MS)
    private audioReceiverEstimateBitrate = 0

    /**
     * Buffer of the video RTP header extension, rewritten on every packet.
     *
     * It exists because this is the per-packet path: building the extension in a
     * fresh allocation per packet is garbage proportional to the frame rate
     * times the packets per frame. The size is that of the largest shape the
     * plane emits, and `buildVideoExtension` returns a slice of it, valid until
     * the next call.
     */
    /**
     * Experimental, off by default: carry the send time in extension id 9 on audio and video,
     * as WhatsApp Web does. Off, video's id 9 carries the transport sequence and audio none.
     */
    private wallSendTimeExtension = false
    /** The audio's one-element extension: id 9 with the send time, then padding. */
    private readonly audioExtension = Uint8Array.from([0x91, 0, 0, 0])
    private readonly videoExtensionScratch = new Uint8Array(VIDEO_EXTENSION_SCRATCH_LENGTH)
    private readonly videoExtensionViews = buildExtensionViews(this.videoExtensionScratch)

    /**
     * Queues one decoded frame for playout. Bound once so the per-packet decode
     * path allocates no closure. The frames of a decode round are handed over
     * in playout order, concealment first, and the queue accepts any length,
     * so nothing here needs the sequence number that produced them.
     */
    private readonly onDecodedAudio = (pcm: Float32Array): void => {
        this.playout.write(pcm)
    }

    private actualPeerSsrc: number | null = null
    private ssrcResubscribed = false
    private readonly inboundVideoStreams = new Map<number, InboundVideoStream>()

    constructor(options: WaCallMediaPlaneOptions) {
        this.logger = options.logger ?? createNoopLogger()
        this.events = options
        this.crypto = options.crypto
        this.useOriginalRelayPort = options.useOriginalRelayPort ?? false
        this.rawUdpLegs = options.rawUdpLegs ?? 'all'
        this.companionModel = options.mlowCompanionModel
        this.redOptions = options.mlowRed
        this.senderSilenceMs = options.senderSilenceMs ?? DEFAULT_SENDER_SILENCE_MS
        this.videoSubscriptionsEnabled = options.videoSubscriptions ?? false
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
            rawUdpLegs: this.rawUdpLegs,
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
     * Applies the REMB gate, RTCP interval and app-data SFrame flag; a `null` section changes
     * nothing, a `null` interval inside one restores the compiled interval.
     */
    private applySettings(settings: WaCallMediaSettings | null): void {
        if (!settings) return

        this.rtcpRembDisabled = settings.disableRtcpRemb

        const intervalMs = settings.rtcpIntervalMs ?? SENDER_REPORT_INTERVAL_MS
        if (intervalMs !== this.rtcpIntervalMs) {
            this.rtcpIntervalMs = intervalMs
            this.audioReportSchedule = SenderReportSchedule.onMediaClock(
                intervalMs,
                AUDIO_CLOCK_RATE
            )
            this.videoReportSchedule = SenderReportSchedule.onWallClock(intervalMs)
            this.receiverEstimateSchedule = SenderReportSchedule.onWallClock(intervalMs)
            this.audioReceiverEstimateSchedule = SenderReportSchedule.onWallClock(intervalMs)
        }

        this.appDataSframeRequired = settings.appDataSframe
        this.appDataStream?.setSframe(this.appDataSframeRequired, null)

        const framesPerPacket = Math.trunc(settings.audioFramesPerPacket ?? 1)
        this.audioFramesPerPacket =
            framesPerPacket > 1 ? Math.min(framesPerPacket, MAX_AUDIO_FRAMES_PER_PACKET) : 1

        this.logger.debug('media settings applied', {
            disableRtcpRemb: this.rtcpRembDisabled,
            rtcpIntervalMs: this.rtcpIntervalMs,
            appDataSframe: this.appDataSframeRequired,
            audioFramesPerPacket: this.audioFramesPerPacket
        })
    }

    private applySsrcs(ssrcs: WaCallMediaSsrcs | null): void {
        if (!ssrcs) return
        this.ssrcs = ssrcs

        if (this.rtpSession?.getSsrc() !== ssrcs.selfAudio) {
            this.rtpSession = RtpSession.whatsappOpus(ssrcs.selfAudio)
            // A new stream's first frame anchors on the clock, not on the old timeline.
            this.audioTimelineAnchored = false
            this.pendingSkipSamples = 0
            this.pendingAudio = null
            this.clearRedCopies()
        }
        if (this.carriesVideo) {
            this.ensureVideoRtpSession()
        }

        this.refreshPeerAppData()
        this.openAppDataStream(ssrcs.selfAppData)

        /** A peer stream seen on the wire outranks the derived one, signaling's best guess. */
        const subscriptionSsrc = this.actualPeerSsrc ?? ssrcs.peerAudio
        if (subscriptionSsrc !== this.subscriptionSsrc) {
            this.subscriptionSsrc = subscriptionSsrc
            this.sctpRelay.setSubscriptionSsrc(subscriptionSsrc)
            this.requestResend()
        }
        if (ssrcs.selfAudio !== this.registeredSelfSsrc) {
            this.registeredSelfSsrc = ssrcs.selfAudio
            this.sctpRelay.setSsrc(ssrcs.selfAudio)
            this.requestResend()
        }
        this.refreshStreams()
        /** A plan without layers leaves the relay on the 1:1 declaration it never left. */
        const selfLayers = ssrcs.selfLayers ?? null
        if (selfLayers || this.selfLayersDeclared) {
            this.selfLayersDeclared = selfLayers !== null
            this.sctpRelay.setSelfLayers(selfLayers)
        }

        this.logger.debug('media ssrcs applied', {
            selfSsrc: `0x${ssrcs.selfAudio.toString(16)}`,
            peerSsrc: `0x${this.subscriptionSsrc.toString(16)}`
        })
    }

    private applyKeys(keys: WaCallMediaKeys | null): void {
        if (!keys || keys.epoch === this.keyEpoch) return
        this.keyEpoch = keys.epoch

        this.srtpSession = new SrtpSession(
            this.crypto,
            keys.send,
            keys.recv,
            SRTP_SEND_AUTH_TAG_LEN,
            SRTP_RECV_AUTH_TAG_LEN
        )
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
                clockRate: AUDIO_CLOCK_RATE,
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
     * Keys every SSRC of the group's senders on the receive sessions and drops the SSRCs no
     * longer listed, with their video reassembly. Same material keeps a context, its ROC and
     * replay window; the bound grows first so no planned context is evicted, and leaves room
     * for streams keyed lazily.
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

        /**
         * With a leg open, relays of the same generation are kept for a redial after every leg
         * is lost; a newer generation is where the server moved the call, dialled at once.
         */
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
            // The warmup's silence is already on the wire, so the call's clock starts here.
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
            capturedAtMs ?? this.clock.now() - (samples.length * 1000) / AUDIO_CLOCK_RATE
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
        const keyFrame = isH264KeyFrame(data)
        if (!this.videoStreamOpen) {
            if (!keyFrame) return 0
            this.videoStreamOpen = true
        }
        const payloads = packetizeH264AnnexB(data, 800)
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
            const encrypted = this.srtpSession.protect(packet)
            this.sctpRelay.sendMedia(toArrayBuffer(encrypted))
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
            audioCaptureSkewMs: (this.audioCaptureSkewTicks * 1000) / AUDIO_CLOCK_RATE,
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

        this.logger.debug('call media stats', {
            relayPackets: stats.relayPackets,
            recvOk: stats.audioReceived,
            srtpErrors: stats.srtpErrors,
            srtpReplays: stats.srtpReplays,
            srtpAuthFailures: stats.srtpAuthFailures,
            srtpOtherErrors: stats.srtpOtherErrors,
            sent: stats.audioSent,
            dropped: stats.audioDropped,
            timelineResyncs: stats.audioTimelineResyncs,
            shed: stats.audioFramesShed,
            videoFecDiscarded: stats.videoFecDiscarded,
            redDiscarded: stats.audioRedDiscarded,
            opusOk: stats.decoded,
            opusErr: stats.decodeErrors,
            warpFrames: stats.warpFrames,
            warpControlFrames: stats.warpControlFrames,
            warpOverruns: stats.warpOverruns,
            groupSenders: stats.senders?.length,
            unplannedPackets: stats.unplannedPackets,
            pt122: this.pt122Probe.received > 0 ? this.pt122Probe.summary() : undefined
        })

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
        this.clearRedCopies()
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
        this.peerStreams = peerStreams
        this.sctpRelay.setStreamSsrcs(selfStreams, peerStreams)
        this.requestResend()
    }

    /**
     * Opens the video receive path on a call negotiated as audio, so video the peer
     * starts halfway through has somewhere to land: the relay subscription, and the
     * video RTP session whose SSRC the key frame request and the bandwidth estimate
     * ride on. Without them an inbound stream stays a trickle with no decodable start.
     *
     * The local sender stays off - that needs an agreement, {@link openVideoSendPath}.
     * Idempotent, and a no-op on a video call.
     */
    private ensureVideoReceivePath(): void {
        if (this.videoReceivePathOpened || this.mediaType === 'video') return
        this.videoReceivePathOpened = true

        this.ensureVideoRtpSession()
        this.refreshStreams()

        this.logger.debug('video receive path opened mid-call', {
            hasVideoRtpSession: this.videoRtpSession !== null
        })
    }

    /**
     * Opens our video sender on a call negotiated as audio, once both sides agreed
     * the upgrade. Until it runs {@link sendVideoFrame} drops every frame.
     *
     * Deliberately **not** merged into {@link ensureVideoReceivePath}: the receive
     * path costs nothing and may open on the first sign of peer video, while this one
     * puts our video on the wire and may only open on an agreement. It also registers
     * our video SSRCs with the relay, which an audio call never did, or the relay
     * drops what it does not know. Idempotent, and a no-op on a video call.
     */
    private openVideoSendPath(): void {
        this.ensureVideoReceivePath()
        if (this.videoSendPathOpened || this.mediaType === 'video') return
        this.videoSendPathOpened = true

        this.ensureVideoRtpSession()
        this.refreshStreams()

        this.logger.debug('video send path opened mid-call', {
            hasVideoRtpSession: this.videoRtpSession !== null
        })
    }

    /**
     * Ceiling the video extension announces now: the one the last reception
     * interval closed on, or the initial value of the bitrate rule itself while
     * none has closed.
     *
     * What moves this number is the receive path, and that is the reason it is
     * state instead of being computed here: the announced value has to be able
     * to be larger than the rate that arrives, otherwise the sender ceiling of
     * the peer never rises. In the capture the peer does the same - it announces
     * around 150,000 while sending 29.5 kbps.
     */
    private get announcedReceiverEstimate(): number {
        return this.receiverEstimateBitrate > 0
            ? this.receiverEstimateBitrate
            : INITIAL_RECEIVER_ESTIMATE
    }

    /**
     * Builds the header extension of a video packet in the scratch of the
     * plane and returns the slice that was written.
     *
     * It allocates nothing, neither the buffer nor the slice: both belong to the
     * plane and live as long as it does. The contents of the slice are valid
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
        const id9 = this.wallSendTimeExtension ? wallSendTime16() : transportSequence
        extension[offset++] = 0x91
        extension[offset++] = (id9 >>> 8) & 0xff
        extension[offset++] = id9 & 0xff
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
                this.encodeBufferCaptureMs = capturedAtMs + (offset * 1000) / AUDIO_CLOCK_RATE
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
        const onClock = this.clock.ticksAt(captureMs, AUDIO_CLOCK_RATE)
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
                        aheadMs: (-drift * 1000) / AUDIO_CLOCK_RATE
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
                pauseMs: (((onClock - this.nextAudioTimestamp) | 0) * 1000) / AUDIO_CLOCK_RATE
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
            if (this.redLayout === 'official') {
                this.packetizeRedInBand(codec, frame, timestamp, marker, captureMs)
            } else {
                this.packetizeRed(codec, frame, timestamp, marker, captureMs)
            }
            return
        }

        const bundles = this.audioFramesPerPacket > 1 && (frame[0] & MLOW_TOC_VAD) !== 0
        const pending = this.pendingAudio
        if (pending) {
            this.pendingAudio = null
            const packet = bundles && !marker ? this.packAudio(codec, pending, frame) : null
            if (packet) {
                this.sendOpusFrame(
                    packet,
                    this.pendingAudioTimestamp,
                    this.pendingAudioMarker,
                    this.pendingAudioCaptureMs
                )
                return
            }
            this.sendOpusFrame(
                pending,
                this.pendingAudioTimestamp,
                this.pendingAudioMarker,
                this.pendingAudioCaptureMs
            )
        }
        if (bundles) {
            this.pendingAudio = frame
            this.pendingAudioTimestamp = timestamp
            this.pendingAudioMarker = marker
            this.pendingAudioCaptureMs = captureMs
            return
        }
        this.sendOpusFrame(frame, timestamp, marker, captureMs)
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
            this.sendOpusFrame(packet, copyTimestamp, false, copyCaptureMs)
        } else {
            this.sendOpusFrame(frame, timestamp, marker, captureMs)
        }
    }

    /**
     * Experimental in-band RED, every packet framed on PT 121 with copies 10 ms units back: needs
     * the receiver's RX gate (`enable_red_pt_support_rx`), set by the server, or it is rejected.
     */
    private packetizeRedInBand(
        codec: MLowCodec,
        frame: Uint8Array,
        timestamp: number,
        marker: boolean,
        captureMs: number
    ): void {
        const copies = this.redCopies
        const stamps = this.redCopyTimestamps
        if (marker) this.clearRedCopies()
        const target = (this.redScratch ??= new Uint8Array(RED_PACKET_BYTES))
        const length = writeMlowRed(target, frame, timestamp, copies, stamps)
        this.sendOpusFrame(
            target.subarray(0, length),
            timestamp,
            marker,
            captureMs,
            PayloadType.WhatsAppMlowRed
        )

        const secondary = codec.lastSecondary
        if (!secondary) return
        if (copies.length === this.redLevel) {
            copies.shift()
            stamps.shift()
        }
        copies.push(secondary)
        stamps.push(timestamp)
    }

    private clearRedCopies(): void {
        this.previousSecondary = null
        this.redCopies.length = 0
        this.redCopyTimestamps.length = 0
    }

    private packAudio(codec: MLowCodec, first: Uint8Array, second: Uint8Array): Uint8Array | null {
        try {
            return codec.packFrames([first, second])
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
        this.sendOpusFrame(
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

    /** Sends one encoded frame; `captureMs` lets the sender report carry the timestamp forward. */
    private sendOpusFrame(
        opusFrame: Uint8Array,
        timestamp: number,
        marker: boolean,
        captureMs: number,
        payloadType: number = PayloadType.WhatsAppOpus
    ): void {
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

            const rtpPacket = this.rtpSession.createPacketAtTimestamp(rtpPayload, timestamp, marker)
            rtpPacket.header.payloadType = payloadType

            rtpPacket.header.extension = true
            rtpPacket.header.extensionProfile = WA_RTP_EXTENSION_PROFILE
            if (this.wallSendTimeExtension) {
                const sendTime = wallSendTime16()
                this.audioExtension[1] = (sendTime >>> 8) & 0xff
                this.audioExtension[2] = sendTime & 0xff
                rtpPacket.header.extensionData = this.audioExtension
            } else {
                rtpPacket.header.extensionData = EMPTY_BYTES
            }

            const srtpData = this.srtpSession.protect(rtpPacket)
            this.sctpRelay.sendMedia(toArrayBuffer(srtpData))

            this.audioSendCount++
            this.audioOctetCount += rtpPayload.length
            if (this.audioReportSchedule.shouldReport(timestamp)) {
                this.sendSenderReport(
                    this.rtpSession.getSsrc(),
                    this.audioSendCount,
                    this.audioOctetCount,
                    this.timestampAtAssembly(timestamp, captureMs, AUDIO_CLOCK_RATE),
                    this.groupAudio ?? this.audioReception
                )
            }
            if (this.audioSendCount === 1 || this.audioSendCount % 500 === 0) {
                this.logger.debug('audio sent', {
                    sendCount: this.audioSendCount,
                    opusBytes: opusFrame.length,
                    srtpBytes: srtpData.length
                })
            }
        } catch (err: unknown) {
            this.logger.error('error sending audio', { message: toError(err).message })
        }
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
            // Reports whether a relay connection took it: with none open nothing left,
            // and the stream keeps the reaction buffered for the next attempt.
            sendPacket: (packet) => {
                if (!this.srtpSession) return false
                return this.sctpRelay.sendMedia(toArrayBuffer(this.srtpSession.protect(packet)))
            }
        })
        this.appDataStream.setSframe(this.appDataSframeRequired, null)
    }

    /**
     * Reads one inbound app-data packet and hands the reactions in it over; it was
     * recognized by SSRC, so its payload type is whatever the peer chose.
     */
    private onAppDataPacket(
        data: Uint8Array,
        payloadType: number,
        ssrc: number,
        connectionId: string | undefined
    ): void {
        const stream = this.appDataStream
        if (!stream || !this.srtpSession) return

        let reactions: readonly WaCallReaction[]
        try {
            const packet = this.srtpSession.unprotect(data)
            this.notePeerMedia(connectionId, ssrc)
            stream.observeInboundPayloadType(payloadType)
            reactions = stream.receive(packet.payload, ssrc)
        } catch (err: unknown) {
            this.countReceiveError(err, data)
            return
        }

        /** Outside the decode catch: a failing handler is not a bad packet. */
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
        // A no-op after a warmup: the flow continues the warmup's timeline.
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
            // The legs keep the process alive, not this replay.
            unrefTimer(this.subscriptionRefreshTimer)
        }
        this.logger.debug('media flow started')
        this.events.onActive?.()
    }

    private onRelayConnected(): void {
        if (this.accepted) this.startFlow()
    }

    /**
     * The relay has no leg left, and nothing reopens one on its own. What is
     * left is a call that is live to signaling and mute on the wire, with every
     * send dropped by the `hasConnection()` gates.
     */
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
            if (!this.srtcpRecvSession || this.dropsUnplanned(readUInt32BE(data, 4))) return
            try {
                const rtcp = this.srtcpRecvSession.unprotect(data)
                this.notePeerMedia(connectionId, readUInt32BE(data, 4))
                const arrivedAt = Date.now()
                if (this.groupAudio) {
                    this.groupAudio.observeSenderReport(rtcp, arrivedAt)
                } else {
                    this.audioReception.observeSenderReport(rtcp, arrivedAt)
                    this.videoReception.observeSenderReport(rtcp, arrivedAt)
                }
                this.logger.trace('srtcp packet received', {
                    packetType: rtcp[1],
                    feedbackFormat: rtcp[0] & 0x1f,
                    bytes: rtcp.length
                })
            } catch (err: unknown) {
                if (err instanceof SrtpError && err.type === 'auth_failed') {
                    this.groupAudio?.noteAuthFailure(readUInt32BE(data, 4))
                }
                this.logger.trace('srtcp unprotect failed', { message: toError(err).message })
            }
            return
        }

        if (!isRtpPacket(data)) return

        const pt = data[1] & 0x7f
        if (!this.srtpSession) return

        if (data.length >= 12) {
            const ssrc = readUInt32BE(data, 8)
            if (ssrc === this.rtpSession?.getSsrc() || this.selfStreams.includes(ssrc)) {
                return
            }

            // Demultiplexed before the peer's media SSRC is latched: latching this one
            // would resubscribe the call to a stream of the same peer carrying no audio.
            if (this.peerAppDataSsrcs.has(ssrc)) {
                this.onAppDataPacket(data, pt, ssrc, connectionId)
                return
            }
            if (this.dropsUnplanned(ssrc)) return
        }

        try {
            const rtpPacket = this.srtpSession.unprotect(data)
            this.notePeerMedia(connectionId, rtpPacket.header.ssrc)
            if (pt === PayloadType.WhatsAppOpus) {
                this.onAudioPacket(rtpPacket.header, rtpPacket.payload, 0)
            } else if (pt === PayloadType.WhatsAppMlowRed) {
                const payload = rtpPacket.payload
                if (
                    mlowPacketSamples(payload, this.redPayloadBounds) > 0 ||
                    readMlowRed(payload, this.redPayloadBounds) >= 0
                ) {
                    this.onAudioPacket(rtpPacket.header, rtpPacket.payload, 1)
                } else {
                    this.discardRedAudio(rtpPacket.payload, rtpPacket.header.ssrc)
                }
            } else if (pt === MLOW_ALT_PAYLOAD_TYPE) {
                const outcome = this.onAudioPacket(rtpPacket.header, rtpPacket.payload, 0)
                this.notePt122(rtpPacket.header, rtpPacket.payload, outcome)
            } else if (pt === PayloadType.WhatsAppH264) {
                this.onVideoPacket(rtpPacket.header, rtpPacket.payload, pt)
            } else if (isReedSolomonFecPayloadType(pt)) {
                const fecPackets = ++this.reedSolomonFecPackets
                if (fecPackets === 1 || fecPackets % 100 === 0) {
                    this.logger.debug('reed-solomon fec packet discarded', {
                        packets: fecPackets,
                        payloadType: pt,
                        ssrc: `0x${rtpPacket.header.ssrc.toString(16)}`
                    })
                }
            }
        } catch (err: unknown) {
            this.countReceiveError(err, data)
        }
    }

    /**
     * Decodes one peer audio packet: `stream` 0 is PT 120, 1 is PT 121, numbered apart on the
     * one timeline. PT 121 on an SSRC other than the one the reception follows stays out of it.
     */
    private onAudioPacket(
        header: RtpHeader,
        payload: Uint8Array,
        stream: 0 | 1
    ): MLowDecodeOutcome | null {
        if (this.groupAudio) {
            return this.onGroupAudioPacket(this.groupAudio, header, payload, stream)
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

        if (payload.length <= 2) this.recvDtxCount++
        else this.recvRealCount++

        const outcome = codec.decodeSequenced(
            seq,
            payload,
            this.onDecodedAudio,
            header.timestamp,
            stream
        )

        if (this.audioRecvCount % 100 === 0) {
            codec.setExpectedPacketLossPercent(this.audioReception.lossPercent)
            const stats = codec.getStats()
            this.logger.debug('audio recv stats', {
                recvCount: this.audioRecvCount,
                real: this.recvRealCount,
                dtx: this.recvDtxCount,
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
                ssrc: `0x${ssrc.toString(16)}`
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
        stream: 0 | 1
    ): MLowDecodeOutcome | null {
        const ssrc = header.ssrc
        this.audioRecvCount++
        if (payload.length <= 2) this.recvDtxCount++
        else this.recvRealCount++
        const outcome = group.receive(
            ssrc,
            header.sequenceNumber,
            header.timestamp,
            payload,
            stream,
            Date.now()
        )
        if (this.groupRembSsrc === 0 || !group.has(this.groupRembSsrc)) this.groupRembSsrc = ssrc
        if (ssrc === this.groupRembSsrc) this.sendAudioReceiverEstimate(ssrc)

        if (this.audioRecvCount % 100 === 0) {
            this.codec?.setExpectedPacketLossPercent(group.peakLossPercent())
            this.logger.debug('group audio recv stats', {
                recvCount: this.audioRecvCount,
                real: this.recvRealCount,
                dtx: this.recvDtxCount,
                senders: group.size
            })
        }
        return outcome
    }

    /**
     * Describes a PT 122 packet after SRTP and counts what its decoder made of it, so a call
     * shows the payload is the MLow it is decoded as. A rejected packet plays nothing: its slot
     * is concealed when the stream's next packet arrives.
     */
    private notePt122(
        header: RtpHeader,
        payload: Uint8Array,
        outcome: MLowDecodeOutcome | null
    ): void {
        const probe = this.pt122Probe
        probe.note(header.ssrc, header.timestamp, payload, outcome)
        this.groupAudio?.countPt122(header.ssrc, outcome)
        const packets = probe.received
        if (packets === 1 || packets === 10 || packets === 50 || packets % 250 === 0) {
            this.logger.debug('pt 122 audio received', {
                ssrc: `0x${header.ssrc.toString(16)}`,
                ...probe.summary()
            })
        }
    }

    /** Counts a PT 121 packet that does not parse as MLow; the first ones log their header. */
    private discardRedAudio(payload: Uint8Array, ssrc: number): void {
        const packets = ++this.audioRedDiscardCount
        if (packets > 5 && packets % 500 !== 0) return
        this.logger.debug('pt 121 packet discarded, not mlow', {
            packets,
            ssrc: `0x${ssrc.toString(16)}`,
            bytes: payload.length,
            header: bytesToHex(payload.subarray(0, 4))
        })
    }

    /** Counts an inbound RTP packet the receive path dropped: a replay, a bad auth tag, or else. */
    private countReceiveError(err: unknown, data: Uint8Array): void {
        const type = err instanceof SrtpError ? err.type : null
        const ssrc = data.length >= 12 ? readUInt32BE(data, 8) : 0
        let errorCount: number
        if (type === 'replay') errorCount = ++this.srtpReplayCount
        else if (type === 'auth_failed') {
            errorCount = ++this.srtpAuthFailureCount
            this.groupAudio?.noteAuthFailure(ssrc)
        } else errorCount = ++this.srtpOtherErrorCount
        if (errorCount <= 5) {
            this.logger.debug('srtp recv error', {
                type: type ?? 'other',
                errorCount,
                message: toError(err).message,
                ssrc: `0x${ssrc.toString(16)}`
            })
        }
    }

    /**
     * Subscribes the call to the first peer audio stream that authenticated, once. The
     * subscription names the peer's audio, so its video and FEC streams never latch.
     */
    private latchPeerSsrc(ssrc: number): void {
        if (this.ssrcResubscribed || this.actualPeerSsrc !== null) return
        this.actualPeerSsrc = ssrc
        if (ssrc === this.subscriptionSsrc) return
        this.subscriptionSsrc = ssrc
        this.ssrcResubscribed = true
        this.sctpRelay.setSubscriptionSsrc(ssrc)
        this.requestResend()
    }

    private onVideoPacket(
        header: {
            readonly ssrc: number
            readonly sequenceNumber: number
            readonly timestamp: number
            readonly marker: boolean
        },
        payload: Uint8Array,
        pt: number
    ): void {
        // Video on a call negotiated as audio: the upgrade may never have reached the
        // plan, so the media itself opens the path.
        this.ensureVideoReceivePath()
        this.videoRecvPackets++
        const group = this.groupAudio
        if (group) {
            group.observeVideo(header.ssrc, header.sequenceNumber, header.timestamp, Date.now())
        } else {
            this.videoReception.observe(
                header.ssrc,
                header.sequenceNumber,
                header.timestamp,
                Date.now()
            )
        }
        this.videoRecvOctets += payload.length
        this.sendReceiverEstimate(header.ssrc)
        if (this.videoRecvPackets === 1 || this.videoRecvPackets % 100 === 0) {
            this.logger.debug('video packet received', {
                packets: this.videoRecvPackets,
                payloadType: pt,
                ssrc: `0x${header.ssrc.toString(16)}`
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
            payloadType: pt,
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
            if (!stream.keyFrameReceived) {
                const now = Date.now()
                /**
                 * The whole plane's floor: every tracked stream keeps its own pace, and a peer
                 * minting new SSRCs draws no more requests than all of them together.
                 */
                if (
                    now - stream.lastKeyFrameRequestAt >= KEY_FRAME_REQUEST_INTERVAL_MS &&
                    now - this.lastKeyFrameRequestAt >=
                        KEY_FRAME_REQUEST_INTERVAL_MS / this.maxVideoStreams
                ) {
                    stream.lastKeyFrameRequestAt = now
                    this.lastKeyFrameRequestAt = now
                    this.requestKeyFrame(header.ssrc)
                }
            }
            this.logger.trace('video frame assembled', {
                timestamp: frame.timestamp,
                keyFrame: frame.keyFrame,
                bytes: frame.data.length
            })
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
        this.sctpRelay.sendMedia(toArrayBuffer(this.srtcpContext.protect(pli, senderSsrc)))
        const fir = buildFullIntraRequest(senderSsrc, mediaSsrc, this.videoFirSequence++)
        this.sctpRelay.sendMedia(toArrayBuffer(this.srtcpContext.protect(fir, senderSsrc)))
        this.logger.debug('video key frame requested', {
            mediaSsrc: `0x${mediaSsrc.toString(16)}`
        })
    }

    private async connectRelays(relays: WaCallMediaRelays): Promise<void> {
        this.logger.debug('connecting relays', {
            endpointCount: relays.endpoints.length,
            generation: relays.generation ?? 0
        })

        // A relay answers only on the port it advertises, and the endpoints
        // carry a mix. WhatsApp Web dials them all on the web client port and
        // keeps the advertised one as `originalPort`, gating the alternative
        // behind `shouldUseOriginalRelayPort`; this mirrors both sides of that.
        const dialPort = (ep: WaCallMediaRelay): number =>
            this.useOriginalRelayPort ? ep.port : TRUE_WEB_CLIENT_RELAY_PORT
        const configs = dialableRelayEndpoints(relays.endpoints).map((ep) => ({
            ip: ep.ip,
            port: dialPort(ep),
            token: ep.token,
            authToken: ep.authToken,
            rawAuthToken: ep.rawAuthToken,
            rawToken: ep.rawToken,
            key: ep.key,
            relayId: ep.relayId,
            name: ep.name || `${ep.ip}:${dialPort(ep)}`,
            authTokenId: ep.authTokenId,
            // The port the relay advertised for itself, kept alongside the
            // dialled one so a raw UDP leg can reach the relay where it
            // says it listens instead of on the web client's rewrite.
            originalPort: ep.port,
            transport: ep.transport
        }))

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
     * Emits one compound sender report for the stream `senderSsrc` identifies,
     * carrying that stream's own counters, its own RTP timestamp and the report
     * block of the inbound stream it is paired with.
     *
     * Called from the send path once the stream's own schedule says the report
     * interval has closed. `rtpTimestamp` is taken at assembly
     * ({@link timestampAtAssembly}), the instant whose wall time fills the NTP field.
     *
     * `whatsappVideoProfile` separates the two callers: the video path turns
     * WhatsApp's profile bit on in byte 0 of the sender report, taking it to
     * 0x91, and the audio one stays on the canonical byte. Only this send path
     * knows which stream the report belongs to, so the distinction comes down
     * from here as a parameter instead of being deduced from the SSRC further
     * down.
     *
     * The block counter stays as the builder derives it from `packetCount`, which
     * is already monotonic per call. A group call's report carries a block per
     * sender heard on that stream kind; only a single block carries the packet
     * trailer.
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
            this.sctpRelay.sendMedia(toArrayBuffer(srtcpContext.protect(report, senderSsrc)))
        } catch (err: unknown) {
            this.logger.trace('sender report send failed', {
                senderSsrc: `0x${senderSsrc.toString(16)}`,
                message: toError(err).message
            })
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
     * The audio REMB (PSFB 206, FMT 15) once per RTCP interval, from our audio stream on the
     * peer's: its UAQC only leaves probing on one. The video REMB gate does not apply. A group
     * call keeps one REMB too, on one sender's stream with that sender's loss: whether the relay
     * wants one per sender, or ends it, is not known.
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
            this.sctpRelay.sendMedia(toArrayBuffer(srtcpContext.protect(remb, senderSsrc)))
            this.logger.trace('audio receiver estimate sent', {
                mediaSsrc: `0x${mediaSsrc.toString(16)}`,
                bitrate
            })
        } catch (err: unknown) {
            this.logger.trace('audio receiver estimate send failed', {
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
     * key frame request addresses, and not the derived SSRC of the peer: what is
     * on the wire is the only source that cannot diverge.
     *
     * The per-packet cost is one addition and one subtraction; the rest only
     * runs on the packet that closes the interval.
     *
     * In a group call the one estimate covers every sender's video heard, listed
     * together, against the worst sender's loss.
     *
     * A server that turned the REMB off cancels the send. That feedback
     * transport is off per call, and a REMB emitted anyway is a correct packet
     * the peer does not process. Only the send is conditional: the ceiling is
     * computed and stored before the gate, on purpose, because it does not
     * belong to RTCP. What also reads it is the video RTP header extension, and
     * it is precisely on the calls where the server turns the REMB off that this
     * other transport is the only one left - leaving the computation behind the
     * gate would keep it stuck at zero exactly where it matters.
     */
    private sendReceiverEstimate(mediaSsrc: number): void {
        const now = Date.now()
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
            this.sctpRelay.sendMedia(toArrayBuffer(srtcpContext.protect(remb, senderSsrc)))
            this.logger.trace('receiver estimate sent', {
                mediaSsrc: `0x${mediaSsrc.toString(16)}`,
                bitrate
            })
        } catch (err: unknown) {
            this.logger.trace('receiver estimate send failed', {
                senderSsrc: `0x${senderSsrc.toString(16)}`,
                message: toError(err).message
            })
        }
    }
}
