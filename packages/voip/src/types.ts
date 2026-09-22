import type { WaClientPluginContext } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import type { CallInfo } from './call/call-state.js'

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
    /**
     * Decoded peer audio for this call (16 kHz mono PCM), paced by the jitter
     * buffer: one tick of `playbackOutputSize` samples every `intervalMs`, so
     * the stream keeps the call's timebase and a gap the decoder could not
     * conceal arrives as silence instead of vanishing. A tick with nothing
     * queued at all is skipped rather than emitted as silence.
     */
    call_inbound_audio: (call: CallInfo, pcm: Float32Array) => void
    call_inbound_video_rtp: (call: CallInfo, packet: InboundVideoRtpPacket) => void
    call_inbound_video: (call: CallInfo, frame: InboundVideoFrame) => void
    /** Preloaded outbound audio finished sending on this call. */
    call_outbound_audio_finished: (call: CallInfo) => void
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
