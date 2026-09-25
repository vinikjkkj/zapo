import type { WaCallReaction } from './app-data/protocol.js'
import type { CallInfo } from './call/call-state.js'
import type { PeerScreenShare } from './signaling/screen-share.js'
import type { InboundVideoFrame, InboundVideoRtpPacket, PeerVideoStateChange } from './types.js'

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
     * The peer announced a change of its own microphone state. Fires once per change; the
     * same value is kept on `call.stateData.peerAudioMuted`.
     */
    readonly voip_call_peer_mute: (payload: {
        readonly call: CallInfo
        readonly muted: boolean
    }) => void
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
    /**
     * The peer reported a screen-share state change. Nothing is answered; a share of our
     * own starts with `client.voip.setScreenShare(callId, true)`. The picture arrives
     * through the regular inbound video events, on the SSRCs of the peer's camera - this
     * event says what that sender is showing.
     */
    readonly voip_call_screen_share: (payload: {
        readonly call: CallInfo
        readonly share: PeerScreenShare
    }) => void
    /**
     * The peer announced a video state change, which is also how it upgrades a voice call
     * to video: there is no separate upgrade stanza. `change.state` is one of
     * `WA_VIDEO_STATE`, carried raw. `UpgradeRequestV2` expects an answer -
     * `client.voip.acceptVideoUpgrade(callId)` or `rejectVideoUpgrade(callId)` within about
     * five seconds, after which the peer withdraws the request itself.
     */
    readonly voip_call_peer_video_state: (payload: {
        readonly call: CallInfo
        readonly change: PeerVideoStateChange
    }) => void
    readonly voip_call_outbound_audio_finished: (call: CallInfo) => void
    /**
     * A participant sent an emoji reaction during a call. Momentary and stateless: nothing
     * is recorded on `CallInfo`, so a missed event cannot be read back.
     */
    readonly voip_call_reaction: (payload: {
        readonly call: CallInfo
        readonly reaction: WaCallReaction
    }) => void
    /**
     * A remote participant raised or lowered its hand. Durable state, so this fires only
     * on a change and the participant stays in `call.raisedHands` until it lowers the hand
     * or the call ends. This side's own state is `call.stateData.handRaised`.
     */
    readonly voip_call_hand_raise: (payload: {
        readonly call: CallInfo
        readonly participantJid: string
        readonly raised: boolean
    }) => void
    readonly voip_call_error: (error: Error) => void
}
