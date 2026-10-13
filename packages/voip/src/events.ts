import type { WaCallMediaMessage, WaCallReaction } from '@zapo-js/voip-media'

import type { CallInfo } from './call/call-state.js'
import type { WaGroupCompositionDiff } from './call/group-participants.js'
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
     * A participant announced a change of its own microphone state. Fires once per change.
     * On a 1:1 call the same value is kept on `call.stateData.peerAudioMuted`.
     */
    readonly voip_call_peer_mute: (payload: {
        readonly call: CallInfo
        readonly muted: boolean
        /** The device that announced it. */
        readonly participantJid?: string
    }) => void
    /**
     * A participant of a group call asked this side to mute. Nothing is applied: mute with
     * `client.voip.setMute(callId, true)` to comply. `requestState` is raw, `'1'` to mute.
     */
    readonly voip_call_mute_requested: (payload: {
        readonly call: CallInfo
        readonly participantJid: string
        readonly requestState: string
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
    /**
     * Decoded audio of one group-call participant, before the mix `voip_call_inbound_audio`
     * carries. Only with the `participantAudio` option on.
     */
    readonly voip_call_participant_audio: (payload: {
        readonly call: CallInfo
        readonly participantJid: string
        readonly pcm: Float32Array
    }) => void
    /**
     * A group-call participant's media started (`receiving: true`) or stopped arriving.
     * Fires on a change only, judged locally from the packets received.
     */
    readonly voip_call_participant_media: (payload: {
        readonly call: CallInfo
        readonly participantJid: string
        readonly receiving: boolean
    }) => void
    /** `participantJid` is the device that sent the video, when known. */
    readonly voip_call_inbound_video_rtp: (payload: {
        readonly call: CallInfo
        readonly packet: InboundVideoRtpPacket
        readonly participantJid?: string
    }) => void
    /** `participantJid` is the device that sent the video, when known. */
    readonly voip_call_inbound_video: (payload: {
        readonly call: CallInfo
        readonly frame: InboundVideoFrame
        readonly participantJid?: string
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
        /** The device that reported it. */
        readonly participantJid?: string
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
        /** The device that announced it. */
        readonly participantJid?: string
    }) => void
    /**
     * A participant turned this group call into a video call; `call.mediaType` is now video.
     * Nothing to answer: turn the camera on with `client.voip.setVideoEnabled(callId, true)`.
     * `participantJid` is `null` when the server did not name who.
     */
    readonly voip_call_video_upgraded: (payload: {
        readonly call: CallInfo
        readonly participantJid: string | null
    }) => void
    /**
     * Who joined a group call, left it or moved to another device, from a `group_update` roster
     * or one participant's `<terminate>`. `call.groupComposition` is the composition after it.
     */
    readonly voip_call_participants_changed: (payload: {
        readonly call: CallInfo
        readonly diff: WaGroupCompositionDiff
    }) => void
    readonly voip_call_outbound_audio_finished: (call: CallInfo) => void
    /**
     * A participant sent an emoji reaction during a call. Momentary and stateless: nothing
     * is recorded on `CallInfo`, so a missed event cannot be read back.
     */
    readonly voip_call_reaction: (payload: {
        readonly call: CallInfo
        readonly reaction: WaCallReaction
        /** The device that sent it, when the media host can tell. */
        readonly participantJid?: string
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
    /**
     * A media plan change for the remote host (`media: { mode: 'remote' }`), to send in order
     * via `encodeCallMediaMessage`. Carries SRTP keys and relay credentials: keep it private.
     */
    readonly voip_call_media: (payload: {
        readonly call: CallInfo
        readonly message: WaCallMediaMessage
    }) => void
    readonly voip_call_error: (error: Error) => void
}
