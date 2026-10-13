import type { EventEmitter } from 'node:events'

import type { EndCallReason } from '../types.js'

import type { CallInfo } from './call-state.js'
import type { WaCallMediaSessionDelegate } from './WaCallMediaSession.js'
import type { WaOutOfOrderStanzas } from './WaOutOfOrderStanzas.js'

export interface WaCallReporterOptions {
    /** Read on every event, so a listener or `emit` swapped in later still applies. */
    readonly emitter: Pick<EventEmitter, 'emit' | 'listenerCount'>
    readonly endedCalls: Pick<WaOutOfOrderStanzas, 'rememberEnded'>
    readonly participantAudio: boolean
}

/** Turns what the calls report into the manager's events, keeping unannounced calls silent. */
export class WaCallReporter {
    private readonly emitter: Pick<EventEmitter, 'emit' | 'listenerCount'>
    private readonly endedCalls: Pick<WaOutOfOrderStanzas, 'rememberEnded'>
    private readonly participantAudio: boolean
    /** Calls the app knows of: an outgoing one from its start, an incoming one once announced. */
    private readonly announced = new WeakSet<CallInfo>()

    constructor(options: WaCallReporterOptions) {
        this.emitter = options.emitter
        this.endedCalls = options.endedCalls
        this.participantAudio = options.participantAudio
    }

    markAnnounced(call: CallInfo): void {
        this.announced.add(call)
    }

    announceIncoming(call: CallInfo): void {
        this.announced.add(call)
        this.emitter.emit('call_incoming', call)
    }

    /** The lifecycle of a call the app was never told about stays silent. */
    emitState(call: CallInfo): void {
        if (call.isEnded) this.endedCalls.rememberEnded(call.callId)
        if (!this.announced.has(call)) return
        this.emitter.emit('call_state', call)
    }

    emitEnded(call: CallInfo): void {
        this.endedCalls.rememberEnded(call.callId)
        if (!this.announced.has(call)) return
        this.emitter.emit('call_ended', call)
    }

    /** The delegate one session reports through; `endCall` ends a call through its owner. */
    sessionDelegate(
        endCall: (call: CallInfo, reason: EndCallReason) => void
    ): WaCallMediaSessionDelegate {
        return {
            emitState: (call) => this.emitState(call),
            emitIncoming: (call) => this.announceIncoming(call),
            emitEnded: (call) => this.emitEnded(call),
            emitPeerMute: (call, muted, participantJid) =>
                this.emitter.emit('call_peer_mute', call, muted, participantJid),
            emitInboundAudio: (call, pcm) => this.emitter.emit('call_inbound_audio', call, pcm),
            wantsInboundAudio: () => this.emitter.listenerCount('call_inbound_audio') > 0,
            emitInboundVideoRtp: (call, packet, participantJid) =>
                this.emitter.emit('call_inbound_video_rtp', call, packet, participantJid),
            emitInboundVideo: (call, frame, participantJid) =>
                this.emitter.emit('call_inbound_video', call, frame, participantJid),
            emitOutboundAudioFinished: (call) =>
                this.emitter.emit('call_outbound_audio_finished', call),
            emitHandRaise: (call, participantJid, raised) =>
                this.emitter.emit('call_hand_raise', call, participantJid, raised),
            emitCallReaction: (call, reaction, participantJid) =>
                this.emitter.emit('call_reaction', call, reaction, participantJid),
            emitMuteRequested: (call, participantJid, requestState) =>
                this.emitter.emit('call_mute_requested', call, participantJid, requestState),
            emitParticipantMedia: (call, participantJid, receiving) =>
                this.emitter.emit('call_participant_media', call, participantJid, receiving),
            emitParticipantAudio: this.participantAudio
                ? (call, participantJid, pcm) =>
                      this.emitter.emit('call_participant_audio', call, participantJid, pcm)
                : undefined,
            emitVideoUpgraded: (call, upgraderJid) =>
                this.emitter.emit('call_video_upgraded', call, upgraderJid),
            emitMediaPlan: (call, message) => this.emitter.emit('call_media', call, message),
            emitScreenShare: (call, share, participantJid) =>
                this.emitter.emit('call_screen_share', call, share, participantJid),
            emitPeerVideoState: (call, change, participantJid) =>
                this.emitter.emit('call_peer_video_state', call, change, participantJid),
            emitParticipantsChanged: (call, diff) =>
                this.emitter.emit('call_participants_changed', call, diff),
            emitError: (_call, error) => this.emitter.emit('call_error', error),
            endCall
        }
    }
}
