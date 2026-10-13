import type { WaCallReaction } from '../app-data/protocol.js'
import { WaAppDataStream } from '../app-data/WaAppDataStream.js'
import { EMPTY_BYTES, hexSsrc, readUInt32BE, toArrayBuffer } from '../bytes.js'
import type { WaMediaCrypto } from '../crypto/primitives.js'
import { SrtcpContext, SrtcpSession, SrtpError, SrtpSession } from '../crypto/srtp.js'
import { toError } from '../errors.js'
import type { WaMediaHost } from '../host.js'
import { createNoopLogger, isLogLevelEnabled, type Logger } from '../logger.js'
import type { AudioReceiveSenderStats } from '../media/audio-receive-set.js'
import {
    MLowCodec,
    type MLowCompanionModelSource,
    type MLowRedOptions
} from '../media/mlow-codec.js'
import { RtpStreamReception } from '../media/rtp-stream-reception.js'
import {
    type RtpHeader,
    type RtpPacket,
    RtpSession,
    WA_RTP_EXTENSION_PROFILE
} from '../media/rtp.js'
import { WaJitterBuffer, type WaJitterBufferStats } from '../media/WaJitterBuffer.js'
import { WaMediaClock } from '../media/WaMediaClock.js'
import type { RawUdpLeg, RawUdpLegOptions } from '../relay/leg.js'
import { buildRxSubscriptions } from '../relay/stun-subscriptions.js'
import { isRtcpPacket, isRtpPacket, isStunPacket } from '../relay/stun.js'
import { readWarpFrame } from '../relay/warp-frame.js'
import { WaSctpRelay } from '../relay/WaSctpRelay.js'
import { unrefTimer } from '../timers.js'
import {
    AUDIO_SAMPLE_RATE,
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
    PayloadType,
    VIDEO_CLOCK_RATE
} from '../types.js'

import {
    type WaCallMediaGroup,
    type WaCallMediaKeys,
    type WaCallMediaPlanUpdate,
    type WaCallMediaRelays,
    type WaCallMediaSettings,
    type WaCallMediaSsrcs,
    type WaCallMediaVideo
} from './plan.js'
import { rxVideoSubscriptionInfos, sameSsrcs, toRelayConfigs, unionInOrder } from './relay-plan.js'
import { WaCallRtcp } from './WaCallRtcp.js'
import { WaGroupSenders } from './WaGroupSenders.js'
import { WaInboundAudio } from './WaInboundAudio.js'
import { MAX_H264_DEPACKETIZERS, WaInboundVideo } from './WaInboundVideo.js'
import { WaOutboundAudio } from './WaOutboundAudio.js'
import { WaOutboundVideo } from './WaOutboundVideo.js'

/**
 * Playout queue capacity: three of the largest packets the decoder produces,
 * 120 ms frames aggregated two at a time, at 16 kHz. 720 ms.
 */
const PLAYOUT_CAPACITY_SAMPLES = 11_520

/** How often the relay subscriptions are replayed while media flows. */
const SUBSCRIPTION_REFRESH_INTERVAL_MS = 5_000

/** Memory guard on a set fed from the plan, one entry per peer device; a group plan replaces it whole. */
const MAX_TRACKED_PEER_APP_DATA_SSRCS = 32

/** Video streams a group sender may send at once: main and secondary. */
const VIDEO_STREAMS_PER_SENDER = 2

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
    private readonly videoSubscriptionsEnabled: boolean
    private readonly redOptions: boolean | MLowRedOptions | undefined
    private readonly playout: WaJitterBuffer
    /** The call's media clock; its origin is the caller's warmup or the start of the flow. */
    private readonly clock: WaMediaClock

    private mediaType: 'audio' | 'video' = 'audio'
    private accepted = false
    private muted = false
    private relays: WaCallMediaRelays | null = null
    private ssrcs: WaCallMediaSsrcs | null = null
    private keyEpoch: number | null = null
    /** Generation of the relays held; see `WaCallMediaRelays.generation`. */
    private relayGeneration = 0

    /** The remote senders of a group call; its `audio` is set while in group mode. */
    private readonly group: WaGroupSenders
    /** Whether the relay was handed a video subscription; see `WaCallMediaGroup.videoSubscriptions`. */
    private rxSubscriptionsDeclared = false

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

    private applying: Promise<void> = Promise.resolve()
    private starting: Promise<void> | null = null
    private flowing = false
    private stopped = false
    /**
     * Set when a leg is up before the call is accepted, the caller's warmup: captured
     * audio then goes out as silence until the flow starts for real.
     */
    private silenceWarmup = false

    private audioSendCount = 0
    private audioOctetCount = 0
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

    private subscriptionRefreshTimer: ReturnType<typeof setInterval> | null = null

    private readonly videoReception = new RtpStreamReception(VIDEO_CLOCK_RATE)
    private actualPeerSsrc: number | null = null

    /** Our outbound RTCP: the report and REMB schedules, key frame requests, the CNAME. */
    private readonly rtcp: WaCallRtcp
    /** Our audio stream: framing, the timeline, bundling and RED. */
    private readonly outboundAudio: WaOutboundAudio
    /** Our video stream: packetization, the WA extension, the hold. */
    private readonly outboundVideo: WaOutboundVideo
    /** Peer video: per-SSRC reassembly and key frame requests. */
    private readonly inboundVideo: WaInboundVideo
    /** Peer audio: the 1:1 decode and reception, and the receive counters. */
    private readonly inboundAudio: WaInboundAudio

    /** Protects and sends one RTP packet on the keys and relay held when it is called. */
    private readonly sendProtectedRtp = (packet: RtpPacket): boolean =>
        this.srtpSession ? this.sendRtp(this.srtpSession, packet) : false

    constructor(options: WaCallMediaPlaneOptions) {
        this.logger = options.logger ?? createNoopLogger()
        this.traceEnabled = isLogLevelEnabled(this.logger, 'trace')
        this.events = options
        this.crypto = options.crypto
        this.useOriginalRelayPort = options.useOriginalRelayPort ?? false
        this.companionModel = options.mlowCompanionModel
        this.redOptions = options.mlowRed
        this.videoSubscriptionsEnabled = options.videoSubscriptions ?? false
        this.clock = new WaMediaClock(options.now)
        this.playout = new WaJitterBuffer(
            PLAYOUT_CAPACITY_SAMPLES,
            this.logger.child({ component: 'playout' })
        )
        this.rtcp = new WaCallRtcp({
            logger: this.logger,
            clock: this.clock,
            sendMedia: (datagram) => this.sctpRelay.sendMedia(toArrayBuffer(datagram))
        })
        this.outboundAudio = new WaOutboundAudio({
            logger: this.logger,
            clock: this.clock,
            send: (payload, timestamp, marker, captureMs) =>
                this.sendAudioPacket(payload, timestamp, marker, captureMs)
        })
        this.outboundVideo = new WaOutboundVideo({
            logger: this.logger,
            clock: this.clock,
            sendRtp: this.sendProtectedRtp,
            onFrameSent: (ssrc, timestamp, captureMs, now) =>
                this.onVideoFrameSent(ssrc, timestamp, captureMs, now)
        })
        this.inboundVideo = new WaInboundVideo({
            logger: this.logger,
            onFrame: options.onInboundVideo,
            requestKeyFrame: (ssrc) =>
                this.rtcp.requestKeyFrame(this.srtcpContext, this.videoRtpSession, ssrc)
        })
        this.group = new WaGroupSenders({
            logger: this.logger,
            clock: this.clock,
            companionModel: this.companionModel,
            playoutCapacity: PLAYOUT_CAPACITY_SAMPLES,
            silenceMs: options.senderSilenceMs,
            onSenderAudio: options.onSenderAudio,
            onSenderMedia: (senderId, receiving) => this.emitSenderMedia(senderId, receiving),
            onUnkeyed: (ssrc) => this.inboundVideo.drop(ssrc)
        })
        this.inboundAudio = new WaInboundAudio({
            logger: this.logger,
            playout: this.playout,
            group: this.group,
            codec: () => this.codec,
            onPeerAudio: (ssrc) => this.latchPeerSsrc(ssrc),
            sendReceiverEstimate: (ssrc) => this.sendAudioReceiverEstimate(ssrc)
        })
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

        this.rtcp.configure(settings.rtcpIntervalMs, settings.disableRtcpRemb)

        this.outboundAudio.setFramesPerPacket(settings.audioFramesPerPacket)

        this.logger.debug('media settings applied', {
            disableRtcpRemb: this.rtcp.rembDisabled,
            rtcpIntervalMs: this.rtcp.intervalMs,
            appDataSframe: settings.appDataSframe,
            audioFramesPerPacket: this.outboundAudio.framesPerPacket
        })
    }

    private applySsrcs(ssrcs: WaCallMediaSsrcs | null): void {
        if (!ssrcs) return
        this.ssrcs = ssrcs

        if (this.rtpSession?.getSsrc() !== ssrcs.selfAudio) {
            this.rtpSession = RtpSession.whatsappOpus(ssrcs.selfAudio)
            this.outboundAudio.restartTimeline()
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
        this.group.rekey(this.srtpSession, this.srtcpRecvSession)
        this.logger.debug('srtp keys applied', { epoch: keys.epoch })
    }

    /**
     * Applies a group call's senders: each gets a decoder and its receive keying on every one
     * of its SSRCs. `null` leaves group mode, the 1:1 receive path taking over again.
     */
    private applyGroup(group: WaCallMediaGroup | null): void {
        if (!group) {
            if (!this.group.leave(this.srtpSession, this.srtcpRecvSession)) return
            this.inboundVideo.setMaxStreams(MAX_H264_DEPACKETIZERS)
            this.refreshPeerAppData()
            this.applyVideoSubscriptions(null)
            this.logger.debug('group senders cleared')
            return
        }

        if (this.group.open()) this.playout.reset()
        const senders = this.group.update(group.senders, this.srtpSession, this.srtcpRecvSession)
        this.inboundVideo.setMaxStreams(
            Math.max(MAX_H264_DEPACKETIZERS, senders.length * VIDEO_STREAMS_PER_SENDER)
        )
        this.refreshPeerAppData()
        this.applyVideoSubscriptions(group)
        this.group.watchSilence()
        this.logger.debug('group senders applied', {
            senders: senders.length,
            ignored: group.senders.length - senders.length,
            keyedSsrcs: this.group.keyedCount
        })
    }

    /**
     * Recognizes inbound app data by the plan's SSRCs: a group plan's list replaces the set
     * whole, a 1:1 one only adds to it, up to its bound.
     */
    private refreshPeerAppData(): void {
        const listed = this.ssrcs?.peerAppData ?? []
        if (this.group.audio) {
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

        const infos = rxVideoSubscriptionInfos(group?.senders ?? [], wanted)
        if (infos.length < wanted.length) {
            this.logger.debug('video subscriptions without a pid left out', {
                asked: wanted.length,
                sent: infos.length
            })
        }
        this.rxSubscriptionsDeclared = infos.length > 0
        this.sctpRelay.setRxSubscriptions(infos.length > 0 ? buildRxSubscriptions(infos) : null)
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

    private applyVideo(video: WaCallMediaVideo): void {
        if (video.receive) this.ensureVideoReceivePath()
        if (video.send) this.openVideoSendPath()
        this.outboundVideo.setHeld(video.sendHeld === true)
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
        const sent =
            this.flowing && !this.muted ? samples : this.outboundAudio.silence(samples.length)
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
        const group = this.group.audio
        return group ? group.pullPlayout(out) : this.playout.read(out)
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
            this.outboundVideo.held ||
            !this.videoRtpSession ||
            !this.srtpSession ||
            !this.sctpRelay.hasConnection() ||
            !data.length
        )
            return 0
        return this.outboundVideo.sendFrame(
            this.videoRtpSession,
            data,
            timestampUs,
            this.rtcp.announcedReceiverEstimate
        )
    }

    /** A video frame went out: its sender report, when one is due. */
    private onVideoFrameSent(
        ssrc: number,
        timestamp: number,
        captureMs: number,
        now: number
    ): void {
        if (this.rtcp.videoReportDue(now)) {
            this.rtcp.sendSenderReport(
                this.srtcpContext,
                ssrc,
                this.outboundVideo.packetCount,
                this.outboundVideo.octetCount,
                this.rtcp.timestampAtAssembly(timestamp, captureMs, VIDEO_CLOCK_RATE),
                this.group.audio ?? this.videoReception,
                true
            )
        }
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
        const senders = this.group.audio?.stats()
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
            audioDropped: this.outboundAudio.dropCount,
            audioTimelineResyncs: this.outboundAudio.timelineResyncs,
            audioFramesShed: this.outboundAudio.framesShed,
            audioCaptureSkewMs: this.outboundAudio.captureSkewMs,
            audioReceived: this.inboundAudio.received,
            audioRedDiscarded: this.inboundAudio.redDiscarded,
            srtpErrors: this.srtpReplayCount + this.srtpAuthFailureCount + this.srtpOtherErrorCount,
            srtpReplays: this.srtpReplayCount,
            srtpAuthFailures: this.srtpAuthFailureCount,
            srtpOtherErrors: this.srtpOtherErrorCount,
            videoFramesSent: this.outboundVideo.framesSent,
            videoPacketsReceived: this.videoRecvPackets,
            videoFecDiscarded: this.reedSolomonFecPackets,
            decoded,
            decodeErrors,
            playout: this.group.audio ? this.group.audio.playoutStats : this.playout.stats,
            ...(senders ? { senders, unplannedPackets: this.group.unplannedPackets } : {}),
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
        this.group.close()
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
        this.inboundVideo.clear()
        this.playout.reset()
        this.group.clear()
        this.outboundAudio.clear()
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

    /**
     * Frames `data` (first sample captured at `capturedAtMs`) and sends each complete frame.
     * A drop discards the partial frame, so the timeline steps over exactly what was lost.
     */
    private encodeCaptured(data: Float32Array, capturedAtMs: number): void {
        const codec = this.codec
        const hasRelay = this.sctpRelay.hasConnection()
        if (!this.rtpSession || !this.srtpSession || !codec || !hasRelay) {
            const dropCount = this.outboundAudio.drop(data.length)
            if (dropCount === 1 || dropCount % 500 === 0) {
                const missing = [
                    !this.rtpSession && 'rtpSession',
                    !this.srtpSession && 'srtpSession',
                    !codec && 'codec',
                    !hasRelay && 'relayConnection'
                ]
                    .filter(Boolean)
                    .join(', ')
                this.logger.debug('audio dropped', { dropCount, missing })
            }
            return
        }
        this.outboundAudio.encode(codec, data, capturedAtMs)
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
            if (this.rtcp.audioReportDue(timestamp)) {
                this.rtcp.sendSenderReport(
                    this.srtcpContext,
                    rtpSession.getSsrc(),
                    this.audioSendCount,
                    this.audioOctetCount,
                    this.rtcp.timestampAtAssembly(timestamp, captureMs, AUDIO_SAMPLE_RATE),
                    this.group.audio ?? this.inboundAudio.reception
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
            sendPacket: this.sendProtectedRtp
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

        const senderId = reactions.length > 0 ? this.group.audio?.senderIdOf(ssrc) : undefined
        for (const reaction of reactions) {
            try {
                this.events.onReaction?.(reaction, senderId)
            } catch (err: unknown) {
                this.logger.warn('reaction handler failed', { message: toError(err).message })
            }
        }
    }

    private resetEncodeState(): void {
        this.outboundAudio.reset()
        this.inboundAudio.reception.reset()
        this.codec?.resetSequence()
    }

    private startFlow(): void {
        if (this.flowing || this.stopped) return
        this.clock.start()
        this.resetEncodeState()
        this.playout.reset()
        this.group.audio?.resetPlayout()
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
        const started = this.group.audio?.noteHeard(ssrc, this.clock.now())
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
            if (this.group.dropsUnplanned(ssrc)) return
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
            if (
                pt === PayloadType.WhatsAppOpus ||
                pt === PayloadType.WhatsAppMlowRed ||
                pt === PayloadType.WhatsAppMlowAlt
            ) {
                this.inboundAudio.receive(pt, header, payload)
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
        if (this.group.dropsUnplanned(ssrc)) return
        try {
            const rtcp = srtcpRecvSession.unprotect(data)
            if (!rtcp) return
            this.notePeerMedia(connectionId, ssrc)
            const arrivedAt = Date.now()
            const group = this.group.audio
            if (group) {
                group.observeSenderReport(rtcp, arrivedAt)
            } else {
                this.inboundAudio.reception.observeSenderReport(rtcp, arrivedAt)
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
                this.group.audio?.noteAuthFailure(ssrc)
            }
            if (this.traceEnabled) {
                this.logger.trace('srtcp unprotect failed', { message: toError(err).message })
            }
        }
    }

    /** Counts an inbound RTP packet SRTP refused with an error: a bad auth tag, or else. */
    private countReceiveError(err: unknown, ssrc: number): void {
        const type = err instanceof SrtpError ? err.type : 'other'
        let errorCount: number
        if (type === 'auth_failed') {
            errorCount = ++this.srtpAuthFailureCount
            this.group.audio?.noteAuthFailure(ssrc)
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
        const group = this.group.audio
        if (group) {
            group.observeVideo(header.ssrc, header.sequenceNumber, header.timestamp, now)
        } else {
            this.videoReception.observe(header.ssrc, header.sequenceNumber, header.timestamp, now)
        }
        this.rtcp.noteVideoReceived(
            payload.length,
            header.ssrc,
            now,
            this.srtcpContext,
            this.videoRtpSession,
            this.group.audio,
            this.videoReception
        )
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
        this.inboundVideo.push(header, payload, now, senderId)
    }

    private async connectRelays(relays: WaCallMediaRelays): Promise<void> {
        this.logger.debug('connecting relays', {
            endpointCount: relays.endpoints.length,
            generation: relays.generation ?? 0
        })

        const configs = toRelayConfigs(relays.endpoints, this.useOriginalRelayPort)

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

    /** The audio REMB, while media flows; see {@link WaCallRtcp.sendAudioReceiverEstimate}. */
    private sendAudioReceiverEstimate(mediaSsrc: number): void {
        if (!this.flowing) return
        this.rtcp.sendAudioReceiverEstimate(
            this.srtcpContext,
            this.rtpSession,
            mediaSsrc,
            this.group.audio,
            this.inboundAudio.reception
        )
    }
}
