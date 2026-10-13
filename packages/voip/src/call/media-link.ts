import { readFile } from 'node:fs/promises'

import type { Logger } from 'zapo-js'
import { toBytesView } from 'zapo-js/util'

import {
    dialableRelayEndpoints,
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
    type MLowCompanionModelSource,
    type MLowRedOptions,
    WA_CALL_MEDIA_FEATURE_GROUP,
    WA_CALL_MEDIA_FEATURE_GROUP_ATTRIBUTION,
    WA_CALL_MEDIA_FEATURE_RAW_UDP,
    type WaCallMediaEvent,
    type WaCallMediaMessage,
    WaCallMediaMessageSequencer,
    WaCallMediaPlane,
    type WaCallMediaPlanUpdate,
    type WaCallReaction
} from '@zapo-js/voip-media'
import { nodeMediaHost, WaRawUdpLeg } from '@zapo-js/voip-media/node'

import { WaAudioEngine } from '../media/WaAudioEngine.js'

/** What a session hears back from wherever its media runs. */
export interface WaCallMediaLinkEvents {
    /** Media started flowing: the call is accepted and a relay leg is up. */
    onActive(): void
    onRelayLost(reason: string): void
    /** A relay answered one of our legs for the first time; `rttMs` when the media measured one. */
    onRelayAnswered(name: string, rttMs?: number): void
    /** `senderId` names the group sender the reaction came from, when the host knows it. */
    onReaction(reaction: WaCallReaction, senderId?: string): void
    onInboundAudio(pcm: Float32Array): void
    onInboundVideoRtp(packet: InboundVideoRtpPacket): void
    onInboundVideo(frame: InboundVideoFrame): void
    onOutboundAudioFinished(): void
    /** A plan change for a host elsewhere to apply; only a remote link emits it. */
    onPlan(message: WaCallMediaMessage): void
    /**
     * What the media host can apply. A local link names its own on start; a remote host older
     * than the `host` event is reported with none once it sends anything else.
     */
    onHostFeatures?(features: readonly string[]): void
    /** A media problem the call carries on through, for `voip_call_error`. */
    onError?(error: Error): void
    /** A group sender's media started or stopped arriving; see `WaCallMediaPlaneEvents.onSenderMedia`. */
    onSenderMedia?(senderId: string, receiving: boolean): void
    /**
     * One group sender's decoded audio before the mix, a copy; local link only. Leave it out
     * when nothing listens, or every frame is copied for nobody.
     */
    onSenderAudio?(senderId: string, pcm: Float32Array): void
}

/** The group sections and raw UDP legs, which a group call needs from its media host. */
const GROUP_HOST_FEATURES: readonly string[] = [
    WA_CALL_MEDIA_FEATURE_GROUP,
    WA_CALL_MEDIA_FEATURE_RAW_UDP
]

/** What the plane in this process applies; its video subscriptions stay off. */
const LOCAL_HOST_FEATURES: readonly string[] = [
    ...GROUP_HOST_FEATURES,
    WA_CALL_MEDIA_FEATURE_GROUP_ATTRIBUTION
]

/**
 * What a session talks to about media: the session publishes the plan, and the link
 * decides whether it runs in this process or on a host elsewhere.
 */
export interface WaCallMediaLink {
    /** Readies the media side; the local link loads the codec. */
    start(): Promise<void>
    apply(update: WaCallMediaPlanUpdate): Promise<void>
    stop(): void
    sendReaction(reaction: string): boolean
    sendVideoFrame(data: Uint8Array, timestampUs: number): number
    loadAudio(audioPath: string): Promise<void>
    setExternalAudioMode(enabled: boolean): void
    feedLiveAudio(data: Float32Array): number
    getLiveBufferMs(): number
    /** An event from the remote host; the local link has none to take. */
    handleEvent(event: WaCallMediaEvent): void
    /** The whole plan as it stands, for a remote host that joins late or lost track. */
    snapshot(): WaCallMediaMessage | null
}

/**
 * The Companion weights as the media takes them: bytes as they are, a path as a loader that reads
 * the file once, on the first call that asks, and shares that read with every call after.
 */
export function toCompanionModelSource(
    model: Uint8Array | ArrayBuffer | string | undefined
): MLowCompanionModelSource | undefined {
    if (typeof model !== 'string') return model
    let read: Promise<Uint8Array> | null = null
    return () => {
        read ??= readFile(model).then(
            (bytes) => toBytesView(bytes),
            (err: unknown) => {
                read = null
                throw err
            }
        )
        return read
    }
}

export interface WaLocalCallMediaOptions {
    readonly logger: Logger
    readonly events: WaCallMediaLinkEvents
    readonly useOriginalRelayPort: boolean
    readonly useRawUdpTransport: boolean
    readonly mlowCompanionModel?: MLowCompanionModelSource
    readonly mlowRed?: boolean | MLowRedOptions
}

/**
 * Media carried in this process: a plane on the Node host, clocked and fed by the audio
 * engine, whose one capture clock runs from the warmup silence into the real source.
 */
export class WaLocalCallMedia implements WaCallMediaLink {
    private readonly plane: WaCallMediaPlane
    private readonly audio: WaAudioEngine
    private readonly events: WaCallMediaLinkEvents
    private featuresAnnounced = false

    constructor(options: WaLocalCallMediaOptions) {
        const { events, logger } = options
        this.events = events
        this.audio = new WaAudioEngine({ logger: logger.child({ component: 'audio-engine' }) })
        this.plane = new WaCallMediaPlane({
            ...nodeMediaHost,
            logger,
            useOriginalRelayPort: options.useOriginalRelayPort,
            mlowCompanionModel: options.mlowCompanionModel,
            mlowRed: options.mlowRed,
            // Relays the plan marks raw UDP need the factory even when the rest go over WebRTC.
            createRawUdpLeg: (legOptions) => new WaRawUdpLeg(legOptions),
            rawUdpLegs: options.useRawUdpTransport ? 'all' : 'required',
            onActive: () => {
                this.audio.startPlayback()
                this.audio.startCapture()
                events.onActive()
            },
            onRelayLost: (reason) => events.onRelayLost(reason),
            onRelayAnswered: (name, rttMs) => events.onRelayAnswered(name, rttMs),
            onReaction: (reaction, senderId) => events.onReaction(reaction, senderId),
            onInboundVideoRtp: (packet) => events.onInboundVideoRtp(packet),
            onInboundVideo: (frame) => events.onInboundVideo(frame),
            onSenderMedia: (senderId, receiving) => events.onSenderMedia?.(senderId, receiving),
            onSenderAudio: events.onSenderAudio
                ? (senderId, pcm) => events.onSenderAudio?.(senderId, pcm.slice())
                : undefined
        })

        this.audio.setAudioSender({
            sendCapturedAudio: (pcm, capturedAtMs) => this.plane.pushCapture(pcm, capturedAtMs)
        })
        this.audio.setPlayoutSource((out) => this.plane.pullPlayout(out))
        // The engine reuses its buffer on the next tick, so copy before handing it out.
        this.audio.setPlaybackSink((pcm) => events.onInboundAudio(pcm.slice()))
        this.audio.setOnAudioFinished(() => events.onOutboundAudioFinished())
    }

    start(): Promise<void> {
        if (!this.featuresAnnounced) {
            this.featuresAnnounced = true
            this.events.onHostFeatures?.(LOCAL_HOST_FEATURES)
        }
        return this.plane.start()
    }

    async apply(update: WaCallMediaPlanUpdate): Promise<void> {
        await this.plane.apply(update)
        // The warmup clock runs before the flow; the flow keeps it and swaps in the real source.
        if (this.plane.isWarmingUp && !this.plane.isFlowing) {
            this.audio.startSilenceCapture()
        }
    }

    stop(): void {
        this.audio.setOnAudioFinished(null)
        this.audio.setPlaybackSink(null)
        this.audio.stop()
        this.plane.stop()
    }

    sendReaction(reaction: string): boolean {
        return this.plane.sendReaction(reaction)
    }

    sendVideoFrame(data: Uint8Array, timestampUs: number): number {
        return this.plane.sendVideoFrame(data, timestampUs)
    }

    loadAudio(audioPath: string): Promise<void> {
        return this.audio.loadAudioFile(audioPath)
    }

    setExternalAudioMode(enabled: boolean): void {
        this.audio.setExternalMode(enabled)
    }

    feedLiveAudio(data: Float32Array): number {
        return this.audio.feedExternalAudio(data)
    }

    getLiveBufferMs(): number {
        return this.audio.getLiveBufferMs()
    }

    handleEvent(): void {
        throw new Error('this call carries its media locally; there is no remote host to hear from')
    }

    snapshot(): null {
        return null
    }
}

/**
 * Media carried by a host elsewhere: the plan leaves through
 * {@link WaCallMediaLinkEvents.onPlan} and the host's events come back via {@link handleEvent}.
 */
export class WaRemoteCallMedia implements WaCallMediaLink {
    private readonly events: WaCallMediaLinkEvents
    private readonly logger: Logger | undefined
    private readonly sequencer: WaCallMediaMessageSequencer
    private active = false
    private stopped = false
    /** What the host said it applies; `null` until it says, or until it shows it never will. */
    private hostFeatures: readonly string[] | null = null
    private groupPublished = false
    private groupUnsupportedReported = false

    constructor(callId: string, events: WaCallMediaLinkEvents, logger?: Logger) {
        this.events = events
        this.logger = logger
        this.sequencer = new WaCallMediaMessageSequencer(callId)
    }

    start(): Promise<void> {
        return Promise.resolve()
    }

    apply(update: WaCallMediaPlanUpdate): Promise<void> {
        if (!this.stopped) {
            this.events.onPlan(this.sequencer.next(update))
            if (update.group) {
                this.groupPublished = true
                this.reportGroupUnsupported()
            }
        }
        return Promise.resolve()
    }

    stop(): void {
        this.stopped = true
    }

    /** Reactions ride the media, so the host carrying it is the one that sends them. */
    sendReaction(): boolean {
        return false
    }

    /** Video rides the media, so the host carrying it is the one that sends it. */
    sendVideoFrame(): number {
        return 0
    }

    loadAudio(): Promise<void> {
        return Promise.reject(localAudioUnavailable())
    }

    setExternalAudioMode(): void {
        throw localAudioUnavailable()
    }

    feedLiveAudio(): number {
        throw localAudioUnavailable()
    }

    getLiveBufferMs(): number {
        return 0
    }

    handleEvent(event: WaCallMediaEvent): void {
        if (this.stopped) return
        if (event.type === 'host') {
            this.recordHostFeatures(event.features)
            return
        }
        /** A host that knows the event sends it before anything else. */
        if (this.hostFeatures === null) this.recordHostFeatures([])
        switch (event.type) {
            case 'active':
                if (this.active) return
                this.active = true
                if (!event.reportsRelayAnswers) this.assumeDialledRelaysAnswered()
                this.events.onActive()
                return
            case 'relay_lost':
                this.events.onRelayLost(event.reason)
                return
            case 'relay_answered':
                this.events.onRelayAnswered(event.name, event.rttMs)
                return
            case 'reaction':
                this.events.onReaction(event.reaction, event.senderId)
                return
            case 'sender_media':
                this.events.onSenderMedia?.(event.senderId, event.receiving)
                return
            case 'resync':
                this.events.onPlan(this.sequencer.snapshot())
                return
        }
    }

    snapshot(): WaCallMediaMessage {
        return this.sequencer.snapshot()
    }

    private recordHostFeatures(features: readonly string[]): void {
        this.hostFeatures = features
        this.events.onHostFeatures?.(features)
        this.reportGroupUnsupported()
    }

    /** Once per call: a group plan published to a host that cannot apply it. */
    private reportGroupUnsupported(): void {
        const features = this.hostFeatures
        if (this.groupUnsupportedReported || !this.groupPublished || !features) return
        const missing = GROUP_HOST_FEATURES.filter((feature) => !features.includes(feature))
        if (missing.length === 0) return
        this.groupUnsupportedReported = true
        this.logger?.warn('media host cannot carry a group call', { missing, features })
        this.events.onError?.(
            new Error(`the media host lacks ${missing.join(', ')}, which a group call needs`)
        )
    }

    /** A host older than `relay_answered` names no relay: once its media is up, all we dial count. */
    private assumeDialledRelaysAnswered(): void {
        const endpoints = this.sequencer.snapshot().plan.relays?.endpoints ?? []
        for (const endpoint of dialableRelayEndpoints(endpoints)) {
            if (endpoint.name) this.events.onRelayAnswered(endpoint.name)
        }
    }
}

function localAudioUnavailable(): Error {
    return new Error('this call carries its media remotely; its audio is fed on the media host')
}
