import type { Logger } from 'zapo-js'

import {
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
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
    onReaction(reaction: WaCallReaction): void
    onInboundAudio(pcm: Float32Array): void
    onInboundVideoRtp(packet: InboundVideoRtpPacket): void
    onInboundVideo(frame: InboundVideoFrame): void
    onOutboundAudioFinished(): void
    /** A plan change for a host elsewhere to apply; only a remote link emits it. */
    onPlan(message: WaCallMediaMessage): void
}

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

export interface WaLocalCallMediaOptions {
    readonly logger: Logger
    readonly events: WaCallMediaLinkEvents
    readonly useOriginalRelayPort: boolean
    readonly useRawUdpTransport: boolean
}

/**
 * Media carried in this process: a plane on the Node host, clocked and fed by the audio
 * engine. Before media flows the engine only ticks the caller's warmup silence.
 */
export class WaLocalCallMedia implements WaCallMediaLink {
    private readonly plane: WaCallMediaPlane
    private readonly audio: WaAudioEngine

    constructor(options: WaLocalCallMediaOptions) {
        const { events, logger } = options
        this.audio = new WaAudioEngine({ logger: logger.child({ component: 'audio-engine' }) })
        this.plane = new WaCallMediaPlane({
            ...nodeMediaHost,
            logger,
            useOriginalRelayPort: options.useOriginalRelayPort,
            createRawUdpLeg: options.useRawUdpTransport
                ? (legOptions) => new WaRawUdpLeg(legOptions)
                : undefined,
            onActive: () => {
                this.audio.startPlayback()
                this.audio.startCapture()
                events.onActive()
            },
            onRelayLost: (reason) => events.onRelayLost(reason),
            onReaction: (reaction) => events.onReaction(reaction),
            onInboundVideoRtp: (packet) => events.onInboundVideoRtp(packet),
            onInboundVideo: (frame) => events.onInboundVideo(frame)
        })

        this.audio.setAudioSender({ sendCapturedAudio: (pcm) => this.plane.pushCapture(pcm) })
        this.audio.setPlayoutSource((out) => this.plane.pullPlayout(out))
        // The engine reuses its buffer on the next tick, so copy before handing it out.
        this.audio.setPlaybackSink((pcm) => events.onInboundAudio(pcm.slice()))
        this.audio.setOnAudioFinished(() => events.onOutboundAudioFinished())
    }

    start(): Promise<void> {
        return this.plane.start()
    }

    async apply(update: WaCallMediaPlanUpdate): Promise<void> {
        await this.plane.apply(update)
        // Before the flow, only the caller's warmup runs the clock; the real source starts with it.
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
    private readonly sequencer: WaCallMediaMessageSequencer
    private active = false
    private stopped = false

    constructor(callId: string, events: WaCallMediaLinkEvents) {
        this.events = events
        this.sequencer = new WaCallMediaMessageSequencer(callId)
    }

    start(): Promise<void> {
        return Promise.resolve()
    }

    apply(update: WaCallMediaPlanUpdate): Promise<void> {
        if (!this.stopped) {
            this.events.onPlan(this.sequencer.next(update))
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
        switch (event.type) {
            case 'active':
                if (this.active) return
                this.active = true
                this.events.onActive()
                return
            case 'relay_lost':
                this.events.onRelayLost(event.reason)
                return
            case 'reaction':
                this.events.onReaction(event.reaction)
                return
            case 'resync':
                this.events.onPlan(this.sequencer.snapshot())
                return
        }
    }

    snapshot(): WaCallMediaMessage {
        return this.sequencer.snapshot()
    }
}

function localAudioUnavailable(): Error {
    return new Error('this call carries its media remotely; its audio is fed on the media host')
}
