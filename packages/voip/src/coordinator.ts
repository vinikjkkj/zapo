import type { WaClientPluginContext } from 'zapo-js'
import type { Logger } from 'zapo-js'
import { WA_MESSAGE_TAGS } from 'zapo-js/protocol'
import type { BinaryNode } from 'zapo-js/transport'

import { NativeCallManager } from './call-manager.js'
import { routeCallAck, routeCallReceipt, routeCallStanza } from './bridge.js'
import type { CallInfo } from './call-state.js'
import { createWaVoipSocket } from './socket.js'
import type { CallManagerEvents, CallOfferOptions, EndCallReason } from './types.js'
import type { VoipSocket } from './voip-socket.js'

export interface WaVoipCoordinatorOptions {
    readonly debug?: boolean
}

/**
 * WaClient-facing VOIP coordinator. Owns a {@link NativeCallManager}, registers
 * incoming `<call>` / call-class `<ack>` / call `<receipt>` handlers (prepend,
 * returns `true`) so the core client does not double-ack, and re-emits manager
 * events on the host {@link WaClient}.
 */
export class WaVoipCoordinator {
    private readonly manager: NativeCallManager
    private readonly socket: VoipSocket
    private readonly logger: Logger
    private readonly unregisterHandlers: Array<() => void> = []

    constructor(ctx: WaClientPluginContext, options: WaVoipCoordinatorOptions = {}) {
        this.socket = createWaVoipSocket(ctx)
        this.logger = ctx.logger.child({ scope: '@zapo-js/voip' })
        this.manager = new NativeCallManager({
            sock: this.socket,
            logger: this.logger,
            debug: options.debug ?? false
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

    async endCall(reason?: EndCallReason): Promise<void> {
        return this.manager.endCall(reason)
    }

    async loadAudio(audioPath: string): Promise<void> {
        return this.manager.loadAudio(audioPath)
    }

    setMute(muted: boolean): void {
        this.manager.setMute(muted)
    }

    setExternalAudioMode(enabled: boolean): void {
        this.manager.setExternalAudioMode(enabled)
    }

    feedLiveAudio(data: Float32Array): void {
        this.manager.feedLiveAudio(data)
    }

    getCurrentCall(): CallInfo | null {
        return this.manager.getCurrentCall()
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
                    const tag = await routeCallStanza(this.manager, this.socket, node)
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
                handler: async (node) => routeCallReceipt(this.socket, node)
            })
        )
    }

    private wireClientEvents(ctx: WaClientPluginContext): void {
        this.manager.on('call:state', (call) => {
            ctx.emit('voip_call_state', call)
        })
        this.manager.on('call:incoming', (call) => {
            ctx.emit('voip_call_incoming', call)
        })
        this.manager.on('call:ended', (call) => {
            ctx.emit('voip_call_ended', call)
        })
        this.manager.on('call:audio', (data) => {
            ctx.emit('voip_call_audio', data)
        })
        this.manager.on('call:error', (error) => {
            ctx.emit('voip_call_error', error)
        })
        this.manager.on('signaling:send', (node: BinaryNode) => {
            ctx.emit('voip_signaling_send', node)
        })
    }
}
