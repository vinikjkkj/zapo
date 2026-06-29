import type { CallInfo } from './call/call-state.js'

/**
 * Client events emitted by the voip plugin. Passed as the event-map type
 * argument to {@link defineWaClientPlugin} so they are threaded into
 * `client.on`/`once`/`off`/`emit` only when the plugin is installed.
 */
export interface VoipEvents {
    readonly voip_call_state: (call: CallInfo) => void
    readonly voip_call_incoming: (call: CallInfo) => void
    readonly voip_call_ended: (call: CallInfo) => void
    readonly voip_call_inbound_audio: (payload: {
        readonly call: CallInfo
        readonly pcm: Float32Array
    }) => void
    readonly voip_call_outbound_audio_finished: (call: CallInfo) => void
    readonly voip_call_error: (error: Error) => void
}
