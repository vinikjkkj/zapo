import { type Logger, type LogLevel, type WaClientPluginContext } from 'zapo-js'
import { WA_MESSAGE_TAGS } from 'zapo-js/protocol'

import type { CallInfo } from './call/call-state.js'
import { WaCallManager } from './call/WaCallManager.js'
import { routeCallAck, routeCallReceipt, routeCallStanza } from './signaling/bridge.js'
import type { WaVideoUpgradeResult } from './signaling/signaling.js'
import type { CallManagerEvents, CallOfferOptions, EndCallReason } from './types.js'

export interface WaVoipCoordinatorOptions {
    /**
     * Maximum simultaneous non-ended calls (ringing, connecting, or active).
     * Default is `1`. Increase to enable parallel multi-call.
     */
    readonly maxConcurrentCalls?: number
    /**
     * Minimum log level for the VOIP plugin. Defaults to the host client's
     * level; set it to cap the (chatty) VOIP diagnostics independently of the
     * host, e.g. `'warn'` to keep them out of a `trace` host logger.
     */
    readonly logLevel?: LogLevel
    /**
     * Dial each relay on the port its `<te2>` endpoint advertises instead of on
     * {@link TRUE_WEB_CLIENT_RELAY_PORT}. Defaults to `false`, which is what
     * WhatsApp Web does unless its own `shouldUseOriginalRelayPort` gate is set.
     *
     * Against WhatsApp's own relays this is the wrong choice and the call goes
     * silently one way: the endpoints advertise a mix of ports, and one reached
     * on 3478 completes the handshake and carries the uplink without ever
     * forwarding the peer's stream back. It exists for a relay deployment that
     * answers on the port it advertises.
     */
    readonly useOriginalRelayPort?: boolean
    /**
     * Carry media over a raw UDP socket to each relay instead of over the
     * WebRTC data channel, and dial every relay on the port its `<te2>`
     * endpoint advertises. Defaults to `false`.
     *
     * Off by default because it buys nothing where it works and is not proven
     * where it would: a cold-started relay accepts the allocate, answers the
     * keepalive and forwards the peer's stream to whatever address last sent
     * to it, so the raw path carries a real call - but only on relays the
     * WebRTC path already reaches. On one measured relay that WebRTC cannot
     * reach at all, the same sequence took 1761 uplink packets and returned
     * nothing, and sending into it appeared to pull the peer's stream off the
     * leg that had been carrying it.
     *
     * Each leg polices itself against that: a leg that sends media and sees no
     * media come back within a few seconds closes itself, so the previous path
     * can take the stream back. Turning this on is still an experiment, not a
     * tuning knob.
     */
    readonly useRawUdpTransport?: boolean
}

/**
 * WaClient-facing VOIP coordinator. Owns a {@link WaCallManager}, registers
 * incoming `<call>` / call-class `<ack>` / call `<receipt>` handlers (prepend,
 * returns `true`) so the core client does not double-ack, and re-emits manager
 * events on the host {@link WaClient}.
 */
export class WaVoipCoordinator {
    private readonly manager: WaCallManager
    private readonly deps: WaClientPluginContext['deps']
    private readonly logger: Logger
    private readonly unregisterHandlers: Array<() => void> = []

    constructor(ctx: WaClientPluginContext, options: WaVoipCoordinatorOptions = {}) {
        this.deps = ctx.deps
        this.logger = ctx.logger.child({ scope: '@zapo-js/voip' }, { level: options.logLevel })
        this.manager = new WaCallManager({
            deps: ctx.deps,
            stores: ctx.stores,
            logger: this.logger,
            maxConcurrentCalls: options.maxConcurrentCalls,
            useOriginalRelayPort: options.useOriginalRelayPort,
            useRawUdpTransport: options.useRawUdpTransport
        })
        this.registerIncomingHandlers(ctx)
        this.wireClientEvents(ctx)
    }

    /**
     * Place an outgoing call to `options.peerJid` (optionally video, with a
     * preloaded `audioFile`). Resolves with the new call id once the offer is
     * sent; progress then arrives via `voip_call_state`. Rejects when at the
     * concurrent-call limit or if the offer fails to send.
     */
    async startCall(options: CallOfferOptions): Promise<string> {
        return this.manager.startCall(options)
    }

    /**
     * Accept a ringing incoming call. Throws if `callId` is unknown or not in
     * an acceptable state.
     */
    async acceptCall(callId: string): Promise<void> {
        return this.manager.acceptCall(callId)
    }

    /**
     * Reject a ringing incoming call, optionally with an {@link EndCallReason}
     * (defaults to `Declined`). Sends the reject stanza, then tears the call
     * down.
     */
    async rejectCall(callId: string, reason?: EndCallReason): Promise<void> {
        return this.manager.rejectCall(callId, reason)
    }

    /**
     * End an active or connecting call, optionally with an {@link EndCallReason}
     * (defaults to `UserEnded`). Sends the terminate stanza, then tears the
     * call down. No-op if the call is unknown or already ended.
     */
    async endCall(callId: string, reason?: EndCallReason): Promise<void> {
        return this.manager.endCall(callId, reason)
    }

    /**
     * Preload an audio file (decoded via ffmpeg) as the outbound audio for
     * `callId`, played once the call is active. For an unbounded or live source
     * use {@link setExternalAudioMode} + {@link feedLiveAudio} instead. Needs
     * ffmpeg on PATH; throws if the file is missing or ffmpeg is unavailable.
     */
    async loadAudio(callId: string, audioPath: string): Promise<void> {
        return this.manager.loadAudio(callId, audioPath)
    }

    /**
     * Mute or unmute the local outbound audio for `callId` and announce it to the peer. A
     * no-op toggle, an inactive call and an unknown `callId` all do nothing.
     */
    setMute(callId: string, muted: boolean): void {
        this.manager.setMute(callId, muted)
    }

    /**
     * Raise or lower the local hand on `callId` and announce it to the peer. Durable state:
     * the peer keeps seeing the hand until it is lowered. Repeating it sends nothing, an
     * inactive call is a no-op, and the peer's own hands are `voip_call_hand_raise` /
     * {@link CallInfo.raisedHands}. Throws on an unknown `callId` or a failed send.
     */
    async setHandRaised(callId: string, raised: boolean): Promise<void> {
        return this.manager.setHandRaised(callId, raised)
    }

    /**
     * Start or stop sharing the screen on `callId`, announcing it to the peer. Not a second
     * stream: the screen replaces the camera on the call's existing video stream, so
     * whatever reaches {@link feedLiveVideo} from here on is what the peer renders as the
     * share. Throws on an unknown `callId` or a failed send, and - starting a share only -
     * on a group call or one with no video yet ({@link requestVideoUpgrade} first).
     */
    async setScreenShare(callId: string, sharing: boolean): Promise<void> {
        return this.manager.setScreenShare(callId, sharing)
    }

    /**
     * Sends an emoji reaction on a call, as the glyph itself. Returns `false` when nothing
     * went on the wire: the call is not active, or its app-data stream is not open yet.
     */
    sendReaction(callId: string, reaction: string): boolean {
        return this.manager.sendReaction(callId, reaction)
    }

    /**
     * Ask the peer to turn an audio call into a video call and wait for the answer. Resolves
     * with one of {@link WA_VIDEO_UPGRADE_RESULT}; only `accepted` means
     * {@link feedLiveVideo} now reaches the wire. Bounded by the peer's own guard timer, so
     * it settles in about five seconds even against a client that never answers. Throws on
     * an unknown `callId`, an inactive call, or one that already carries video.
     */
    async requestVideoUpgrade(callId: string): Promise<WaVideoUpgradeResult> {
        return this.manager.requestVideoUpgrade(callId)
    }

    /**
     * Accept an upgrade the peer asked for on `callId`, turning the call into a video call
     * and opening the local video sender. The request arrives as a
     * `voip_call_peer_video_state` with `change.state` of `UpgradeRequestV2`; no-op when the
     * peer has none outstanding.
     */
    async acceptVideoUpgrade(callId: string): Promise<void> {
        return this.manager.acceptVideoUpgrade(callId)
    }

    /**
     * Decline an upgrade the peer asked for on `callId`, leaving the call on audio.
     * No-op when the peer has no request outstanding; throws if `callId` is unknown.
     */
    async rejectVideoUpgrade(callId: string): Promise<void> {
        return this.manager.rejectVideoUpgrade(callId)
    }

    /**
     * Withdraw an upgrade request sent from this side before the peer has answered it;
     * the pending {@link requestVideoUpgrade} then resolves with `cancelled`. No-op
     * when nothing is in flight; throws if `callId` is unknown.
     */
    async cancelVideoUpgrade(callId: string): Promise<void> {
        return this.manager.cancelVideoUpgrade(callId)
    }

    /**
     * Switch `callId` to external (live) audio mode. While enabled, outbound
     * audio comes from {@link feedLiveAudio} through a bounded jitter buffer
     * instead of a preloaded file. Disable to return to preloaded playback.
     */
    setExternalAudioMode(callId: string, enabled: boolean): void {
        this.manager.setExternalAudioMode(callId, enabled)
    }

    /**
     * Feed a chunk of live mono PCM (`Float32Array` at the engine sample rate)
     * into an active call's outbound audio. Requires external audio mode (see
     * {@link setExternalAudioMode}). Returns the audio currently buffered
     * ahead of the sender in milliseconds, so a producer can pace itself
     * against {@link getFeedWatermarksMs}; returns `0` when no session exists
     * for `callId`. The buffer is bounded and drops the oldest samples on
     * overflow.
     */
    feedLiveAudio(callId: string, data: Float32Array): number {
        return this.manager.feedLiveAudio(callId, data)
    }

    /**
     * Feed one H.264 Annex-B encoded access unit into an active video call.
     * `timestampUs` is the capture timestamp in microseconds. Returns the number
     * of RTP packets sent, or `0` when video media is not active.
     */
    feedLiveVideo(callId: string, data: Uint8Array, timestampUs: number): number {
        return this.manager.feedLiveVideo(callId, data, timestampUs)
    }

    /**
     * Milliseconds of live audio currently buffered ahead of the sender for
     * `callId` (`0` when no session exists or external mode is off). Poll it to
     * drive backpressure against {@link getFeedWatermarksMs}.
     */
    getLiveBufferMs(callId: string): number {
        return this.manager.getLiveBufferMs(callId)
    }

    /**
     * Backpressure watermarks for the live feed, in milliseconds. Constants of
     * the feed contract, independent of any specific call: pause feeding once
     * {@link getLiveBufferMs} reaches `pauseMs`, resume once it drains to
     * `resumeMs`. `pauseMs` stays below the engine's internal drop threshold,
     * so a producer that respects it never loses audio.
     */
    getFeedWatermarksMs(): { pauseMs: number; resumeMs: number } {
        return this.manager.getFeedWatermarksMs()
    }

    /** Current {@link CallInfo} snapshot for `callId`, or `null` if unknown. */
    getCall(callId: string): CallInfo | null {
        return this.manager.getCall(callId)
    }

    /** Snapshot of every tracked call (ringing, connecting, or active). */
    getCalls(): readonly CallInfo[] {
        return this.manager.getCalls()
    }

    /**
     * Subscribe directly to a low-level {@link CallManagerEvents} event. Most
     * consumers should use the client-level `client.on('voip_*')` events
     * instead. Returns `this` for chaining.
     */
    on<K extends keyof CallManagerEvents>(event: K, listener: CallManagerEvents[K]): this {
        this.manager.on(event, listener)
        return this
    }

    /** Remove a listener registered via {@link on}. Returns `this`. */
    off<K extends keyof CallManagerEvents>(event: K, listener: CallManagerEvents[K]): this {
        this.manager.off(event, listener)
        return this
    }

    /** Like {@link on}, but the listener fires at most once. Returns `this`. */
    once<K extends keyof CallManagerEvents>(event: K, listener: CallManagerEvents[K]): this {
        this.manager.once(event, listener)
        return this
    }

    /**
     * Tear down the coordinator: unregister the incoming `<call>` / ack /
     * receipt handlers and destroy all active calls. Invoked by the plugin
     * system on client disconnect; not normally called directly.
     */
    dispose(): void {
        for (const unregister of this.unregisterHandlers.splice(0)) {
            unregister()
        }
        this.manager.destroy()
    }

    private registerIncomingHandlers(ctx: WaClientPluginContext): void {
        this.unregisterHandlers.push(
            ctx.registerIncomingHandler({
                tag: 'call',
                prepend: true,
                handler: async (node) => {
                    const tag = await routeCallStanza(this.manager, this.deps, node, this.logger)
                    return tag !== null
                }
            }),
            ctx.registerIncomingHandler({
                tag: WA_MESSAGE_TAGS.ACK,
                prepend: true,
                handler: async (node) => {
                    if (node.attrs.class !== 'call') {
                        return false
                    }
                    await routeCallAck(this.manager, node)
                    return true
                }
            }),
            ctx.registerIncomingHandler({
                tag: WA_MESSAGE_TAGS.RECEIPT,
                prepend: true,
                handler: async (node) => routeCallReceipt(this.deps, node)
            })
        )
    }

    private wireClientEvents(ctx: WaClientPluginContext): void {
        this.manager.on('call_state', (call) => {
            ctx.emit('voip_call_state', call)
        })
        this.manager.on('call_incoming', (call) => {
            ctx.emit('voip_call_incoming', call)
        })
        this.manager.on('call_ended', (call) => {
            ctx.emit('voip_call_ended', call)
        })
        this.manager.on('call_peer_mute', (call, muted) => {
            ctx.emit('voip_call_peer_mute', { call, muted })
        })
        this.manager.on('call_inbound_audio', (call, pcm) => {
            ctx.emit('voip_call_inbound_audio', { call, pcm })
        })
        this.manager.on('call_inbound_video_rtp', (call, packet) => {
            ctx.emit('voip_call_inbound_video_rtp', { call, packet })
        })
        this.manager.on('call_inbound_video', (call, frame) => {
            ctx.emit('voip_call_inbound_video', { call, frame })
        })
        this.manager.on('call_screen_share', (call, share) => {
            ctx.emit('voip_call_screen_share', { call, share })
        })
        this.manager.on('call_peer_video_state', (call, change) => {
            ctx.emit('voip_call_peer_video_state', { call, change })
        })
        this.manager.on('call_outbound_audio_finished', (call) => {
            ctx.emit('voip_call_outbound_audio_finished', call)
        })
        this.manager.on('call_hand_raise', (call, participantJid, raised) => {
            ctx.emit('voip_call_hand_raise', { call, participantJid, raised })
        })
        this.manager.on('call_reaction', (call, reaction) => {
            ctx.emit('voip_call_reaction', { call, reaction })
        })
        this.manager.on('call_error', (error) => {
            ctx.emit('voip_call_error', error)
        })
    }
}
