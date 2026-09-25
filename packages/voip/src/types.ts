import type { WaClientPluginContext } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import type { WaCallReaction } from './app-data/protocol.js'
import type { CallInfo } from './call/call-state.js'
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
    DoNotDisturb = 'do_not_disturb',
    Unknown = 'unknown'
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

export interface SrtpKeyingMaterial {
    masterKey: Uint8Array
    masterSalt: Uint8Array
}

export enum PayloadType {
    WhatsAppOpus = 120,
    WhatsAppH264 = 97,
    /**
     * Lowest payload type of WhatsApp's proprietary Reed-Solomon video FEC
     * family, which the client emits as `103 + 3k`. Not an RTX stream: the
     * payload is opaque parity, with no prefix and no original sequence number,
     * and it travels on the FEC stream's own SSRC.
     */
    WhatsAppVideoFec = 103
}

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

/** Options for placing an outgoing call via `client.voip.startCall`. */
export interface CallOfferOptions {
    /** Bare or device JID to call. */
    peerJid: string
    /**
     * Flag the call as a video call (default `false`). When set, H.264 video
     * media flows alongside audio: send access units with
     * {@link WaVoipCoordinator.feedLiveVideo} and receive inbound frames via the
     * `voip_call_inbound_video` event.
     */
    isVideo?: boolean
    /** Audio file to preload and play once the call connects (needs ffmpeg). */
    audioFile?: string
    /** Explicit peer device JIDs to ring; omit to resolve them automatically. */
    peerDevices?: string[]
}

export interface CallManagerEvents {
    call_state: (call: CallInfo) => void
    call_incoming: (call: CallInfo) => void
    call_ended: (call: CallInfo) => void
    /** See `voip_call_peer_mute`. */
    call_peer_mute: (call: CallInfo, muted: boolean) => void
    /** See `voip_call_inbound_audio`. */
    call_inbound_audio: (call: CallInfo, pcm: Float32Array) => void
    call_inbound_video_rtp: (call: CallInfo, packet: InboundVideoRtpPacket) => void
    call_inbound_video: (call: CallInfo, frame: InboundVideoFrame) => void
    /** The peer reported a screen-share state change on this call. */
    call_screen_share: (call: CallInfo, share: PeerScreenShare) => void
    /** See `voip_call_peer_video_state`. */
    call_peer_video_state: (call: CallInfo, change: PeerVideoStateChange) => void
    /** Preloaded outbound audio finished sending on this call. */
    call_outbound_audio_finished: (call: CallInfo) => void
    /** See `voip_call_hand_raise`. */
    call_hand_raise: (call: CallInfo, participantJid: string, raised: boolean) => void
    /** See `voip_call_reaction`. */
    call_reaction: (call: CallInfo, reaction: WaCallReaction) => void
    call_error: (error: Error) => void
}

export interface AudioSender {
    sendCapturedAudio(data: Float32Array): void
}

export interface WaAudioEngineConfig {
    sampleRate: number
    /** Samples read from the outbound source on every capture tick. */
    captureChunkSize: number
    /**
     * Samples drained from the jitter buffer on every playback tick. Keep it at
     * `sampleRate / 1000 * intervalMs` so playout advances at wall-clock speed:
     * the engine raises it to one tick's worth when it is set lower.
     */
    playbackOutputSize: number
    /**
     * Jitter buffer capacity in samples. Never smaller than one inbound packet,
     * which is 120 ms carrying two aggregated MLow frames.
     */
    maxBufferSize: number
    intervalMs: number
}

export const DEFAULT_AUDIO_CONFIG: WaAudioEngineConfig = {
    sampleRate: 16000,
    captureChunkSize: 960,
    playbackOutputSize: 960,
    maxBufferSize: 11520,
    intervalMs: 60
}

export const SRTP_SEND_AUTH_TAG_LEN = 4
export const SRTP_RECV_AUTH_TAG_LEN = 4

export const SRTP_AUTH_TAG_LEN = 4

export const SRTP_LABEL = {
    ENCRYPTION: 0x00,
    AUTH: 0x01,
    SALT: 0x02
} as const

export const WA_RELAY_PORT = 3480

export const WA_DTLS_FINGERPRINT =
    'sha-256 F9:CA:0C:98:A3:CC:71:D6:42:CE:5A:E2:53:D2:15:20:D3:1B:BA:D8:57:A4:F0:AF:BE:0B:FB:F3:6B:0C:A0:68'
