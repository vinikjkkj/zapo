import type { WaClientPluginContext } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import type { WaCallMediaMessage, WaCallReaction } from '@zapo-js/voip-media'

import type { CallInfo } from './call/call-state.js'
import type { WaGroupCompositionDiff } from './call/group-participants.js'
import type { PeerScreenShare } from './signaling/screen-share.js'

export type WaVoipDeps = WaClientPluginContext['deps']

export type WaVoipStores = WaClientPluginContext['stores']

export enum CallState {
    Initiating = 'initiating',
    Ringing = 'ringing',
    IncomingRinging = 'incoming_ringing',
    Connecting = 'connecting',
    Active = 'active',
    OnHold = 'on_hold',
    Ended = 'ended'
}

export enum CallDirection {
    Outgoing = 'outgoing',
    Incoming = 'incoming'
}

export enum CallMediaType {
    Audio = 'audio',
    Video = 'video'
}

export enum EndCallReason {
    UserEnded = 'user_ended',
    Declined = 'declined',
    Timeout = 'timeout',
    Busy = 'busy',
    Cancelled = 'cancelled',
    Failed = 'failed',
    /** The call had a media path and lost it, with no leg left to carry it. */
    RelayLost = 'relay_lost',
    /** The server refused our offer; the peers were told `setup_failed`. */
    SetupFailed = 'setup_failed',
    /**
     * The server took this side off a group call that goes on, because the others stopped
     * receiving its media (`user_invisible`). It can be joined again with `joinCall`.
     */
    Invisible = 'invisible',
    DoNotDisturb = 'do_not_disturb',
    Unknown = 'unknown',
    /** Another device of this account answered the incoming call. */
    AcceptedElsewhere = 'accepted_elsewhere',
    /** Another device of this account declined the incoming call. */
    RejectedElsewhere = 'rejected_elsewhere'
}

export type CallTransition =
    | { type: 'offer_sent' }
    | { type: 'offer_received'; silenced?: boolean }
    | { type: 'local_accepted' }
    | { type: 'remote_accepted' }
    | { type: 'local_rejected'; reason: EndCallReason }
    | { type: 'remote_rejected'; reason: EndCallReason }
    | { type: 'media_connected' }
    | { type: 'terminated'; reason: EndCallReason }
    | { type: 'hold' }
    | { type: 'resume' }
    | { type: 'audio_mute_changed'; muted: boolean }
    | { type: 'video_state_changed'; off: boolean }
    | { type: 'hand_raise_changed'; raised: boolean }
    | { type: 'screen_share_changed'; sharing: boolean }

export interface InboundVideoRtpPacket {
    readonly payloadType: number
    readonly sequenceNumber: number
    readonly timestamp: number
    readonly ssrc: number
    readonly marker: boolean
    /** Decrypted RTP payload of the inbound H.264 stream, payload type 97. */
    readonly payload: Uint8Array
}

export interface InboundVideoFrame {
    readonly codec: 'h264'
    /**
     * SSRC of the stream this frame was assembled from, so frames of two senders never
     * mix. It does **not** separate a peer's camera from its screen: a share derives the
     * same SSRCs its camera does, and {@link CallInfo.peerScreenShare} is what says the
     * peer is sharing.
     */
    readonly ssrc: number
    readonly timestamp: number
    readonly keyFrame: boolean
    /** Complete Annex-B access unit. */
    readonly data: Uint8Array
}

export interface RtpConfig {
    ssrc: number
    payloadType: number
    sampleRate: number
    samplesPerPacket: number
}

export interface RelayInfo {
    id: string
    ip: string
    port: number
    token: string
    authToken?: string
    key: string
    relayId: number
    name?: string
}

export interface RelayEndpoint {
    ip: string
    port: number
    /** `token_id` of the endpoint: which `<token>` of its own descriptor {@link token} is. */
    tokenId?: string
    token: string
    authToken?: string
    rawAuthToken?: Uint8Array
    rawToken?: Uint8Array
    key: string
    relayId: number
    protocol?: number
    c2rRtt?: number
    relayName?: string
    addressBytes?: Uint8Array
    authTokenId?: string
    /**
     * `is_fna` of the endpoint. Informational: nothing in this package routes
     * on it, and the server often omits it. One FNA relay was measured
     * accepting an allocate and answering every keepalive while forwarding no
     * media at all.
     */
    isFna?: boolean
    /** `domain_name` of the `<relay>` descriptor this endpoint came from. */
    domainName?: string
    /** `enable_edgeray_dtls_active_mode` flag of the same descriptor. */
    enableEdgerayDtlsActiveMode?: boolean
}

export interface RelayData {
    endpoints: RelayEndpoint[]
    participantJids?: string[]
    uuid?: string
    selfPid?: number
    peerPid?: number
    /**
     * `<hbh_key>` of the relay descriptor, 30 bytes. Parsed and kept, with no
     * consumer: on the WebRTC path DTLS protects the hop, so no hop-by-hop
     * SRTP is derived from this anywhere.
     *
     * The raw UDP transport has no DTLS under it and puts the end-to-end SRTP
     * on the wire unchanged. That was measured to be enough: over a call
     * carried entirely by raw legs, all 3185 inbound RTP packets authenticated
     * and decoded to audio, both through the live session and through a twin
     * built from the same keys, with no `auth_failed`. So the relay adds no
     * hop-by-hop layer of its own, and none is owed here.
     *
     * Nor on a group call's uplink, measured A/B with two runs per arm: wrapped
     * in the hop-by-hop layer, the other participants counted 0 of our packets
     * and dropped us to `invited`; unwrapped, they counted 1916 and 3818 and kept
     * us connected. SRTP leaves the RTP header in the clear, so the SFU routes
     * without it. Do not apply it on send.
     */
    hbhKey?: Uint8Array
}

export interface CallStateData {
    state: CallState
    connectedAt?: Date
    audioMuted: boolean
    videoOff: boolean
    silenced?: boolean
    acceptBlocked?: boolean
}

export interface CallSession {
    callId: string
    peerJid: string
    callCreator: string
    direction: CallDirection
    mediaType: CallMediaType
    state: CallStateData
    createdAt: Date
    groupJid?: string
    isOffline: boolean
    callerPn?: string
    encryptionKey?: Uint8Array
    relayData?: RelayData
    isInitiator: boolean
}

/**
 * Video state the peer announced mid-call. `state` is the raw wire number, the ordinal of
 * `WA_VIDEO_STATE` with no translation, kept raw so a code this package does not model
 * yet still reaches the consumer.
 */
export interface PeerVideoStateChange {
    /** `state`, one of `WA_VIDEO_STATE`. */
    readonly state: number
    /** Raw `transaction-id`, the sender's own counter from 1. `null` when absent. */
    readonly transactionId: number | null
    /** Raw `device_orientation` attribute, or `null` when absent. */
    readonly deviceOrientation: number | null
    /** Codecs the peer can decode, from `dec`. `null` when the message omitted it. */
    readonly decoderCodec: string | null
    /**
     * The codec the peer's encoder produces, from `enc` - not {@link decoderCodec}: one
     * says what the peer sends, the other what it receives.
     */
    readonly encoderCodec: string | null
    /**
     * `enc_supported`, the peer's decode capability as a bitmask over the codecs
     * {@link decoderCodec} names in text. Only sent when non-zero, so `null` means the
     * peer left it off, not that it supports nothing.
     */
    readonly supportedCodecs: number | null
}

export interface NodeInfo {
    tag: string
    peerJid: string
    callId: string
    peerPlatform: string
    peerAppVersion: string
    epochId?: string
    timestamp?: string
    innerNode: BinaryNode
}

/** One participant of an outgoing group call. */
export interface CallOfferParticipant {
    /** The account to ring, a LID. */
    readonly jid: string
    /** Its device JIDs, at most five; omit to resolve them, falling back to the primary. */
    readonly devices?: readonly string[]
}

/** What a 1:1 and a group call offer share. */
interface CallOfferCommonOptions {
    /**
     * Flag the call as a video call (default `false`). When set, H.264 video
     * media flows alongside audio: send access units with
     * {@link WaVoipCoordinator.feedLiveVideo} and receive inbound frames via the
     * `voip_call_inbound_video` event.
     */
    isVideo?: boolean
    /** Audio file to preload and play once the call connects (needs ffmpeg). */
    audioFile?: string
}

/** A 1:1 call to {@link peerJid}. */
export interface OneToOneCallOfferOptions extends CallOfferCommonOptions {
    /** Bare or device JID to call. */
    peerJid: string
    /** Explicit peer device JIDs to ring; omit to resolve them automatically. */
    peerDevices?: string[]
    groupJid?: never
    participants?: never
}

/** A group call on {@link groupJid}, addressed to the call itself and ringing {@link participants}. */
export interface GroupCallOfferOptions extends CallOfferCommonOptions {
    /** The group (`...@g.us`) this call belongs to. */
    groupJid: string
    /** Who to ring, ourselves excluded. */
    participants: readonly CallOfferParticipant[]
    peerJid?: never
    peerDevices?: never
}

/** Options for placing an outgoing call via `client.voip.startCall`: 1:1 or group, never both. */
export type CallOfferOptions = OneToOneCallOfferOptions | GroupCallOfferOptions

/** One sender's video asked of a group call's relay; see `client.voip.setVideoSubscriptions`. */
export interface CallVideoSubscription {
    /** The sender's device jid, as the events name it. */
    readonly participantJid: string
    /** One of `WA_VIDEO_QUALITY`; `Default` when omitted. */
    readonly quality?: number
}

/** The trailing `participantJid` names the device it came from, when known. */
export interface CallManagerEvents {
    call_state: (call: CallInfo) => void
    call_incoming: (call: CallInfo) => void
    call_ended: (call: CallInfo) => void
    /** See `voip_call_peer_mute`. */
    call_peer_mute: (call: CallInfo, muted: boolean, participantJid?: string) => void
    /** See `voip_call_inbound_audio`. */
    call_inbound_audio: (call: CallInfo, pcm: Float32Array) => void
    call_inbound_video_rtp: (
        call: CallInfo,
        packet: InboundVideoRtpPacket,
        participantJid?: string
    ) => void
    call_inbound_video: (call: CallInfo, frame: InboundVideoFrame, participantJid?: string) => void
    /** The peer reported a screen-share state change on this call. */
    call_screen_share: (call: CallInfo, share: PeerScreenShare, participantJid?: string) => void
    /** See `voip_call_peer_video_state`. */
    call_peer_video_state: (
        call: CallInfo,
        change: PeerVideoStateChange,
        participantJid?: string
    ) => void
    /** See `voip_call_participants_changed`. */
    call_participants_changed: (call: CallInfo, diff: WaGroupCompositionDiff) => void
    /** Preloaded outbound audio finished sending on this call. */
    call_outbound_audio_finished: (call: CallInfo) => void
    /** See `voip_call_hand_raise`. */
    call_hand_raise: (call: CallInfo, participantJid: string, raised: boolean) => void
    /** See `voip_call_reaction`. */
    call_reaction: (call: CallInfo, reaction: WaCallReaction, participantJid?: string) => void
    /** See `voip_call_mute_requested`. */
    call_mute_requested: (call: CallInfo, participantJid: string, requestState: string) => void
    /** See `voip_call_participant_media`. */
    call_participant_media: (call: CallInfo, participantJid: string, receiving: boolean) => void
    /** See `voip_call_participant_audio`; only with `participantAudio` on. */
    call_participant_audio: (call: CallInfo, participantJid: string, pcm: Float32Array) => void
    /** See `voip_call_video_upgraded`. */
    call_video_upgraded: (call: CallInfo, participantJid: string | null) => void
    /** See `voip_call_media`. */
    call_media: (call: CallInfo, message: WaCallMediaMessage) => void
    call_error: (error: Error) => void
}

export interface AudioSender {
    /**
     * Takes one captured chunk, its first sample captured at `capturedAtMs` (`performance.now()`).
     * `data` is the engine's reused buffer: consume or copy it before returning.
     */
    sendCapturedAudio(data: Float32Array, capturedAtMs?: number): void
}

export interface WaAudioEngineConfig {
    sampleRate: number
    /** Samples per chunk read from the outbound source; a tick moves as many as time owes. */
    captureChunkSize: number
    /**
     * Samples per block pulled from the playout source, as many blocks per tick as time owes.
     * Raised to one tick's worth (`sampleRate / 1000 * intervalMs`) when set lower.
     */
    playbackOutputSize: number
    /**
     * How often both clocks check what they owe. The audio is paced by
     * elapsed time, not by how many ticks fired.
     */
    intervalMs: number
}

export const DEFAULT_AUDIO_CONFIG: WaAudioEngineConfig = {
    sampleRate: 16000,
    captureChunkSize: 960,
    playbackOutputSize: 960,
    intervalMs: 60
}

export const WA_RELAY_PORT = 3480

export const WA_DTLS_FINGERPRINT =
    'sha-256 F9:CA:0C:98:A3:CC:71:D6:42:CE:5A:E2:53:D2:15:20:D3:1B:BA:D8:57:A4:F0:AF:BE:0B:FB:F3:6B:0C:A0:68'
