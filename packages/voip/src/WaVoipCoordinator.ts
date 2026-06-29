import { type Logger, type LogLevel, type WaClientPluginContext } from 'zapo-js'
import { WA_MESSAGE_TAGS } from 'zapo-js/protocol'

import type { CallInfo } from './call/call-state.js'
import { WaCallManager } from './call/WaCallManager.js'
import { routeCallAck, routeCallReceipt, routeCallStanza } from './signaling/bridge.js'
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
            maxConcurrentCalls: options.maxConcurrentCalls
        })
        this.registerIncomingHandlers(ctx)
        this.wireClientEvents(ctx)
    }

    async startCall(options: CallOfferOptions): Promise<string> {
        return this.manager.startCall(options)
    }

    async acceptCall(callId: string): Promise<void> {
        return this.manager.acceptCall(callId)
    }

    async rejectCall(callId: string, reason?: EndCallReason): Promise<void> {
        return this.manager.rejectCall(callId, reason)
    }

    async endCall(callId: string, reason?: EndCallReason): Promise<void> {
        return this.manager.endCall(callId, reason)
    }

    async loadAudio(callId: string, audioPath: string): Promise<void> {
        return this.manager.loadAudio(callId, audioPath)
    }

    setMute(callId: string, muted: boolean): void {
        this.manager.setMute(callId, muted)
    }

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

    getCall(callId: string): CallInfo | null {
        return this.manager.getCall(callId)
    }

    getCalls(): readonly CallInfo[] {
        return this.manager.getCalls()
    }

    on<K extends keyof CallManagerEvents>(event: K, listener: CallManagerEvents[K]): this {
        this.manager.on(event, listener)
        return this
    }

    off<K extends keyof CallManagerEvents>(event: K, listener: CallManagerEvents[K]): this {
        this.manager.off(event, listener)
        return this
    }

    once<K extends keyof CallManagerEvents>(event: K, listener: CallManagerEvents[K]): this {
        this.manager.once(event, listener)
        return this
    }

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
        this.manager.on('call_inbound_audio', (call, pcm) => {
            ctx.emit('voip_call_inbound_audio', { call, pcm })
        })
        this.manager.on('call_outbound_audio_finished', (call) => {
            ctx.emit('voip_call_outbound_audio_finished', call)
        })
        this.manager.on('call_error', (error) => {
            ctx.emit('voip_call_error', error)
        })
    }
}
