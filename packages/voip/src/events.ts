import type { CallInfo } from './call/call-state.js'
import type { InboundVideoFrame, InboundVideoRtpPacket } from './types.js'

/**
 * Client events emitted by the voip plugin. Passed as the event-map type
 * argument to {@link defineWaClientPlugin} so they are threaded into
 * `client.on`/`once`/`off`/`emit` only when the plugin is installed.
 */
export interface VoipEvents {
    readonly voip_call_state: (call: CallInfo) => void
    readonly voip_call_incoming: (call: CallInfo) => void
    readonly voip_call_ended: (call: CallInfo) => void
    /**
     * Decoded peer audio (16 kHz mono PCM), paced by the jitter buffer at one
     * 60 ms tick of 960 samples. Concealed loss and buffer underrun arrive as
     * audio and silence respectively, so the stream keeps the call's timebase;
     * a tick with nothing queued at all is skipped instead.
     */
    readonly voip_call_inbound_audio: (payload: {
        readonly call: CallInfo
        readonly pcm: Float32Array
    }) => void
    readonly voip_call_inbound_video_rtp: (payload: {
        readonly call: CallInfo
        readonly packet: InboundVideoRtpPacket
    }) => void
    readonly voip_call_inbound_video: (payload: {
        readonly call: CallInfo
        readonly frame: InboundVideoFrame
    }) => void
    readonly voip_call_outbound_audio_finished: (call: CallInfo) => void
    readonly voip_call_error: (error: Error) => void
}
